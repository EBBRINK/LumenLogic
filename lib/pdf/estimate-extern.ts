// De prijsloze estimate-PDF (sprint 3.2b) — het eigen renderpad voor externe accounts.
//
// Zusje van lib/pdf/estimate.ts: dezelfde A4-opmaak, dezelfde kop, dezelfde
// statuskleuren, dezelfde aanvraagvolgorde met zones als groepskoppen. Wat er níet in
// zit: de kolommen "Unit price" en "Line total", de zone-subtotalen, het totalenblok en
// de p.m.-verantwoording. Die staan hier niet uitgeschakeld — ze zijn er niet, want dit
// bestand ziet een `PricelessEstimate` en dat type dráágt geen bedragen (zie
// lib/repo/estimate-extern.ts voor waarom dat een projectie is en geen vlag).
//
// Bewust een eigen bestand en geen `variant`-parameter op renderEstimatePdf: die functie
// noemt `eur()` op zeven plekken, en één vergeten tak is hier geen schoonheidsfout maar
// een prijslek naar de partij die de prijzen juist niet mag zien.
//
// De twee bestanden delen hun layout-constanten en tekst-helpers níet. Dat is een
// afweging, geen slordigheid: een gedeelde helperlaag zou de sjablonen aan elkaar
// vastknopen, en dan is "de interne PDF krijgt een kolom erbij" opnieuw een moment
// waarop iemand aan de externe kant moet denken. Loopt de opmaak uit de pas, dan is dat
// zichtbaar en herstelbaar; loopt het geld mee, dan niet.
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
import { notableDeviations, requestedText, PM_STATUSES } from "@/lib/repo/estimate";
import {
  EXTERN_ESTIMATE_DISCLAIMER,
  EXTERN_PM_SENTENCE,
  type PricelessEstimate,
  type PricelessLine,
} from "@/lib/repo/estimate-extern";

// ── Layout-constanten (A4 staand, punten) ────────────────────────────────────
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const FOOTER_ZONE = 30; // gereserveerd voor paginanummers

// Vier kolommen in plaats van zes. De ruimte die stukprijs en regeltotaal achterlaten
// gaat naar de omschrijving: op het interne stuk is die kolom 202pt en breekt een
// productnaam vaak af met een ellipsis — hier past hij meestal heel.
const COL = {
  code: { x: MARGIN, w: 56 },
  name: { x: MARGIN + 62, w: 300 },
  qtyRight: MARGIN + 62 + 300 + 46,
  status: { x: MARGIN + 62 + 300 + 54, w: 60 },
} as const;

const INK = rgb(0.13, 0.14, 0.16);
const MUTED = rgb(0.45, 0.47, 0.51);
const LINE = rgb(0.84, 0.85, 0.87);

// Zelfde bron als het scherm en als de interne PDF (STATUS[...].print): de kleuren zijn
// onderdeel van de statustaal en die verandert niet omdat de prijzen wegvallen.
const STATUS_COLOR: Record<MatchStatus, RGB> = Object.fromEntries(
  (Object.keys(STATUS) as MatchStatus[]).map((s) => [s, rgb(...STATUS[s].print)]),
) as Record<MatchStatus, RGB>;

// pdf-lib's StandardFonts kunnen alleen WinAnsi aan. Onbekende tekens worden "?" in
// plaats van een crash.
function makeSanitizer(font: PDFFont): (s: string) => string {
  const supported = new Set(font.getCharacterSet());
  return (s: string) =>
    [...s.replace(/[\u00A0\u202F\u2007\u2009]/g, " ")]
      .map((ch) => (supported.has(ch.codePointAt(0) as number) ? ch : "?"))
      .join("");
}

export async function renderExternalEstimatePdf(
  data: PricelessEstimate,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const clean = makeSanitizer(regular);

  const { header, groups, hasZones } = data;

  doc.setTitle(
    data.quoteNumberAssigned
      ? `Estimate ${data.quoteNumberDisplay} — ${data.dossierName}`
      : `Estimate — ${data.dossierName}`,
  );

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
      start: { x: fromX, y },
      end: { x: toX, y },
      thickness: 0.6,
      color,
    });
  };

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

  const drawTableHead = () => {
    const opts = { font: bold, size: 7.5, color: MUTED };
    text("Code", COL.code.x, opts);
    text("Description", COL.name.x, opts);
    textRight("Quantity", COL.qtyRight, opts);
    text("Status", COL.status.x, opts);
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
  const need = (h: number) => {
    if (y - h < MARGIN + FOOTER_ZONE) newPage();
  };

  newPage();

  // ── Kop ────────────────────────────────────────────────────────────────────
  text("Brink Licht", MARGIN, { font: bold, size: 15 });
  textRight("ESTIMATE", PAGE_W - MARGIN, { font: bold, size: 10, color: MUTED });
  y -= 20;
  text(data.dossierName, MARGIN, { font: bold, size: 12 });
  y -= 18;

  const fields: [string, string][] = [
    ["Quote number", data.quoteNumberDisplay],
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
  if (data.lineCount === 0) {
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
        // Afwijkingen en de twee merktekens blijven staan: dat is spec-transparantie
        // (C-07), geen commercie. Het vervalmerkteken van de dagprijs staat er níet
        // meer — dat gaat over wélke prijs gebruikt is, en die staat hier niet.
        const notable = notableDeviations(line);
        const hasSubLine =
          notable.length > 0 || !!line.autoAccepted || !!line.manuallyChosen;
        const rowH = 13 + (hasSubLine ? 10 : 0);
        need(rowH);

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
        y -= 10;

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
    }
    inTable = false;
  }

  // ── Open punten & acties ────────────────────────────────────────────────────
  // Geen totalenblok ertussen: er is niets om op te tellen. Deze sectie blijft wél,
  // want ze zegt wat er nog aan de regels schort — dat is precies wat een externe
  // lezer nodig heeft.
  if (data.pmLines.length > 0) {
    need(30);
    y -= 8;
    text("Open items & actions", MARGIN, { font: bold, size: 9.5 });
    y -= 14;

    const pmItem = (line: PricelessLine, label: string, color: RGB) => {
      need(12);
      page.drawCircle({ x: MARGIN + 3, y: y + 2.5, size: 2.2, color });
      text(
        fit(`${line.fixtureCode} — ${label}`, CONTENT_W - 14, regular, 8.5),
        MARGIN + 10,
        { size: 8.5 },
      );
      y -= 12;
    };
    for (const s of PM_STATUSES) {
      for (const l of data.pmByStatus[s]) {
        pmItem(l, EXTERN_PM_SENTENCE[s](l), STATUS_COLOR[s]);
      }
    }

    if (data.brandFreq.length > 0) {
      need(14 + data.brandFreq.length * 11);
      y -= 4;
      text("Brands still to be loaded", MARGIN, {
        size: 7.5,
        color: MUTED,
        font: bold,
      });
      y -= 11;
      for (const [brand, n] of data.brandFreq) {
        need(11);
        text(fit(`${brand} — ${n}×`, CONTENT_W, regular, 8.5), MARGIN, { size: 8.5 });
        y -= 11;
      }
    }
  }

  // ── Voettekst (letterlijk dezelfde string als op het scherm) ─────────────────
  const discLines = wrap(EXTERN_ESTIMATE_DISCLAIMER, CONTENT_W, regular, 7.5);
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
    const brand = clean(
      data.quoteNumberAssigned
        ? `Brink Licht · Estimate ${data.quoteNumberDisplay}`
        : "Brink Licht · Estimate",
    );
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
