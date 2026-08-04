// BEWIJSMETING ronde 2 — de vertaling hard maken en de valse C-positieven in kaart brengen.
//
//   A  families die BEIDE notaties dragen (na het strippen van de maat)  ← het harde bewijs
//   B  staat er ooit een SPATIE tussen het getal en de K?
//   C  de contexten van elke C-waarde: welke zijn CRI en welke een bestelcode?
//   D  wat is HC — en bestaat dezelfde WORKM zónder HC?
//   E  de 'kale K'-namen (27K zonder C erachter)
//   F  bestaat er een familie met zowel 3K als 30K? (zou de ×100/×1000-lezing breken)
//
//   bun --env-file=.env.branch scripts/meet-flos-notatie-2.ts
import { assertBranchDb, logGuard } from "./branch-guard";

const MERK = "Flos Architectural";
const KORT = /(?<![\d.,])(\d{1,2})K(?![a-z])/g;
const LANG = /(?<![\d.,])(\d{3,5})\s*K\b/g;

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
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({ naam: products.name, kelvin: products.kelvin, cri: products.cri })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(eq(brands.name, MERK));
  console.log(`${MERK}: ${rijen.length} producten\n${"═".repeat(74)}`);

  // ── A — families met BEIDE notaties ───────────────────────────────────────
  // Sleutel: naam zonder de K/C-code én zonder losse maatgetallen (BON JOUR 45 / 90 / 145 zijn
  // maten van dezelfde lijn). Draagt één sleutel zowel "27K" als "2700K", dan schrijft Flos
  // dezelfde waarde in beide notaties op — en is de vertaling geen aanname meer.
  const sleutel = (n: string) =>
    n
      .replace(/(?<![\d.,])\d{1,5}\s*K\s*(?:C\s?)?\d{0,3}\s*(?:HC|CB|WF|DA)?/gi, " ")
      .replace(/\bCRI\s*\d{2,3}\b/gi, " ")
      .replace(/\bC\s?\d{2}\b/gi, " ")
      .replace(/\b\d+([.,]\d+)?\s*W\b/gi, " ")
      .replace(/\b\d+(MM|CM)?\b/gi, " ") // maatgetallen weg
      .replace(/[^A-Za-z]+/g, " ")
      .trim()
      .toUpperCase();

  const fams = new Map<string, { kort: Map<string, string>; lang: Map<string, string> }>();
  for (const r of rijen) {
    const n = r.naam ?? "";
    const k = sleutel(n);
    const f = fams.get(k) ?? { kort: new Map(), lang: new Map() };
    for (const m of alle(KORT, n)) f.kort.set(m[1], n);
    for (const m of alle(LANG, n)) f.lang.set(m[1], n);
    fams.set(k, f);
  }
  const beide = [...fams].filter(([, f]) => f.kort.size && f.lang.size);
  console.log(`A — families met ZOWEL de korte als de lange vorm: ${beide.length} (van ${fams.size})\n`);
  let paarEens = 0, paarOneens = 0;
  for (const [k, f] of beide) {
    console.log(`  ${k.slice(0, 60)}`);
    for (const [kv, nm] of f.kort) console.log(`     kort ${kv.padEnd(3)}K  ${nm.slice(0, 56)}`);
    for (const [lv, nm] of f.lang) console.log(`     lang ${lv.padEnd(5)}K  ${nm.slice(0, 56)}`);
    // toetsing: is elke korte waarde ×100 of ×1000 gelijk aan een lange waarde in dezelfde familie?
    for (const kv of f.kort.keys()) {
      const v = parseInt(kv, 10);
      const raak = [...f.lang.keys()].some((L) => +L === v * 100 || +L === v * 1000);
      if (raak) paarEens++; else paarOneens++;
      console.log(`     → ${kv}K ${raak ? "KOMT OVEREEN met een lange waarde in deze familie" : "heeft GEEN tegenhanger"}`);
    }
    console.log();
  }
  console.log(`  korte waarden met een lange tegenhanger: ${paarEens} · zonder: ${paarOneens}`);

  // ── B — spatie tussen getal en K? ─────────────────────────────────────────
  const metSpatie = rijen.filter((r) => /(?<![\d.,])\d{1,2}\s+K(?![a-zA-Z])/.test(r.naam ?? ""));
  console.log(`\nB — namen met een SPATIE tussen het getal en de K: ${metSpatie.length}`);
  for (const r of metSpatie.slice(0, 10)) console.log(`     ${(r.naam ?? "").slice(0, 66)}`);

  // ── C — contexten per C-waarde ────────────────────────────────────────────
  console.log(`\nC — per C-waarde: wat staat er direct VÓÓR de C?`);
  const perWaarde = new Map<string, Map<string, { n: number; vb: string }>>();
  for (const r of rijen) {
    const n = r.naam ?? "";
    for (const m of alle(/C\s?(\d{2})(?!\d)/g, n)) {
      const voor = m.index === 0 ? "<begin>" : n[m.index - 1];
      const soort = voor === "<begin>" ? "<begin>" : /[0-9]/.test(voor) ? "cijfer" : /[A-Za-z]/.test(voor) ? `letter '${voor}'` : "scheidingsteken";
      const b = perWaarde.get(m[1]) ?? new Map();
      const e = b.get(soort) ?? { n: 0, vb: n };
      e.n++; b.set(soort, e); perWaarde.set(m[1], b);
    }
  }
  for (const [waarde, b] of [...perWaarde].sort((a, x) => [...x[1].values()].reduce((s, e) => s + e.n, 0) - [...a[1].values()].reduce((s, e) => s + e.n, 0))) {
    const tot = [...b.values()].reduce((s, e) => s + e.n, 0);
    console.log(`  C${waarde}  (${tot}×)`);
    for (const [soort, e] of [...b].sort((a, x) => x[1].n - a[1].n)) {
      console.log(`      voorafgegaan door ${soort.padEnd(18)} ${String(e.n).padStart(5)}   ${e.vb.slice(0, 50)}`);
    }
  }

  // ── D — HC ────────────────────────────────────────────────────────────────
  const hc = rijen.filter((r) => /HC\b/.test(r.naam ?? ""));
  const hcWaarden = new Map<string, number>();
  for (const r of hc) for (const m of alle(/(\d{2})HC\b/g, r.naam ?? "")) tel(hcWaarden, m[1]);
  console.log(`\nD — namen met HC: ${hc.length}; het getal ervóór:`);
  for (const [v, n] of hcWaarden) console.log(`     ${v}: ${n}`);
  const workm = rijen.filter((r) => /^WORKM/.test(r.naam ?? ""));
  console.log(`     WORKM-producten totaal: ${workm.length}, waarvan met HC: ${workm.filter((r) => /HC\b/.test(r.naam ?? "")).length}`);
  console.log(`     WORKM zónder HC (10 voorbeelden):`);
  for (const r of workm.filter((x) => !/HC\b/.test(x.naam ?? "")).slice(0, 10)) console.log(`       ${(r.naam ?? "").slice(0, 64)}`);
  console.log(`     WORKM mét HC (6 voorbeelden):`);
  for (const r of workm.filter((x) => /HC\b/.test(x.naam ?? "")).slice(0, 6)) console.log(`       ${(r.naam ?? "").slice(0, 64)}`);

  // ── E — de kale K ─────────────────────────────────────────────────────────
  const kale = rijen.filter((r) => {
    const n = r.naam ?? "";
    return alle(KORT, n).length && !/(?<![\d.,])\d{1,2}K\s?(?:C\s?)?\d{2}/.test(n);
  });
  console.log(`\nE — namen met een korte K maar ZONDER cri-getal erachter: ${kale.length}`);
  for (const r of kale.slice(0, 12)) console.log(`     ${(r.naam ?? "").slice(0, 66)}`);

  // ── F — familie met zowel 3K als 30K? ─────────────────────────────────────
  const perFam = new Map<string, Set<string>>();
  for (const r of rijen) {
    const n = r.naam ?? "";
    const k = sleutel(n);
    if (!perFam.has(k)) perFam.set(k, new Set());
    for (const m of alle(KORT, n)) perFam.get(k)!.add(m[1]);
  }
  const botsing = [...perFam].filter(([, s]) => (s.has("3") && s.has("30")) || (s.has("4") && s.has("40")));
  console.log(`\nF — families met ZOWEL 3K als 30K (of 4K en 40K): ${botsing.length}`);
  for (const [k, s] of botsing.slice(0, 10)) console.log(`     ${[...s].join(",")}  ${k.slice(0, 58)}`);
  console.log(`\nF2 — de waardenverzameling per familie, 12 grootste families:`);
  for (const [k, s] of [...perFam].filter(([, s]) => s.size > 1).sort((a, b) => b[1].size - a[1].size).slice(0, 12)) {
    console.log(`     {${[...s].sort((a, b) => +a - +b).join(",")}}  ${k.slice(0, 56)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
