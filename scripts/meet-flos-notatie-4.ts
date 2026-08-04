// BEWIJSMETING ronde 4 — de BREEDTE van de regel, want ronde 3 raakte 34.816 niet-Flos-namen.
//
//   A  schrijft Flos de C ooit LOS van het getal? (bepaalt of "A.24 C 90°" te weren is)
//   B  de niet-Flos-treffers: welke waarden, en zijn ze JUIST of vals?
//   C  wat doet een 'ladder-filter' (alleen de gemeten kleurtemperatuur-waarden)?
//   D  per merk: bevestigt een lange vorm of een gevulde kolom de korte vorm?
//
//   bun --env-file=.env.branch scripts/meet-flos-notatie-4.ts
import { assertBranchDb, logGuard } from "./branch-guard";

const MERK = "Flos Architectural";
// De gemeten kleurtemperatuur-ladder bij Flos: 22/27/30/35/40/50 (×100) en 3/4 (×1000).
const LADDER_2 = new Set([22, 27, 30, 35, 40, 50]);
const LADDER_1 = new Set([3, 4]);

function alle(re: RegExp, s: string): RegExpExecArray[] {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const uit: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = g.exec(s)) !== null) { uit.push(m); if (!m[0].length) g.lastIndex++; }
  return uit;
}
function tel<T>(m: Map<T, number>, k: T) { m.set(k, (m.get(k) ?? 0) + 1); }

// BREED: elke 1-2 cijfers vast aan een K.
const K_BREED = /(?<![\d.,])(\d{1,2})K/g;
// LADDER: idem, maar alleen de gemeten waarden, en geen letter erachter (weert 37KLM, 3Kap).
const K_LADDER = /(?<![\d.,])(22|27|30|35|40|50|3|4)K(?![A-Za-z])/g;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq, isNotNull } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name, kelvin: products.kelvin, cri: products.cri, omschr: products.description })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(isNotNull(products.name));
  const flos = rijen.filter((r) => r.merk === MERK);
  console.log(`catalogus ${rijen.length} · Flos ${flos.length}\n${"═".repeat(74)}`);

  // ── A — C los of vast? ────────────────────────────────────────────────────
  const cVast = flos.filter((r) => /C\d{2}(?!\d)/.test(r.naam ?? "")).length;
  const cLos = flos.filter((r) => /C\s\d{2}(?!\d)/.test(r.naam ?? "")).length;
  console.log(`A — Flos-namen met "C90" VAST: ${cVast} · met "C 90" LOS (spatie): ${cLos}`);
  for (const r of flos.filter((x) => /C\s\d{2}(?!\d)/.test(x.naam ?? "")).slice(0, 8)) {
    console.log(`     ${(r.naam ?? "").slice(0, 64)}`);
  }
  const gradenAnders = rijen.filter((r) => r.merk !== MERK && /C\s?\d{2}\s?°/.test(r.naam ?? "")).length;
  console.log(`     niet-Flos-namen met "C 90°" (graden!): ${gradenAnders}`);

  // ── B/C — de niet-Flos-treffers, breed versus ladder ─────────────────────
  console.log(`\nB — niet-Flos: waardenspreiding van de BREDE regel, per merk`);
  const perMerk = new Map<string, Map<string, number>>();
  const vbPer = new Map<string, Map<string, string>>();
  for (const r of rijen) {
    if (r.merk === MERK) continue;
    for (const m of alle(K_BREED, r.naam ?? "")) {
      if (!perMerk.has(r.merk ?? "?")) { perMerk.set(r.merk ?? "?", new Map()); vbPer.set(r.merk ?? "?", new Map()); }
      tel(perMerk.get(r.merk ?? "?")!, m[1]);
      if (!vbPer.get(r.merk ?? "?")!.has(m[1])) vbPer.get(r.merk ?? "?")!.set(m[1], r.naam ?? "");
    }
  }
  for (const [merk, verd] of [...perMerk].sort((a, b) => [...b[1].values()].reduce((s, x) => s + x, 0) - [...a[1].values()].reduce((s, x) => s + x, 0))) {
    const tot = [...verd.values()].reduce((s, x) => s + x, 0);
    console.log(`  ${merk} (${tot} treffers)`);
    for (const [v, n] of [...verd].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      const inLadder = (v.length === 2 ? LADDER_2.has(+v) : LADDER_1.has(+v)) ? "  ✓ladder" : "  ✗buiten";
      console.log(`     ${v.padEnd(4)}K ${String(n).padStart(6)}${inLadder}   ${(vbPer.get(merk)!.get(v) ?? "").slice(0, 48)}`);
    }
  }

  console.log(`\nC — wat blijft er over ná het ladder-filter (+ geen letter achter de K)?`);
  const naLadder = new Map<string, number>();
  const naLadderVb = new Map<string, string[]>();
  for (const r of rijen) {
    if (r.merk === MERK) continue;
    if (!alle(K_LADDER, r.naam ?? "").length) continue;
    tel(naLadder, r.merk ?? "?");
    if (!naLadderVb.has(r.merk ?? "?")) naLadderVb.set(r.merk ?? "?", []);
    const v = naLadderVb.get(r.merk ?? "?")!;
    if (v.length < 6) v.push(r.naam ?? "");
  }
  let tot = 0;
  for (const [merk, n] of [...naLadder].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${merk.padEnd(24)} ${String(n).padStart(6)}`);
    for (const v of naLadderVb.get(merk) ?? []) console.log(`       ${v.slice(0, 66)}`);
    tot += n;
  }
  console.log(`  ${"TOTAAL niet-Flos".padEnd(24)} ${String(tot).padStart(6)}`);

  // ── D — is de korte vorm bij die merken JUIST? ───────────────────────────
  // Twee onafhankelijke bevestigers per merk: (1) een lange vorm elders in dezelfde
  // productlijn, (2) een al gevulde kelvin-kolom op dezelfde rij.
  console.log(`\nD — toetsing per merk`);
  for (const merk of naLadder.keys()) {
    const mr = rijen.filter((r) => r.merk === merk);
    // D1 — rij heeft zowel een korte vorm als een gevulde kelvin-kolom
    let eens = 0, oneens = 0;
    const oneensVb: string[] = [];
    for (const r of mr) {
      const k = alle(K_LADDER, r.naam ?? "")[0];
      if (!k || r.kelvin == null) continue;
      const v = +k[1];
      const w = v < 10 ? v * 1000 : v * 100;
      if (r.kelvin === w) eens++;
      else { oneens++; if (oneensVb.length < 4) oneensVb.push(`kolom=${r.kelvin} naam=${k[1]}K  ${(r.naam ?? "").slice(0, 46)}`); }
    }
    // D2 — lange vorm binnen dezelfde productlijn (eerste twee woorden)
    const lijn = (n: string) => n.split(/[\s.]+/).slice(0, 2).join(" ").toUpperCase();
    const kort = new Map<string, Set<number>>(), lang = new Map<string, Set<number>>();
    for (const r of mr) {
      const n = r.naam ?? "", L = lijn(n);
      for (const m of alle(K_LADDER, n)) { if (!kort.has(L)) kort.set(L, new Set()); kort.get(L)!.add(+m[1] < 10 ? +m[1] * 1000 : +m[1] * 100); }
      for (const m of alle(/(?<![\d.,])(\d{4})\s*K\b/g, n)) { if (!lang.has(L)) lang.set(L, new Set()); lang.get(L)!.add(+m[1]); }
    }
    let lijnEens = 0, lijnOneens = 0;
    const lijnVb: string[] = [];
    for (const [L, s] of kort) {
      const g = lang.get(L);
      if (!g) continue;
      for (const v of s) {
        if (g.has(v)) lijnEens++;
        else { lijnOneens++; if (lijnVb.length < 4) lijnVb.push(`${L}: kort→${v}, lange vormen in de lijn: ${[...g].join(",")}`); }
      }
    }
    console.log(`  ${merk}`);
    console.log(`     kolom bevestigt: ${eens} · spreekt tegen: ${oneens}`);
    for (const v of oneensVb) console.log(`        ✗ ${v}`);
    console.log(`     lange vorm in dezelfde lijn bevestigt: ${lijnEens} · spreekt tegen: ${lijnOneens}`);
    for (const v of lijnVb) console.log(`        ✗ ${v}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
