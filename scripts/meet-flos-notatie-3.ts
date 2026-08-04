// BEWIJSMETING ronde 3 — de laatste gaten dichten vóór er één regel geschreven wordt.
//
//   A  naamlengte: worden Flos-namen afgekapt? (verklaart de 1.862 'kale K')
//   B  varieert het getal ná de K binnen één familie onafhankelijk van de K? (= het is CRI)
//   C  productlijnen waar de LANGE en de KORTE vorm naast elkaar staan (eerste twee woorden)
//   D  families met een 3K/4K-waarde: welke verzameling dragen ze?
//   E  CATALOGUSBREED: welke NIET-Flos-namen zou een kandidaatregel raken?
//
//   bun --env-file=.env.branch scripts/meet-flos-notatie-3.ts
import { assertBranchDb, logGuard } from "./branch-guard";

const MERK = "Flos Architectural";

// ── De KANDIDAATREGELS, precies zoals ze in de parser zouden komen ────────────
// Kelvin: 1-2 cijfers VAST aan een K (geen spatie — de enige naam met spatie was een driver:
// "MP32 K2110-240V"), met een cijfer of code erachter, nooit een kleine letter (anders "3Kap").
const KANDIDAAT_KELVIN = /(?<![\d.,])(\d{1,2})K(?![a-z])/g;
// CRI: C + 2 cijfers, óf voorafgegaan door de K-code ("30KC90"), óf door een niet-letter
// ("… ARR C80"). De letter-eis weert ECLECTIC 90 / DC 90 / XTSC 63 / LC43 / QR-CBC51.
const KANDIDAAT_CRI_LOS = /(?<![A-Za-z])C\s?(\d{2})(?!\d)/g;
// CRI zonder C, direct vastgeplakt achter de K-code: "30K90HC", "40K98HC".
const KANDIDAAT_CRI_VAST = /(?<![\d.,])\d{1,2}K(\d{2})(?!\d)/g;

function alle(re: RegExp, s: string): RegExpExecArray[] {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const uit: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = g.exec(s)) !== null) { uit.push(m); if (!m[0].length) g.lastIndex++; }
  return uit;
}
function tel<T>(m: Map<T, number>, k: T) { m.set(k, (m.get(k) ?? 0) + 1); }

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq, isNotNull } = await import("drizzle-orm");

  const alleRijen = await db
    .select({ merk: brands.name, naam: products.name, kelvin: products.kelvin, cri: products.cri })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(isNotNull(products.name));
  const flos = alleRijen.filter((r) => r.merk === MERK);
  console.log(`catalogus: ${alleRijen.length} producten · ${MERK}: ${flos.length}\n${"═".repeat(74)}`);

  // ── A — naamlengte ────────────────────────────────────────────────────────
  const lengtes = new Map<number, number>();
  for (const r of flos) tel(lengtes, (r.naam ?? "").length);
  const top = [...lengtes].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = Math.max(...lengtes.keys());
  console.log(`A — naamlengte Flos: maximum ${max}; meest voorkomende lengtes:`);
  for (const [l, n] of top) console.log(`     ${String(l).padStart(3)} tekens: ${n}`);
  const opMax = flos.filter((r) => (r.naam ?? "").length === max).length;
  console.log(`     namen die exact op het maximum (${max}) eindigen: ${opMax}  → afkapping`);
  const maxAnders = Math.max(...alleRijen.filter((r) => r.merk !== MERK).map((r) => (r.naam ?? "").length));
  console.log(`     ter vergelijking, langste naam van een ANDER merk: ${maxAnders}`);

  // ── B — varieert het getal ná de K onafhankelijk van de K? ────────────────
  const sleutel = (n: string) =>
    n.replace(/(?<![\d.,])\d{1,2}K\s*(?:C\s?)?\d{0,3}/gi, " ")
      .replace(/[^A-Za-z]+/g, " ").trim().toUpperCase();
  const paren = new Map<string, Set<string>>();
  for (const r of flos) {
    const n = r.naam ?? "";
    const k = alle(KANDIDAAT_KELVIN, n)[0]?.[1];
    const c = alle(KANDIDAAT_CRI_VAST, n)[0]?.[1] ?? alle(KANDIDAAT_CRI_LOS, n)[0]?.[1];
    if (!k || !c) continue;
    const s = sleutel(n);
    if (!paren.has(s)) paren.set(s, new Set());
    paren.get(s)!.add(`${k}|${c}`);
  }
  const variabeleCri = [...paren].filter(([, s]) => new Set([...s].map((x) => x.split("|")[1])).size > 1);
  console.log(`\nB — families waarin het getal ná de K VARIEERT bij gelijkblijvende K: ${variabeleCri.length}`);
  for (const [k, s] of variabeleCri.slice(0, 10)) {
    console.log(`     ${[...s].sort().join("  ")}   ${k.slice(0, 48)}`);
  }
  const variabeleK = [...paren].filter(([, s]) => new Set([...s].map((x) => x.split("|")[0])).size > 1);
  console.log(`     families waarin de K varieert bij gelijkblijvende cri: ${variabeleK.length}`);
  for (const [k, s] of variabeleK.slice(0, 5)) console.log(`     ${[...s].sort().join("  ")}   ${k.slice(0, 48)}`);

  // ── C — lange en korte vorm binnen dezelfde productlijn ───────────────────
  const lijn = (n: string) => n.split(/[\s.]+/).slice(0, 2).join(" ").toUpperCase();
  const perLijn = new Map<string, { kort: Map<string, string>; lang: Map<string, string> }>();
  for (const r of flos) {
    const n = r.naam ?? "";
    const L = lijn(n);
    const e = perLijn.get(L) ?? { kort: new Map(), lang: new Map() };
    for (const m of alle(KANDIDAAT_KELVIN, n)) e.kort.set(m[1], n);
    for (const m of alle(/(?<![\d.,])(\d{3,5})\s*K\b/g, n)) e.lang.set(m[1], n);
    perLijn.set(L, e);
  }
  const beide = [...perLijn].filter(([, e]) => e.kort.size && e.lang.size);
  console.log(`\nC — PRODUCTLIJNEN (eerste twee woorden) met beide notaties: ${beide.length}`);
  let dekt = 0, dektNiet = 0;
  for (const [L, e] of beide) {
    console.log(`  ${L}`);
    for (const [v, n] of [...e.kort].sort()) console.log(`     kort ${v.padEnd(3)}K → ${n.slice(0, 54)}`);
    for (const [v, n] of [...e.lang].sort()) console.log(`     lang ${v.padEnd(5)}K → ${n.slice(0, 54)}`);
    for (const v of e.kort.keys()) {
      const raak = [...e.lang.keys()].some((x) => +x === +v * 100 || +x === +v * 1000);
      if (raak) dekt++; else dektNiet++;
      console.log(`     → ${v}K ${raak ? "= dezelfde waarde als een LANGE vorm in deze lijn" : "geen tegenhanger"}`);
    }
  }
  console.log(`  korte waarden met een lange tegenhanger in dezelfde lijn: ${dekt} · zonder: ${dektNiet}`);

  // ── D — families met 3K of 4K ─────────────────────────────────────────────
  const fam3 = new Map<string, Set<string>>();
  for (const r of flos) {
    const n = r.naam ?? "";
    const s = sleutel(n);
    if (!fam3.has(s)) fam3.set(s, new Set());
    for (const m of alle(KANDIDAAT_KELVIN, n)) fam3.get(s)!.add(m[1]);
  }
  const met3 = [...fam3].filter(([, s]) => s.has("3") || s.has("4"));
  console.log(`\nD — families met een 3K- of 4K-waarde: ${met3.length}; hun waardenverzamelingen:`);
  const verz = new Map<string, number>();
  for (const [, s] of met3) tel(verz, `{${[...s].sort((a, b) => +a - +b).join(",")}}`);
  for (const [v, n] of [...verz].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`     ${v.padEnd(16)} ${n} families`);

  // ── E — CATALOGUSBREED: wie raakt de kandidaatregel nog meer? ─────────────
  console.log(`\nE — NIET-Flos-namen die de kandidaatregels raken:`);
  const kMerk = new Map<string, { n: number; vb: string[] }>();
  const cMerk = new Map<string, { n: number; vb: string[] }>();
  for (const r of alleRijen) {
    if (r.merk === MERK) continue;
    const n = r.naam ?? "";
    if (alle(KANDIDAAT_KELVIN, n).length) {
      const e = kMerk.get(r.merk ?? "?") ?? { n: 0, vb: [] };
      e.n++; if (e.vb.length < 4) e.vb.push(n);
      kMerk.set(r.merk ?? "?", e);
    }
    if (alle(KANDIDAAT_CRI_LOS, n).length || alle(KANDIDAAT_CRI_VAST, n).length) {
      const e = cMerk.get(r.merk ?? "?") ?? { n: 0, vb: [] };
      e.n++; if (e.vb.length < 4) e.vb.push(n);
      cMerk.set(r.merk ?? "?", e);
    }
  }
  console.log(`\n  E1 — kelvin-kandidaatregel (\\d{1,2}K), per merk:`);
  let tk = 0;
  for (const [m, e] of [...kMerk].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`     ${m.padEnd(22)} ${String(e.n).padStart(5)}`);
    for (const v of e.vb) console.log(`         ${v.slice(0, 62)}`);
    tk += e.n;
  }
  console.log(`     ${"TOTAAL".padEnd(22)} ${String(tk).padStart(5)}`);

  console.log(`\n  E2 — cri-kandidaatregel, per merk:`);
  let tc = 0;
  for (const [m, e] of [...cMerk].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`     ${m.padEnd(22)} ${String(e.n).padStart(5)}`);
    for (const v of e.vb) console.log(`         ${v.slice(0, 62)}`);
    tc += e.n;
  }
  console.log(`     ${"TOTAAL".padEnd(22)} ${String(tc).padStart(5)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
