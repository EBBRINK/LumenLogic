// PDF-armaturenboek-parser (run 2): segmenteert de doorlopende inhoudsopgave-tekst op
// armatuurcodes en splitst merk/type met de bekende-merkenlijst (multi-woord-merken heel).
// Plus (B2/stap 5): het markdown-controlespoor — per pagina "## Pagina N", cap ~2 MB,
// eerlijke notitie bij afkappen of ontbrekende tekstlaag.
import { expect, test } from "vitest";
// Fixture-PDF mét tekstlaag (gegenereerd door scripts/gen-test-armaturenboek.ts).
import boekUrl from "@/docs/examples/test-armaturenboek.pdf?url";
import { extractPagesFromPdf } from "./extract";
import {
  MARKDOWN_CAP,
  NO_TEXT_LAYER_NOTE,
  extractSpecLinesFromPdf,
  pagesToMarkdown,
  parseSpecLinesFromPages,
  parseTocText,
} from "./armaturenboek";

const BRANDS = ["XAL", "LED Linear", "iGuzzini", "NORKA", "Wever & Ducré"];

test("segmenteert één doorlopende tekststroom op armatuurcodes", () => {
  const text =
    "Armatuurcode Merk Type Bladzijde " +
    "Lp301 XAL SASSO 100 20 " +
    "Lr303 XAL SASSO 60 Adjustable 21 " +
    "Ls004 LED Linear XOOLINE 22 " +
    "Lw201 Wever & Ducré SCAVA 1.0 26";
  const lines = parseTocText(text, BRANDS);

  expect(lines.map((l) => l.fixtureCode)).toEqual([
    "Lp301", "Lr303", "Ls004", "Lw201",
  ]);
  // multi-woord-merk blijft heel; bladzijdenummer valt weg; "1.0" blijft in de type
  expect(lines[3]).toMatchObject({
    fixtureCode: "Lw201",
    brandText: "Wever & Ducré",
    productText: "SCAVA 1.0",
    quantity: 1,
  });
  expect(lines[1]).toMatchObject({ brandText: "XAL", productText: "SASSO 60 Adjustable" });
});

test("negeert kop-tekst vóór de eerste code en ontdubbelt codes", () => {
  const text = "RET Waalhaven Inhoudsopgave Lp301 XAL SASSO 100 20 Lp301 XAL SASSO 100 20";
  const lines = parseTocText(text, BRANDS);
  expect(lines).toHaveLength(1);
  expect(lines[0].fixtureCode).toBe("Lp301");
});

// — B2: markdown-controlespoor —

test("pagesToMarkdown: per pagina '## Pagina N', regeleindes blijven staan", () => {
  const md = pagesToMarkdown([
    "Armatuurcode Merk Type\nLp301 XAL SASSO 100",
    "Lw201 Wever & Ducré SCAVA 1.0",
  ]);
  expect(md).toBe(
    "## Pagina 1\n\nArmatuurcode Merk Type\nLp301 XAL SASSO 100\n\n" +
      "## Pagina 2\n\nLw201 Wever & Ducré SCAVA 1.0",
  );
});

test("pagesToMarkdown: boven de cap afkappen met een eerlijke notitie onderaan", () => {
  const md = pagesToMarkdown(["a".repeat(MARKDOWN_CAP + 1000)]);
  expect(md.length).toBeLessThanOrEqual(MARKDOWN_CAP + 30);
  expect(md.endsWith("\n\n> afgekapt op 2 MB")).toBe(true);
  // onder de cap blijft alles staan, zonder notitie
  const klein = pagesToMarkdown(["korte pagina"]);
  expect(klein).not.toContain("afgekapt");
});

test("extractSpecLinesFromPdf: markdown-controlespoor + regels uit het test-armaturenboek", async () => {
  const bytes = new Uint8Array(await (await fetch(boekUrl)).arrayBuffer());
  const result = await extractSpecLinesFromPdf(bytes, BRANDS);

  expect(result.hadText).toBe(true);
  // de inhoudsopgave is geparst (o.a. de groene en blauwe voorbeeldregels)
  const codes = result.lines.map((l) => l.fixtureCode);
  expect(codes).toContain("Lp301");
  expect(codes).toContain("Lp801");
  // controlespoor: paginakop bovenaan, daarna de brontekst zelf (regels intact)
  expect(result.markdown.startsWith("## Pagina 1")).toBe(true);
  expect(result.markdown).toContain("SASSO 100");
  expect(result.markdown).toContain("Armaturenboek");
  expect(result.markdown).not.toContain("afgekapt");
});

// 413-fix deel 1: het productiepad (browser-extractie → pure server-parsing) vastgelegd
// tegen een EXPLICIET fixture-snapshot — niet tegen extractSpecLinesFromPdf zelf (die
// deelt inmiddels dezelfde code, dus dat zou tautologisch zijn). Verandert de parser of
// de extractie, dan breekt dit zichtbaar op concrete waarden.
test("productiepad op het test-armaturenboek: 20 regels, vastgelegde eerste/laatste regel + markdown-kop", async () => {
  const bytes = new Uint8Array(await (await fetch(boekUrl)).arrayBuffer());
  const pages = await extractPagesFromPdf(bytes);
  expect(pages).toHaveLength(1); // het fixture-boek is één inhoudsopgave-pagina

  const result = parseSpecLinesFromPages(pages, BRANDS);
  expect(result.hadText).toBe(true);
  expect(result.rawRows).toBe(20);
  expect(result.lines.map((l) => l.fixtureCode)).toEqual([
    "Lp301", "Lp302", "Ls001", "Lp401", "Ld201", "Lw101", "Ls010", "Lp501",
    "Ld105", "Ld202", "Lw102", "Ld106", "Lw103", "Ld107", "Lp601", "Lr701",
    "Lp801", "Ls802", "Lx901", "Lx902",
  ]);
  // eerste regel: bekend merk + inline-spec (3000K) gelezen als gevraagde spec
  expect(result.lines[0]).toEqual({
    fixtureCode: "Lp301",
    quantity: 1,
    brandText: "XAL",
    productText: "SASSO 100 SQ SP CEIL 3000K",
    reqKelvin: 3000,
    reqCri: null,
    reqIp: null,
    reqWatt: null,
    reqLumen: null,
    reqBeamAngle: null,
    reqDimmable: null,
  });
  // laatste regel: onbekend merk (USM, niet in BRANDS) → eerste woord als merk, geen specs
  expect(result.lines[19]).toEqual({
    fixtureCode: "Lx902",
    quantity: 1,
    brandText: "USM",
    productText: "Haller kast laag",
    reqKelvin: null,
    reqCri: null,
    reqIp: null,
    reqWatt: null,
    reqLumen: null,
    reqBeamAngle: null,
    reqDimmable: null,
  });
  // markdown-controlespoor: vaste kop, boektitel, geen afkap-notitie
  expect(
    result.markdown.startsWith(
      "## Pagina 1\n\nNieuwbouw Kantoorpand De Boog — Armaturenboek",
    ),
  ).toBe(true);
  expect(result.markdown).not.toContain("afgekapt");

  // en de all-in-one wrapper (tests/scripts-pad) levert ditzelfde resultaat
  const wrapper = await extractSpecLinesFromPdf(
    new Uint8Array(await (await fetch(boekUrl)).arrayBuffer()),
    BRANDS,
  );
  expect(wrapper.rawRows).toBe(20);
});

// Geen tekstlaag (lege pagina's) → zelfde eerlijke uitkomst als het oude PDF-pad.
test("parseSpecLinesFromPages: lege pagina's → hadText false + notitie", () => {
  const result = parseSpecLinesFromPages(["", "  \n "], BRANDS);
  expect(result.hadText).toBe(false);
  expect(result.lines).toHaveLength(0);
  expect(result.markdown).toBe(NO_TEXT_LAYER_NOTE);
});

// Minimale geldige PDF met één lege pagina — geen tekstlaag, zoals beeld-geëxporteerde
// boeken. Volledig ASCII, dus de xref-offsets kloppen byte voor byte.
function minimalEmptyPdf(): Uint8Array {
  const objs = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>\nendobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const o of objs) {
    offsets.push(body.length);
    body += o;
  }
  const xrefPos = body.length;
  body += "xref\n0 4\n0000000000 65535 f \n";
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return new TextEncoder().encode(body);
}

test("extractSpecLinesFromPdf: geen tekstlaag → fail loud + notitie als markdown", async () => {
  const result = await extractSpecLinesFromPdf(minimalEmptyPdf(), BRANDS);
  expect(result.hadText).toBe(false);
  expect(result.lines).toHaveLength(0);
  expect(result.markdown).toBe(NO_TEXT_LAYER_NOTE);
});
