import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { WerkvoorbereiderView } from "@/components/dossier/werkvoorbereider-view";
import type { WerkvoorbereiderLine } from "@/components/dossier/types";
import { getDossier, getSpecLines } from "@/lib/repo/dossiers";
import { getEquivalentAlternatives } from "@/lib/repo/equivalence";
import { getActor, requireSession } from "@/lib/session";

// Werkvoorbereiding-tab (§3.11): value-engineering ná gunning. De dossier-layout levert al
// de kop + tabs — deze pagina rendert alleen zijn eigen inhoud als fragment.
export default async function WerkvoorbereidingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const dossier = await getDossier(db, id);
  if (!dossier) notFound();

  // Ijzeren regel 4: value-engineering bestaat alleen ná gunning. In tender: poort dicht.
  // De fase-badge staat al in de dossier-layout; hier alleen een nette melding.
  if (dossier.phase !== "awarded") {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="font-medium">Deze tab is er alleen in gegund-stand</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Alternatieven en value-engineering verschijnen pas als het dossier op
          “gegund” staat. Default = veilig: in de tenderfase toont de tool niets
          dat de spec-gelijkwaardigheid in gevaar brengt.
        </p>
      </div>
    );
  }

  const lines = await getSpecLines(db, id);
  const matched = lines.filter((l) => l.matchedProductId);
  const actor = await getActor();

  const vmLines: WerkvoorbereiderLine[] = [];
  for (const l of matched) {
    const { alternatives } = await getEquivalentAlternatives(db, {
      phase: "awarded",
      referenceProductId: l.matchedProductId as string,
      limit: 4,
      actor,
    });
    vmLines.push({
      specLineId: l.id,
      fixtureCode: l.fixtureCode,
      quantity: l.quantity ?? 0,
      referenceName: l.matchedName ?? "",
      referenceBrand: l.matchedBrand ?? null,
      alternatives: alternatives.map((a) => ({
        id: a.id,
        name: a.name,
        brandName: a.brandName,
        articleCode: a.articleCode,
        kelvin: a.kelvin,
        grossPrice: a.grossPrice,
        equivalenceScore: a.equivalenceScore,
        rationale: a.rationale,
        technical: a.technical,
        sustainability: a.sustainability,
      })),
    });
  }

  return <WerkvoorbereiderView dossierName={dossier.name} lines={vmLines} />;
}
