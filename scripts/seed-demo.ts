// Zet het Deerns-demodossier klaar in Neon én valideert de hele pijplijn tegen echte data:
// dossier → 5 spec-regels → match (top-kandidaat) → offerte. Idempotent (verwijdert eerst).
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projectDossiers } from "@/db/schema";
import {
  addSpecLines,
  createDossier,
  generateQuote,
  getQuote,
  getSpecLines,
  markNoMatch,
  matchSpecLine,
} from "@/lib/repo/dossiers";
import { searchProducts } from "@/lib/repo/products";

const NAME = "Deerns armaturenboek (demo)";
const LINES = [
  { fixtureCode: "Lp301", quantity: 12, brandText: "XAL", productText: "SASSO 100" },
  { fixtureCode: "Lr303", quantity: 6, brandText: "XAL", productText: "SASSO 60 Adjustable" },
  { fixtureCode: "Lw201", quantity: 8, brandText: "Wever & Ducré", productText: "SCAVA 1.0" },
  { fixtureCode: "Lp001-a", quantity: 20, brandText: "LedsC4", productText: "INFINITE PRO" },
  { fixtureCode: "Ls001", quantity: 4, brandText: "Glamox", productText: "i40" },
];

async function main() {
  // opruimen (cascade ruimt spec_lines + quotes op)
  const existing = await db
    .select({ id: projectDossiers.id })
    .from(projectDossiers)
    .where(eq(projectDossiers.name, NAME));
  for (const d of existing)
    await db.delete(projectDossiers).where(eq(projectDossiers.id, d.id));

  const dossier = await createDossier(db, {
    name: NAME,
    customer: "Deerns / demo Eduard",
    phase: "tender",
    actor: "seed@brink",
  });
  await addSpecLines(db, dossier.id, LINES);

  const specLines = await getSpecLines(db, dossier.id);
  for (const line of specLines) {
    const candidates = await searchProducts(db, {
      query: line.productText ?? line.fixtureCode,
      brand: line.brandText,
      limit: 5,
      actor: "seed@brink",
      specLineId: line.id,
    });
    if (candidates.length > 0) {
      await matchSpecLine(db, line.id, candidates[0].id, "seed@brink");
      console.log(
        `✓ ${line.fixtureCode} → ${candidates[0].brandName} ${candidates[0].name.slice(0, 45)} (€${candidates[0].grossPrice}) · ${candidates.length} kandidaten`,
      );
    } else {
      await markNoMatch(db, line.id, "seed@brink");
      console.log(`○ ${line.fixtureCode} → geen match (${line.brandText})`);
    }
  }

  await generateQuote(db, dossier.id, "seed@brink");
  const quote = await getQuote(db, dossier.id);
  console.log(`\nOfferte: ${quote?.lines.length} regels · totaal €${quote?.total.toFixed(2)}`);
  console.log(`Dossier-id: ${dossier.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
