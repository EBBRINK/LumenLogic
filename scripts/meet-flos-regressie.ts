// REGRESSIETOETS op de nevenwerking van 4 aug: verliest een ANDER merk een voorstel doordat
// `verdenking.ts` nu ook de korte vorm als kandidaat telt?
//
// Het risico is concreet. `meerdere-waarden` onderdrukt een voorstel zodra een naam twee
// verschillende waarden voor hetzelfde veld draagt. Vóór 4 aug zag die telling alleen de lange
// vorm; nu ziet hij ook "30KC90". Een naam met één lange én één korte waarde ging dus van
// 1 kandidaat naar 2 — en zou nu geweerd worden waar hij eerst landde.
//
// Dit script rekent de OUDE toestand na (lange vorm, ruwe tekstvergelijking) en zet hem naast
// de nieuwe, op de hele catalogus.
//
//   bun --env-file=.env.branch scripts/meet-flos-regressie.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName, kelvinKandidaten, criKandidaten } from "@/lib/enrichment/parser";

// Exact de regexen zoals ze vóór 4 aug in verdenking.ts stonden.
const OUD_KELVIN = /(\d{3,5})\s*K(?:elvin)?\b/gi;
const OUD_CRI = /\b(?:CRI|Ra)\s*:?\s*(?:≥|>=|>)?\s*(\d{2,3})/gi;
const OUD_KELVIN_PARSER = /(\d{3,5})\s*K(?:elvin)?\b/i;
const OUD_CRI_PARSER = /\b(?:CRI|Ra)\s*:?\s*(?:≥|>=|>)?\s*(\d{2,3})/i;

function oudeWaarden(naam: string, re: RegExp): string[] {
  return [...new Set([...naam.matchAll(new RegExp(re.source, re.flags))].map((m) => m[1]))];
}

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq, isNotNull } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId))
    .where(isNotNull(products.name));
  console.log(`catalogus: ${rijen.length} producten\n${"═".repeat(70)}`);

  // Een naam VERLIEST iets als de oude parser er een waarde uit haalde, de oude telling maar
  // één kandidaat zag (dus geen onderdrukking), en de nieuwe telling er meer ziet.
  const verlies = new Map<string, { kelvin: number; cri: number; vb: string[] }>();
  let totaalK = 0, totaalC = 0;
  for (const r of rijen) {
    const naam = r.naam ?? "";
    const e = verlies.get(r.merk ?? "?") ?? { kelvin: 0, cri: 0, vb: [] };

    // kelvin
    const oudGaf = OUD_KELVIN_PARSER.exec(naam);
    if (oudGaf) {
      const k = parseInt(oudGaf[1], 10);
      if (k >= 2000 && k <= 8000) {
        const oudN = oudeWaarden(naam, OUD_KELVIN).length;
        const nieuwN = new Set(kelvinKandidaten(naam)).size;
        if (oudN === 1 && nieuwN > 1) {
          e.kelvin++; totaalK++;
          if (e.vb.length < 4) e.vb.push(`kelvin: ${naam.slice(0, 60)} → kandidaten ${[...new Set(kelvinKandidaten(naam))].join(",")}`);
        }
      }
    }
    // cri
    const oudGafC = OUD_CRI_PARSER.exec(naam);
    if (oudGafC) {
      const c = parseInt(oudGafC[1], 10);
      if (c > 0 && c <= 100) {
        const oudN = oudeWaarden(naam, OUD_CRI).length;
        const nieuwN = new Set(criKandidaten(naam)).size;
        if (oudN === 1 && nieuwN > 1) {
          e.cri++; totaalC++;
          if (e.vb.length < 4) e.vb.push(`cri: ${naam.slice(0, 60)} → kandidaten ${[...new Set(criKandidaten(naam))].join(",")}`);
        }
      }
    }
    if (e.kelvin || e.cri) verlies.set(r.merk ?? "?", e);
  }

  console.log(`namen die van 1 naar >1 kandidaat gaan (en dus NIEUW onderdrukt worden):`);
  console.log(`  kelvin: ${totaalK} · cri: ${totaalC}\n`);
  for (const [merk, e] of [...verlies].sort((a, b) => (b[1].kelvin + b[1].cri) - (a[1].kelvin + a[1].cri))) {
    console.log(`  ${merk.padEnd(24)} kelvin ${String(e.kelvin).padStart(5)} · cri ${String(e.cri).padStart(5)}`);
    for (const v of e.vb) console.log(`      ${v}`);
  }
  if (!verlies.size) console.log(`  (geen enkel merk raakt een voorstel kwijt)`);

  // De omgekeerde kant: verandert de PARSERWAARDE ergens waar de oude vorm al een waarde gaf?
  let anders = 0;
  const andersVb: string[] = [];
  for (const r of rijen) {
    const naam = r.naam ?? "";
    const oud = OUD_KELVIN_PARSER.exec(naam);
    if (!oud) continue;
    const k = parseInt(oud[1], 10);
    if (k < 2000 || k > 8000) continue;
    const nieuw = parseProductName(naam).kelvin;
    if (nieuw !== k) { anders++; if (andersVb.length < 8) andersVb.push(`${naam.slice(0, 56)} : oud ${k} → nieuw ${nieuw}`); }
  }
  console.log(`\nnamen waar de LANGE vorm al een kelvin gaf en de nieuwe parser iets ANDERS geeft: ${anders}`);
  for (const v of andersVb) console.log(`  ${v}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
