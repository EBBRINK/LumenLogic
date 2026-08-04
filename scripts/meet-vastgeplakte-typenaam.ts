// MEET EERST. Twee producten kregen een vermogen uit hun TYPENAAM:
//
//   Molla Vetri Componi200W  →  200 W   (een glasveer verbruikt niets)
//   Molla Vetri Componi75W   →   75 W
//
// De vorm is <letters><cijfers>W met de W VAST aan het getal. Precies die vorm is op 30 juli
// bewust als legitiem aangemerkt — "F13W, F36W, Componi200W (12 gevallen): daar zit de W vast
// aan het getal, en dan is hij wél de eenheid" — dus de vraag is of die 12 nog steeds kloppen
// en of er een familie achter zit of maar twee uitzonderingen.
//
//   bun --env-file=<pad>/.env.branch scripts/meet-vastgeplakte-typenaam.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";
import { ONDERDRUKKENDE_VERDENKINGEN } from "@/lib/repo/enrichment";

// ── De afbakening, en waarom hij twee keer is bijgesteld ────────────────────
// Eerst: `[A-Za-z]{2,}\d+…W` — twee letters, cijfers, W. Dat gaf 29 treffers, waarvan 25 een écht
// vermogen (`MAX46W`, `Max8W`, `LED50W`). Op grond daarvan schreef ik "een regel zou 25 goede
// waarden opeten om er 2 te repareren". Dat argument was te breed: MAX en LED zijn woorden die
// een vermogen AANKONDIGEN, dus een serieuze regel zou ze sowieso uitzonderen. Ik telde risico
// dat er niet was.
//
// Strakker, en dit is de vorm die telt: minstens DRIE letters, direct gevolgd door het getal en
// de W, NIET voorafgegaan door een cijfer of x (anders vang je `2x11W`, een vermenigvuldiging),
// en zonder de aankondigende woorden. Let op het decimaalteken in het getal — zonder dat breekt
// `SENSOR19,5W` op de komma en mis je hem stil. Dat was de fout in de eerste strakke poging, en
// het is dezelfde soort fout als een komma-regex die Kreons `1200-1650, 2700K` verkeerd leest.
const VAST = /(?<![0-9xX])\b([A-Za-z]{3,})(\d{1,4}(?:[.,]\d+)?)W\b/;
const AANKONDIGERS = /^(?:max|led|tot|sys|min|maks)$/i;

// Wat er dan overblijft (4 aug, testkopie) — vijf namen, en de helft is geen fout:
//
//     19,5 W  SENSOR19,5W   TASK S 1200 … ESSENTIAL SENSOR19,5W LED 4000K   ← KLOPT
//     24,4 W  SENSOR24,4W   TASK S 1500 … ESSENTIAL SENSOR24,4W LED 4000K   ← KLOPT
//        —    Componi200W   Molla Vetri Componi200W        typenaam, waarde inmiddels op null
//        —    Componi75W    Molla Vetri Componi75W         typenaam, waarde inmiddels op null
//      240 W  MOD240W       A.24 C POWER KITXRCS/C MOD240W ← OPEN: onderdeelvraag, geen leesfout
//
// Twee goede waarden tegenover drie foute waarvan er twee al opgelost zijn. Bijna één op één, en
// dus te duur voor het ene geval dat overblijft. GEEN REGEL GEBOUWD — en de reden is die
// verhouding, niet "het zou een bloedbad worden".

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name, w: products.maxWattage })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  const raak = rijen.filter((r) => {
    const m = (r.naam ?? "").match(VAST);
    return m !== null && !AANKONDIGERS.test(m[1]);
  });
  console.log(`namen met <letters><cijfers>W (W vast aan het getal): ${raak.length}\n`);
  const perMerk = new Map<string, { n: number; landend: number; vormen: Map<string, number> }>();
  for (const r of raak) {
    const naam = r.naam ?? "";
    const p = parseProductName(naam);
    const e = perMerk.get(r.merk ?? "?") ?? { n: 0, landend: 0, vormen: new Map() };
    e.n++;
    const treffer = naam.match(VAST)![0];
    const vorm = treffer.replace(/\d+(?:[.,]\d+)?/, "#");
    e.vormen.set(vorm, (e.vormen.get(vorm) ?? 0) + 1);
    const leeg = r.w == null || String(r.w).trim() === "";
    const s = verdenkingen(naam, p).map((x) => x.soort);
    if (p.maxWattage != null && leeg && !s.some((x) => ONDERDRUKKENDE_VERDENKINGEN.has(x as never))) e.landend++;
    perMerk.set(r.merk ?? "?", e);
  }
  for (const [merk, e] of [...perMerk].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${merk.padEnd(20)} ${String(e.n).padStart(4)} namen · ${e.landend} landend`);
    for (const [v, n] of [...e.vormen].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`      ${v}  ×${n}`);
  }
  console.log(`\nalle namen:`);
  for (const r of raak.slice(0, 30)) {
    const p = parseProductName(r.naam ?? "");
    console.log(`  ${String(p.maxWattage).padStart(6)} W  ${r.merk} · ${(r.naam ?? "").slice(0, 62)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
