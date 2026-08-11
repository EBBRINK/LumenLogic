// BEWIJSMETING vóór de regel: wat betekent Flos' korte <nn>K / C<nn>-notatie écht?
//
// Dit script bouwt niets. Het toetst de vermoedens tegen de database, elk met een uitkomst die
// het vermoeden kan WEERLEGGEN. Ronde 2: de eerste versie had drie eigen regexfouten (een
// lookahead die `30KC90` uitsloot, een `\b` die `40K98` uitsloot, en een `\b` vóór de C die na
// een K nooit aanslaat). Vandaar dat hier per vorm ÉN per naam geteld wordt, met de context
// erbij afgedrukt — een telling zonder voorbeeld is niet controleerbaar.
//
//   bun --env-file=.env.branch scripts/meet-flos-notatie.ts
import { assertBranchDb, logGuard } from "./branch-guard";

const MERK = "Flos Architectural";

// ── De kandidaat-vormen, apart gehouden ───────────────────────────────────────
// Los van elkaar tellen, want ze kunnen elk een andere valse positief hebben.
const VORMEN: [string, RegExp][] = [
  // "30KC90", "40K98HC" — alles aan elkaar vast, geen spatie
  ["glued", /(?<![\d.,])(\d{1,2})K(\d{2}|C\d{2})/g],
  // "35K C90", "3K C90" — K los, C los
  ["gespatieerd", /(?<![\d.,])(\d{1,2})K\s+C(\d{2})/g],
  // korte K zonder enige C/getal erachter — "27K DALI"
  ["kale-K", /(?<![\d.,])(\d{1,2})\s*K\b(?!\s*C?\d)/g],
  // lange, klassieke vorm — die de huidige parser al kan
  ["lang", /(?<![\d.,])(\d{3,5})\s*K\b/g],
];

// Álle plaatsen waar een 1-2-cijferig getal door een K gevolgd wordt, hoe dan ook.
const KORT_K_BREED = /(?<![\d.,])(\d{1,2})\s*K/g;
// Álle C<nn>, ook direct achter een K vastgeplakt (dus geen \b ervóór).
const C_NN_BREED = /C\s?(\d{2,3})(?![\d])/g;

function alleMatches(re: RegExp, s: string): RegExpExecArray[] {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const uit: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = g.exec(s)) !== null) {
    uit.push(m);
    if (m[0].length === 0) g.lastIndex++;
  }
  return uit;
}

function tel<T>(m: Map<T, number>, k: T, n = 1) {
  m.set(k, (m.get(k) ?? 0) + n);
}

function toon(titel: string, m: Map<string, number>, vb?: Map<string, string>, max = 30) {
  console.log(`\n${titel}`);
  const r = [...m].sort((a, b) => b[1] - a[1]);
  for (const [k, n] of r.slice(0, max)) {
    console.log(`  ${String(k).padEnd(12)} ${String(n).padStart(6)}   ${(vb?.get(k) ?? "").slice(0, 56)}`);
  }
  if (r.length > max) console.log(`  … en nog ${r.length - max} andere waarden`);
  console.log(`  ${"TOTAAL".padEnd(12)} ${String([...m.values()].reduce((a, b) => a + b, 0)).padStart(6)} (${r.length} verschillende)`);
}

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  const rijen = await db
    .select({
      naam: products.name,
      omschrijving: products.description,
      kelvin: products.kelvin,
      cri: products.cri,
      bron: products.tier2Source,
    })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(eq(brands.name, MERK));

  console.log(`${MERK}: ${rijen.length} producten\n${"═".repeat(74)}`);

  // ── 1 — hoeveel NAMEN dragen welke vorm ───────────────────────────────────
  const perVorm = new Map<string, number>();
  const vbVorm = new Map<string, string>();
  for (const r of rijen) {
    const n = r.naam ?? "";
    for (const [label, re] of VORMEN) {
      if (alleMatches(re, n).length) {
        tel(perVorm, label);
        if (!vbVorm.has(label)) vbVorm.set(label, n);
      }
    }
  }
  toon("1 — aantal NAMEN per vorm (een naam kan meerdere vormen dragen)", perVorm, vbVorm);

  // ── 2 — spreiding van het getal vóór de K ─────────────────────────────────
  // Het scharnier van de hele vertaling. Zie ik alleen de LED-ladder (22/27/30/35/40/50),
  // dan is ×100 sterk; zie ik ook 12, 45, 88, dan is het geen kleurtemperatuur.
  const kVerdeling = new Map<string, number>();
  const kVb = new Map<string, string>();
  const kNamen = new Map<string, Set<string>>();
  for (const r of rijen) {
    const n = r.naam ?? "";
    for (const m of alleMatches(KORT_K_BREED, n)) {
      const ctx = n.slice(Math.max(0, m.index - 14), m.index + m[0].length + 8);
      tel(kVerdeling, m[1]);
      if (!kVb.has(m[1])) kVb.set(m[1], `…${ctx}…`);
      if (!kNamen.has(m[1])) kNamen.set(m[1], new Set());
      kNamen.get(m[1])!.add(n);
    }
  }
  toon("2 — het getal vóór een KORTE K (1-2 cijfers), álle vormen samen", kVerdeling, kVb);
  console.log("     twee extra voorbeelden bij de zeldzame waarden:");
  for (const [v, n] of [...kVerdeling].sort((a, b) => a[1] - b[1]).slice(0, 4)) {
    console.log(`       ${v}K (${n}×): ${[...kNamen.get(v)!].slice(0, 2).map((x) => x.slice(0, 56)).join("\n                  ")}`);
  }

  // ── 3 — spreiding van de C-waarde ─────────────────────────────────────────
  const cVerdeling = new Map<string, number>();
  const cVb = new Map<string, string>();
  for (const r of rijen) {
    const n = r.naam ?? "";
    for (const m of alleMatches(C_NN_BREED, n)) {
      tel(cVerdeling, m[1]);
      if (!cVb.has(m[1])) cVb.set(m[1], `…${n.slice(Math.max(0, m.index - 16), m.index + m[0].length + 6)}…`);
    }
  }
  toon("3 — de waarde ná de C", cVerdeling, cVb);

  // ── 4 — het getal DIRECT achter de K, zonder C ("40K98HC", "30K90HC") ─────
  const losVerdeling = new Map<string, number>();
  const losVb = new Map<string, string>();
  for (const r of rijen) {
    const n = r.naam ?? "";
    for (const m of alleMatches(/(?<![\d.,])(\d{1,2})K(\d{2})(?![\d])/g, n)) {
      tel(losVerdeling, m[2]);
      if (!losVb.has(m[2])) losVb.set(m[2], n);
    }
  }
  toon("4 — het getal DIRECT achter de K (de 98 in '40K98HC')", losVerdeling, losVb);

  // ── 5 — wat volgt er op die vastgeplakte vorm? (wat is HC?) ───────────────
  const staart = new Map<string, number>();
  const staartVb = new Map<string, string>();
  for (const r of rijen) {
    const n = r.naam ?? "";
    for (const m of alleMatches(/(?<![\d.,])\d{1,2}K(?:C?\d{2})([A-Z]{0,3})/g, n)) {
      tel(staart, m[1] || "<niets>");
      if (!staartVb.has(m[1] || "<niets>")) staartVb.set(m[1] || "<niets>", n);
    }
  }
  toon("5 — de letters direct ná de code (HC?)", staart, staartVb, 15);

  // ── 6 — DE HARDE TOETS: dezelfde familie, beide notaties ──────────────────
  // Sleutel = naam met de hele K/C-code weggehaald. Draagt één basisnaam zowel "30K90HC" als
  // "30K C90", dan is bewezen dat het losse getal en de C-waarde hetzelfde feit zijn.
  const stripCode = (n: string) =>
    n
      .replace(/(?<![\d.,])\d{1,5}\s*K\s*(?:C\s?\d{2,3}|\d{2})?\s*(?:HC|CB|WF|MD|SP)?/gi, " ")
      .replace(/\bC\s?\d{2,3}\b/gi, " ")
      .replace(/[^A-Za-z0-9]+/g, " ")
      .trim()
      .toUpperCase();

  type Fam = { glued: string[]; spaced: string[]; lang: string[]; losC: string[] };
  const fams = new Map<string, Fam>();
  for (const r of rijen) {
    const n = r.naam ?? "";
    const k = stripCode(n);
    const f = fams.get(k) ?? { glued: [], spaced: [], lang: [], losC: [] };
    if (/(?<![\d.,])\d{1,2}K\d{2}/.test(n)) f.glued.push(n);
    if (/(?<![\d.,])\d{1,2}K\s*C\d{2}/.test(n)) f.spaced.push(n);
    if (/(?<![\d.,])\d{3,5}\s*K\b/.test(n)) f.lang.push(n);
    fams.set(k, f);
  }
  const gluedVsSpaced = [...fams].filter(([, f]) => f.glued.length && f.spaced.length);
  const kortVsLang = [...fams].filter(([, f]) => (f.glued.length || f.spaced.length) && f.lang.length);
  console.log(`\n6 — families (${fams.size} in totaal):`);
  console.log(`  met ZOWEL '30K90'-vorm als '30K C90'-vorm : ${gluedVsSpaced.length}`);
  for (const [k, f] of gluedVsSpaced.slice(0, 8)) {
    console.log(`     ${k.slice(0, 46)}`);
    console.log(`        ${f.glued[0].slice(0, 62)}`);
    console.log(`        ${f.spaced[0].slice(0, 62)}`);
  }
  console.log(`  met ZOWEL een korte als een LANGE K-vorm  : ${kortVsLang.length}`);
  for (const [k, f] of kortVsLang.slice(0, 8)) {
    console.log(`     ${k.slice(0, 46)}`);
    console.log(`        kort: ${(f.glued[0] ?? f.spaced[0]).slice(0, 58)}`);
    console.log(`        lang: ${f.lang[0].slice(0, 58)}`);
  }

  // ── 7 — de namen die de LANGE vorm dragen: staat daar ook een C bij? ──────
  console.log(`\n7 — alle namen met de LANGE vorm (de 46 die de parser nu al leest):`);
  const langNamen = rijen.filter((r) => /(?<![\d.,])\d{3,5}\s*K\b/.test(r.naam ?? ""));
  for (const r of langNamen.slice(0, 20)) {
    console.log(`     kelvin=${String(r.kelvin ?? "—").padStart(5)} cri=${String(r.cri ?? "—").padStart(3)}  ${(r.naam ?? "").slice(0, 56)}`);
  }
  console.log(`     (${langNamen.length} namen)`);

  // ── 8 — de 27 rijen met een gevulde cri-kolom ────────────────────────────
  console.log(`\n8 — de Flos-rijen met een gevulde cri-kolom:`);
  for (const r of rijen.filter((x) => x.cri != null).slice(0, 30)) {
    console.log(`     cri=${String(r.cri).padStart(3)}  ${(r.naam ?? "").slice(0, 62)}`);
  }

  // ── 9 — tegenspraak binnen één naam ──────────────────────────────────────
  // Draagt een naam zowel een korte als een lange K-vorm met een ANDERE waarde, dan is de
  // vertaling niet eenduidig en moet de regel stoppen.
  let tegenspraak = 0;
  for (const r of rijen) {
    const n = r.naam ?? "";
    const kort = alleMatches(KORT_K_BREED, n).map((m) => parseInt(m[1], 10));
    const lang = alleMatches(/(?<![\d.,])(\d{3,5})\s*K\b/g, n).map((m) => parseInt(m[1], 10));
    if (!kort.length || !lang.length) continue;
    const eens = kort.some((k) => lang.some((L) => L === k * 100 || L === k * 1000));
    if (!eens) {
      if (tegenspraak < 10) console.log(`     ✗ kort=${kort} lang=${lang}  ${n.slice(0, 54)}`);
      tegenspraak++;
    }
  }
  console.log(`\n9 — namen met een korte én lange K-vorm die elkaar TEGENSPREKEN: ${tegenspraak}`);

  // ── 10 — draagt een naam meer dan één verschillende korte K? ─────────────
  let meerdere = 0;
  const meerVb: string[] = [];
  for (const r of rijen) {
    const n = r.naam ?? "";
    const s = new Set(alleMatches(KORT_K_BREED, n).map((m) => m[1]));
    if (s.size > 1) {
      meerdere++;
      if (meerVb.length < 8) meerVb.push(`     ${[...s].join("/")}  ${n.slice(0, 58)}`);
    }
  }
  console.log(`\n10 — namen met MEER dan één verschillende korte K-waarde: ${meerdere}`);
  for (const l of meerVb) console.log(l);
}

main().catch((e) => { console.error(e); process.exit(1); });
