import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { WerkvoorbereiderView } from "@/components/dossier/werkvoorbereider-view";
import { PhaseBadge } from "@/components/dossier/phase-badge";
import type { WerkvoorbereiderLine } from "@/components/dossier/types";
import { getDossier, getSpecLines } from "@/lib/repo/dossiers";
import { getEquivalentAlternatives } from "@/lib/repo/equivalence";
import { getActor, requireSession } from "@/lib/session";

export default async function WerkvoorbereidingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const dossier = await getDossier(db, id);
  if (!dossier) notFound();

  const back = (
    <Link
      href={`/dossiers/${dossier.id}`}
      className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" /> {dossier.name}
    </Link>
  );

  // Ijzeren regel 4: value-engineering bestaat alleen ná gunning. In tender: poort dicht.
  if (dossier.phase !== "awarded") {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        {back}
        <div className="rounded-lg border border-dashed p-8 text-center">
          <PhaseBadge phase="tender" />
          <p className="mt-3 font-medium">Werkvoorbereiding is uit in tender-stand</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Alternatieven en value-engineering verschijnen pas als het dossier op
            “gegund” staat. Default = veilig: in de tenderfase toont de tool niets
            dat de spec-gelijkwaardigheid in gevaar brengt.
          </p>
        </div>
      </main>
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
      quantity: l.quantity,
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

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      {back}
      <WerkvoorbereiderView dossierName={dossier.name} lines={vmLines} />
    </main>
  );
}
