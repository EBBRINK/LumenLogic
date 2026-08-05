// Cureert een realistisch, cross-merk "spots"-scenario voor de gelijkwaardigheidsengine
// (run 3-demo). De bron levert geen categorieën/duurzaamheid, dus zetten we op een kleine,
// duidelijk gemarkeerde set producten een gedeelde categorie + kelvin + (synthetische,
// merk-opgave-stijl) duurzaamheidscijfers. Zo vindt de werkvoorbereider echte groenere
// gelijkwaardige alternatieven voor de XAL SASSO 100. Idempotent. Draai ná seed:demo.
import { eq } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { db } from "@/db/client";
import { projectDossiers, specLines } from "@/db/schema";
import { generateQuote } from "@/lib/repo/dossiers";
import { chooseCandidate, runMatcher } from "@/lib/repo/matching";
import { ALLE_DOSSIERS } from "@/lib/repo/toegang";

const url = process.env.DATABASE_URL!;
const sql = neon(url);

type Sust = {
  cat: string;
  kelvin: number;
  w: number;
  rep: string;
  epd: number;
  origin: string;
};

async function pickId(where: string): Promise<string | null> {
  const rows = (await sql.query(
    `SELECT id FROM visible_products WHERE ${where} LIMIT 1`,
  )) as { id: string }[];
  return rows[0]?.id ?? null;
}

async function enrich(id: string, s: Sust) {
  await sql.query(
    `UPDATE products SET category_path=$2, kelvin=$3, warranty_months=$4,
       repairability=$5, epd_lifetime_hours=$6, country_of_origin=$7 WHERE id=$1`,
    [id, s.cat, s.kelvin, s.w, s.rep, s.epd, s.origin],
  );
}

const CAT = "Binnenverlichting >> Spot";

async function main() {
  // referentie-armatuur + vijf cross-merk downlights (echte producten uit de catalogus)
  const reference = await pickId(
    `brand_name='XAL' AND name ILIKE 'SASSO 100 SQ SP CEIL%'`,
  );
  if (!reference) throw new Error("Referentie SASSO 100 niet gevonden");

  const alts: { where: string; s: Sust }[] = [
    // Kreon — de groene kampioen: CRI90, langste garantie, best repareerbaar, langste levensduur
    { where: `brand_name='Kreon' AND name ILIKE 'Esprit ceiling%3000K%'`,
      s: { cat: CAT, kelvin: 3000, w: 120, rep: "A", epd: 100000, origin: "België" } },
    { where: `brand_name='TAL' AND name ILIKE 'BERRIER JUNIOR CEILING%3000K%'`,
      s: { cat: CAT, kelvin: 3000, w: 84, rep: "B", epd: 75000, origin: "België" } },
    { where: `brand_name='Egoluce' AND name ILIKE 'NEWTON FLAT SPOT%3000K%'`,
      s: { cat: CAT, kelvin: 3000, w: 60, rep: "B", epd: 50000, origin: "Italië" } },
    { where: `brand_name='Artemide Architectural' AND name ILIKE 'TAGORA 970 CEIL%3000K%'`,
      s: { cat: CAT, kelvin: 3000, w: 24, rep: "D", epd: 25000, origin: "Italië" } },
    { where: `brand_name='Axo Light' AND name ILIKE 'U-LIGHT CEILING%'`,
      s: { cat: CAT, kelvin: 3000, w: 36, rep: "C", epd: 35000, origin: "Italië" } },
  ];

  // referentie: moderate duurzaamheid, 3000K (conform de productnaam)
  await enrich(reference, { cat: CAT, kelvin: 3000, w: 36, rep: "C", epd: 35000, origin: "Oostenrijk" });
  let enriched = 1;
  for (const a of alts) {
    const id = await pickId(a.where);
    if (id) {
      await enrich(id, a.s);
      enriched++;
    } else {
      console.log(`  ⚠ niet gevonden: ${a.where}`);
    }
  }
  console.log(`✓ scenario verrijkt: ${enriched} producten (categorie + kelvin + duurzaamheid)`);

  // herkoppel de demo-regel Lp301 aan het echte SASSO 100-armatuur (i.p.v. het accessoire)
  const [dossier] = await db
    .select({ id: projectDossiers.id })
    .from(projectDossiers)
    .where(eq(projectDossiers.name, "Deerns armaturenboek (demo)"));
  if (dossier) {
    const lines = await db
      .select({ id: specLines.id, code: specLines.fixtureCode })
      .from(specLines)
      .where(eq(specLines.dossierId, dossier.id));
    const lp301 = lines.find((l) => l.code === "Lp301");
    if (lp301) {
      // matcher draaien (persisteert kandidaten + afwijkingen), dan expliciet het
      // echte SASSO 100-armatuur kiezen i.p.v. het accessoire.
      await runMatcher(db, lp301.id, "scenario@brink");
      await chooseCandidate(db, {
        specLineId: lp301.id,
        productId: reference,
        fromList: "aantoonbaar",
        actor: "scenario@brink",
      });
      await generateQuote(db, ALLE_DOSSIERS, dossier.id, "scenario@brink");
      console.log("✓ Lp301 herkoppeld aan XAL SASSO 100 SQ SP CEIL + offerte herzien");
    }
    console.log(`Dossier-id: ${dossier.id}`);
  }
  console.log(`Referentie-product-id: ${reference}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Scenario mislukt:", e);
    process.exit(1);
  });
