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
} from "@/lib/repo/dossiers";
import { chooseCandidate, runMatcher } from "@/lib/repo/matching";
import { ALLE_DOSSIERS } from "@/lib/repo/toegang";

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

  const dossier = await createDossier(db, { orgId: null,
    name: NAME,
    customer: "Deerns / demo Eduard",
    xisPhase: "tender",
    actor: "seed@brink",
  });
  await addSpecLines(db, dossier.id, LINES);

  const specLines = await getSpecLines(db, dossier.id);
  for (const line of specLines) {
    // Vijfstatussen-matcher: bepaalt status + persisteert kandidaten. Bij een
    // bruikbare kandidaat kiezen we de best passende (rank 1), zodat de demo een
    // gevulde offerte oplevert; anders blijft de status staan (blauw/rood/paars).
    const outcome = await runMatcher(db, line.id, "seed@brink");
    const best = outcome.provable[0] ?? outcome.incomplete[0];
    if (best) {
      await chooseCandidate(db, {
        specLineId: line.id,
        productId: best.productId,
        fromList: outcome.provable[0] ? "aantoonbaar" : "onvolledig",
        actor: "seed@brink",
      });
      console.log(
        `✓ ${line.fixtureCode} → ${best.brandName} ${best.name.slice(0, 45)} (€${best.grossPrice}) · status ${outcome.status}`,
      );
    } else {
      console.log(`○ ${line.fixtureCode} → ${outcome.status} (${line.brandText})`);
    }
  }

  await generateQuote(db, ALLE_DOSSIERS, dossier.id, "seed@brink");
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
