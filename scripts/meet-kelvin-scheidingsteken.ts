// Wat doet de uitbreiding van KELVIN_BEREIK met het aantal LANDENDE voorstellen?
//
// Eén run geeft vóór én ná, want beide regexen zitten in dit bestand: de oude (alleen een
// koppelteken) en de nieuwe (koppelteken, schuine streep, en `K` optioneel op het eerste getal).
// Zo hoeft niemand twee commits uit te checken om het verschil te zien.
//
// LANDEND betekent: de naam levert een kelvin op, de kolom is nog leeg, en geen enkele andere
// onderdrukking hield het voorstel al tegen. Alleen dát aantal beweegt echt — een voorstel dat
// toch al niet landde, telt niet mee als winst of verlies.
//
//   bun --env-file=.env.branch scripts/meet-kelvin-scheidingsteken.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";
import { ONDERDRUKKENDE_VERDENKINGEN } from "@/lib/repo/enrichment";

const OUD = /\d{3,5}\s*[-–]\s*\d{3,5}\s*K\b/i;
const NIEUW = /\d{3,5}\s*K?\s*[-–\/]\s*\d{3,5}\s*K\b/i;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name, kelvin: products.kelvin })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  let landendOud = 0;
  let landendNieuw = 0;
  const nieuwGeweerd = new Map<string, { n: number; vb: string }>();
  for (const r of rijen) {
    const naam = r.naam ?? "";
    const p = parseProductName(naam);
    if (p.kelvin == null) continue;
    if (r.kelvin != null && String(r.kelvin).trim() !== "") continue; // kolom al gevuld

    // Andere onderdrukkingen dan de kelvin-bereikregel zelf: die golden vóór en ná.
    const anders = verdenkingen(naam, p)
      .filter((v) => !(v.veld === "kelvin" && v.soort === "bereik"))
      .map((v) => v.soort);
    if (anders.some((s) => ONDERDRUKKENDE_VERDENKINGEN.has(s as never))) continue;

    const oudGeweerd = OUD.test(naam);
    const nieuwWeert = NIEUW.test(naam);
    if (!oudGeweerd) landendOud++;
    if (!nieuwWeert) landendNieuw++;
    if (!oudGeweerd && nieuwWeert) {
      const e = nieuwGeweerd.get(r.merk ?? "?") ?? { n: 0, vb: naam };
      e.n++;
      nieuwGeweerd.set(r.merk ?? "?", e);
    }
  }

  console.log(`producten met een kelvin uit de naam én een lege kolom, niet al anders geweerd:\n`);
  console.log(`  landend met de OUDE regel (alleen koppelteken) : ${landendOud}`);
  console.log(`  landend met de NIEUWE regel (ook schuine streep): ${landendNieuw}`);
  console.log(`  verschil                                        : ${landendNieuw - landendOud}`);
  console.log(`\nnieuw geweerd, per merk:`);
  let tot = 0;
  for (const [merk, e] of [...nieuwGeweerd].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${merk.padEnd(20)} ${String(e.n).padStart(4)}   ${e.vb.slice(0, 62)}`);
    tot += e.n;
  }
  console.log(`  ${"TOTAAL".padEnd(20)} ${String(tot).padStart(4)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
