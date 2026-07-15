// Estimate als server-side PDF (B5, stap 9) met pdf-lib + StandardFonts (Helvetica).
// A4 staand, functioneel net: kop, regels in aanvraagvolgorde (zones als groepskoppen),
// afwijkingsnotities als subregel, totalen per kleur + eindtotaal, p.m.-sectie.
// Prijzen = bruto adviesprijs (bewust besluit B5: kortingen horen bij de offerte, buiten
// de tool). Er staat geen logo-asset in public/ — daarom een tekstkop "Brink Licht";
// zodra er een PNG/JPG-logo ligt kan die hier via embedPng worden opgenomen.
import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
  type RGB,
} from "pdf-lib";
import { STATUS } from "@/components/dossier/status";
import type { MatchStatus } from "@/components/dossier/status";
import { formatEur } from "@/lib/format";
import {
  countedLineTotal,
  countsInTotal,
  notableDeviations,
  requestedText,
  type EstimateData,
  type EstimateLine,
} from "@/lib/repo/estimate";

// ── Layout-constanten (A4 staand, punten) ────────────────────────────────────
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const FOOTER_ZONE = 30; // gereserveerd voor paginanummers

// Kolommen (taak: code, omschrijving/merk+type, aantal, status, stukprijs, regeltotaal).
const COL = {
  code: { x: MARGIN, w: 56 },
  name: { x: MARGIN + 62, w: 202 },
  qtyRight: MARGIN + 62 + 202 + 34, // rechts uitgelijnd
  status: { x: MARGIN + 62 + 202 + 42, w: 44 },
  priceRight: MARGIN + 62 + 202 + 42 + 44 + 58,
  totalRight: MARGIN + CONTENT_W,
} as const;

const INK = rgb(0.13, 0.14, 0.16);
const MUTED = rgb(0.45, 0.47, 0.51);
const LINE = rgb(0.84, 0.85, 0.87);

// Statuskleuren als rustige inkttinten (badge-taal overal gelijk, ook op papier).
const STATUS_COLOR: Record<MatchStatus, RGB> = {
  open: MUTED,
  groen: rgb(0.02, 0.55, 0.38),
  geel: rgb(0.75, 0.51, 0.05),
  blauw: rgb(0.04, 0.51, 0.72),
  rood: rgb(0.82, 0.26, 0.35),
  paars: rgb(0.53, 0.36, 0.83),
};

// pdf-lib's StandardFonts kunnen alleen WinAnsi aan. Onbekende tekens worden "?" in
// plaats van een crash; de nl-NL-valutaspaties (NBSP/narrow) worden gewone spaties.
function makeSanitizer(font: PDFFont): (s: string) => string {
  const supported = new Set(font.getCharacterSet());
  return (s: string) =>
    [...s.replace(/[\u00A0\u202F\u2007\u2009]/g, " ")]
      .map((ch) => (supported.has(ch.codePointAt(0) as number) ? ch : "?"))
      .join("");
}

// EUR in nl-NL (zelfde formatter als het scherm), WinAnsi-veilig gemaakt door de caller.
function eur(value: number | string | null): string {
  return formatEur(value);
}

export async function renderEstimatePdf(data: EstimateData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const clean = makeSanitizer(regular);

  const { header, computed } = data;
  const { totals, pm, groups, hasZones } = computed;

  doc.setTitle(`Estimate ${computed.quoteNumberDisplay} — ${data.dossier.name}`);

  let page: PDFPage;
  let y = 0;

  const text = (
    s: string,
    x: number,
    opts: { font?: PDFFont; size?: number; color?: RGB } = {},
  ) => {
    page.drawText(clean(s), {
      x,
      y,
      size: opts.size ?? 9,
      font: opts.font ?? regular,
      color: opts.color ?? INK,
    });
  };

  const textRight = (
    s: string,
    rightX: number,
    opts: { font?: PDFFont; size?: number; color?: RGB } = {},
  ) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 9;
    const w = font.widthOfTextAtSize(clean(s), size);
    text(s, rightX - w, opts);
  };

  const hline = (fromX: number, toX: number, color: RGB = LINE) => {
    page.drawLine({
      start: { x: fromX, y: y },
      end: { x: toX, y: y },
      thickness: 0.6,
      color,
    });
  };

  // Lange teksten afbreken met een ellipsis zodra ze de kolom niet meer passen.
  const fit = (s: string, maxW: number, font: PDFFont, size: number): string => {
    const t = clean(s);
    if (font.widthOfTextAtSize(t, size) <= maxW) return t;
    const ell = "…";
    let cut = t;
    while (cut.length > 0 && font.widthOfTextAtSize(cut.trimEnd() + ell, size) > maxW) {
      cut = cut.slice(0, -1);
    }
    return cut.trimEnd() + ell;
  };

  // Eenvoudige word-wrap voor de voettekst.
  const wrap = (s: string, maxW: number, font: PDFFont, size: number): string[] => {
    const words = clean(s).split(/\s+/);
    const out: string[] = [];
    let cur = "";
    for (const w of words) {
      const probe = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(probe, size) > maxW && cur) {
        out.push(cur);
        cur = w;
      } else {
        cur = probe;
      }
    }
    if (cur) out.push(cur);
    return out;
  };

  // Kolomkoppen — herhaald op elke vervolgpagina (meerpaginasteun).
  const drawTableHead = () => {
    const opts = { font: bold, size: 7.5, color: MUTED };
    text("Code", COL.code.x, opts);
    text("Description", COL.name.x, opts);
    textRight("Quantity", COL.qtyRight, opts);
    text("Status", COL.status.x, opts);
    textRight("Unit price", COL.priceRight, opts);
    textRight("Line total", COL.totalRight, opts);
    y -= 5;
    hline(MARGIN, PAGE_W - MARGIN);
    y -= 12;
  };

  let inTable = false;
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
    if (inTable) drawTableHead();
  };
  // Nieuwe pagina zodra de gevraagde hoogte niet meer past.
  const need = (h: number) => {
    if (y - h < MARGIN + FOOTER_ZONE) newPage();
  };

  newPage();

  // ── Kop ────────────────────────────────────────────────────────────────────
  text("Brink Licht", MARGIN, { font: bold, size: 15 });
  textRight("ESTIMATE", PAGE_W - MARGIN, { font: bold, size: 10, color: MUTED });
  y -= 20;
  text(data.dossier.name, MARGIN, { font: bold, size: 12 });
  y -= 18;

  // Kopblok-velden in twee rijen van drie (zelfde velden als het scherm).
  const fields: [string, string][] = [
    ["Quote number", computed.quoteNumberDisplay],
    ["Date", header.quoteDate ?? "—"],
    ["Valid until", header.validUntil ?? "—"],
    ["Customer", header.customer ?? "—"],
    ["Project", header.projectRef ?? "—"],
    ["Author", header.author ?? "—"],
  ];
  const colW = CONTENT_W / 3;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const [label, value] = fields[row * 3 + col];
      const x = MARGIN + col * colW;
      text(label, x, { size: 7, color: MUTED });
      const saved = y;
      y -= 10;
      text(fit(value, colW - 10, regular, 9), x, { size: 9 });
      y = saved;
    }
    y -= 24;
  }
  y += 2;
  hline(MARGIN, PAGE_W - MARGIN);
  y -= 16;

  // ── Regels (aanvraagvolgorde is heilig; zones als groepskoppen) ─────────────
  if (data.lines.length === 0) {
    text("No spec lines in this project yet.", MARGIN, { color: MUTED });
    y -= 14;
  } else {
    inTable = true;
    drawTableHead();

    for (const group of groups) {
      if (hasZones) {
        need(26);
        text(`ZONE ${group.zone ?? "—"}`, MARGIN, {
          font: bold,
          size: 7.5,
          color: MUTED,
        });
        y -= 13;
      }

      for (const { line } of group.lines) {
        const notable = notableDeviations(line);
        // B3: het auto-door-label deelt de subregel met de afwijkingsnotitie.
        // Stap 7: idem voor het merkteken "handmatig gekozen".
        const hasSubLine =
          notable.length > 0 || !!line.autoAccepted || !!line.manuallyChosen;
        const rowH = 13 + (hasSubLine ? 10 : 0);
        need(rowH);

        const counting = countsInTotal(line.status);
        const displayName = line.productName ?? (requestedText(line) || "—");

        text(fit(line.fixtureCode, COL.code.w, bold, 8.5), COL.code.x, {
          font: bold,
          size: 8.5,
        });
        text(fit(displayName, COL.name.w, regular, 8.5), COL.name.x, { size: 8.5 });
        textRight(line.quantity != null ? String(line.quantity) : "—", COL.qtyRight, {
          size: 8.5,
          color: line.quantity != null ? INK : MUTED,
        });
        text(STATUS[line.status].word, COL.status.x, {
          size: 8,
          color: STATUS_COLOR[line.status],
        });
        textRight(line.unitPrice != null ? eur(line.unitPrice) : "—", COL.priceRight, {
          size: 8.5,
          color: line.unitPrice != null ? INK : MUTED,
        });
        // Regeltotaal: p.m. voor niet-tellende statussen, p/st bij ontbrekend aantal.
        const lineTotal = countedLineTotal(line);
        if (!counting) {
          textRight("p.m.", COL.totalRight, { size: 8.5, color: MUTED });
        } else if (line.quantity == null) {
          textRight("p/st", COL.totalRight, { size: 8.5, color: MUTED });
        } else if (lineTotal == null) {
          textRight("—", COL.totalRight, { size: 8.5, color: MUTED });
        } else {
          textRight(eur(lineTotal), COL.totalRight, { size: 8.5 });
        }
        y -= 10;

        // Afwijkingsnotities (C-07) als kleinere subregel onder de rij — óók binnen
        // groen. B3: het label "automatisch geaccepteerde bijna-match" erachteraan.
        if (hasSubLine) {
          const parts: string[] = [];
          if (notable.length > 0)
            parts.push(`deviation: ${notable.map((d) => d.note).join(" · ")}`);
          if (line.autoAccepted) parts.push("automatically accepted near-match");
          if (line.manuallyChosen) parts.push("manually chosen");
          const note = parts.join(" — ");
          text(fit(note, CONTENT_W - (COL.name.x - MARGIN), regular, 7.5), COL.name.x, {
            size: 7.5,
            color: MUTED,
          });
          y -= 10;
        }
        y -= 3;
      }

      // Zone-subtotaal (alleen als er in deze zone iets meetelt).
      if (hasZones && group.lines.some((nl) => countedLineTotal(nl.line) != null)) {
        need(14);
        textRight(`Subtotal zone ${group.zone ?? "—"}   ${eur(group.subtotal)}`, COL.totalRight, {
          size: 7.5,
          color: MUTED,
        });
        y -= 12;
      }
    }
    inTable = false;
  }

  // ── Totalen per kleur + eindtotaal (E-02) ────────────────────────────────────
  if (data.lines.length > 0) {
    need(70);
    y -= 4;
    const labelX = COL.totalRight - 190;
    hline(labelX, PAGE_W - MARGIN);
    y -= 14;
    text("Green", labelX, { size: 9, color: MUTED });
    textRight(eur(totals.groen), COL.totalRight, { size: 9 });
    y -= 13;
    text("Yellow", labelX, { size: 9, color: MUTED });
    textRight(eur(totals.geel), COL.totalRight, { size: 9 });
    y -= 8;
    hline(labelX, PAGE_W - MARGIN);
    y -= 13;
    text("Combined (green + yellow)", labelX, { font: bold, size: 9.5 });
    textRight(eur(totals.samen), COL.totalRight, { font: bold, size: 9.5 });
    y -= 13;
    if (pm.total > 0) {
      textRight(
        `Shown, not totaled (blue ${pm.blauw} · red ${pm.rood} · purple ${pm.paars}) — p.m.`,
        COL.totalRight,
        { size: 7.5, color: MUTED },
      );
      y -= 12;
    }
  }

  // ── p.m.-sectie: open punten & acties (niets wordt stilzwijgend weggelaten) ──
  const { blauwLines, roodLines, paarsLines, brandFreq } = computed;
  if (blauwLines.length > 0 || roodLines.length > 0 || paarsLines.length > 0) {
    need(30);
    y -= 8;
    text("Open items & actions (p.m.)", MARGIN, { font: bold, size: 9.5 });
    y -= 14;

    const pmItem = (line: EstimateLine, label: string, color: RGB) => {
      need(12);
      page.drawCircle({ x: MARGIN + 3, y: y + 2.5, size: 2.2, color });
      text(
        fit(`${line.fixtureCode} — ${label}`, CONTENT_W - 14, regular, 8.5),
        MARGIN + 10,
        { size: 8.5 },
      );
      y -= 12;
    };
    for (const l of blauwLines) {
      pmItem(
        l,
        `load brand ${(l.brandText ?? "").trim() || "unknown"} (us)`,
        STATUS_COLOR.blauw,
      );
    }
    for (const l of roodLines) {
      pmItem(l, "back to customer (brand known, this product not)", STATUS_COLOR.rood);
    }
    for (const l of paarsLines) {
      pmItem(
        l,
        `outside assortment${requestedText(l) ? ` — ${requestedText(l)}` : ""} (reported explicitly, p.m.)`,
        STATUS_COLOR.paars,
      );
    }

    if (brandFreq.length > 0) {
      need(14 + brandFreq.length * 11);
      y -= 4;
      text("Load brands (us)", MARGIN, { size: 7.5, color: MUTED, font: bold });
      y -= 11;
      for (const [brand, n] of brandFreq) {
        need(11);
        text(fit(`${brand} — ${n}×`, CONTENT_W, regular, 8.5), MARGIN, { size: 8.5 });
        y -= 11;
      }
    }
  }

  // ── Voettekst (zelfde uitleg als op het scherm) ──────────────────────────────
  const disclaimer =
    "Gross prices excl. VAT from valid price lists. Only green and yellow count; " +
    "blue, red and purple are shown as p.m. — displayed, not totaled. Request order is preserved.";
  const discLines = wrap(disclaimer, CONTENT_W, regular, 7.5);
  need(10 + discLines.length * 10);
  y -= 8;
  for (const l of discLines) {
    text(l, MARGIN, { size: 7.5, color: MUTED });
    y -= 10;
  }

  // ── Paginanummers (tweede ronde, als het totaal bekend is) ───────────────────
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = clean(`Page ${i + 1} of ${pages.length}`);
    p.drawText(label, {
      x: PAGE_W - MARGIN - regular.widthOfTextAtSize(label, 7),
      y: MARGIN - 18,
      size: 7,
      font: regular,
      color: MUTED,
    });
    const brand = clean(`Brink Licht · Estimate ${computed.quoteNumberDisplay}`);
    p.drawText(brand, {
      x: MARGIN,
      y: MARGIN - 18,
      size: 7,
      font: regular,
      color: MUTED,
    });
  });

  return doc.save();
}
