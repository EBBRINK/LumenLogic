// Wijst de runs af die door een latere reparatie zijn achterhaald, zodat er per merk precies
// één openstaande run overblijft. `rejectRun` mag alleen vóór publiceren en raakt geen
// productdata — het zet de run op 'afgewezen' en logt dat.
//
// WAAROM DIT MOET. Timo tekent PER MERK. Staan er zeven Wever & Ducré-runs open, dan kan hij
// er een pakken van vóór de `2X6/9W`- en `W/M`-reparaties en publiceert hij precies de waarden
// die vandaag zijn weggehaald. Het overzicht toont dan zeven regels die er alle zeven even
// geldig uitzien.
//
// De toets is machinaal na te lopen: een run van ná de leeg-kolomreparatie draagt
// `counts.kolomAlGevuld`. Ontbreekt dat, dan is de run van vóór 30 jul 19:53.
//
//   DRY_RUN=1 bun --env-file=.env.branch scripts/wijs-verouderde-runs-af.ts   (alleen tonen)
//   bun --env-file=.env.branch scripts/wijs-verouderde-runs-af.ts
import { assertBranchDb, logGuard } from "./branch-guard";

// Bewust met de hand opgeschreven en niet afgeleid: afwijzen is een besluit, geen berekening.
const AF: Array<[string, string]> = [
  ["4aa5023c-8815-48c0-8ada-f0f86d1f032d", "W&D — vóór de leeg-kolomreparatie (geen kolomAlGevuld)"],
  ["a853965e-8d63-46aa-8a4b-9ba42647f046", "W&D — vóór de leeg-kolomreparatie"],
  ["647f35e5-7ac2-4f16-9c19-fa22e6a1c948", "W&D — vóór de leeg-kolomreparatie"],
  ["f2ee48a3-ec0b-4756-ab7e-6e613992f40e", "W&D — vóór de leeg-kolomreparatie"],
  ["13b4a956-c395-424b-ad80-3c55db8e3e37", "W&D — vóór de leeg-kolomreparatie"],
  ["7975ac63-7c8a-4956-9dbe-55f05eaf7375", "W&D — vóór de leeg-kolomreparatie"],
  ["70c21e02-a86a-49ab-823a-ce0b51f0f2fa", "W&D — vóór de leeg-kolomreparatie én vóór de onderdeel-regels"],
  ["5848a407-b1b0-468e-a10f-4be9771ceda2", "Kreon — 32.917 voorstellen, waarvan 21.359 nooit konden landen"],
  ["ea7742ef-3b29-4b87-9e4e-449e5735c2a0", "XAL — 13.407 voorstellen van vóór de reparaties van vandaag"],
  ["2cac1cdd-217f-4430-ad86-4eba755d0db6", "Metalarte — leeg; ontstaan doordat --merk=TAL op Metalarte matchte"],
  ["69c72e2b-18d7-48f8-b312-d68a59a6141b", "Metalarte — leeg; zelfde oorzaak"],
];

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const droog = process.env.DRY_RUN === "1";
  const { db } = await import("@/db/client");
  const { rejectRun, getEnrichmentRun } = await import("@/lib/repo/enrichment");

  for (const [id, reden] of AF) {
    const run = await getEnrichmentRun(db, id);
    if (!run) {
      console.log(`  ?  ${id.slice(0, 8)} — bestaat niet`);
      continue;
    }
    if (run.status !== "steekproef") {
      console.log(`  ·  ${id.slice(0, 8)} — staat al op '${run.status}', ongemoeid gelaten`);
      continue;
    }
    if (droog) {
      console.log(`  →  ${id.slice(0, 8)} zou worden afgewezen — ${reden}`);
      continue;
    }
    await rejectRun(db, id, "sessie 28-merken (branch)");
    console.log(`  ✓  ${id.slice(0, 8)} afgewezen — ${reden}`);
  }
  console.log(
    droog
      ? "\\nDRY_RUN: er is niets gewijzigd."
      : "\\nKlaar. Controleer met scripts/meet-openstaande-runs.ts dat er per merk één run overblijft.",
  );
}
main().catch((e) => { console.error(e); process.exit(1); });
