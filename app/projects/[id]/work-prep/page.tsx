import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { WerkvoorbereiderView } from "@/components/dossier/werkvoorbereider-view";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { WerkvoorbereiderLine } from "@/components/dossier/types";
import { getDossier, getSpecLines } from "@/lib/repo/dossiers";
import { getEquivalentAlternatives } from "@/lib/repo/equivalence";
import { requireUuid } from "@/lib/uuid";
import { getActor, requireSession } from "@/lib/session";
import { generateSubstitutionAction } from "../substitution/actions";

// Werkvoorbereiding-tab (§3.11): value-engineering ná gunning. De dossier-layout levert al
// de kop + tabs — deze pagina rendert alleen zijn eigen inhoud als fragment.
export default async function WerkvoorbereidingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  // id gaat als uuid in project_dossiers.id / spec_lines.dossier_id. Deze tab leunde op
  // de guard in de dossier-layout, maar layout en pagina renderen concurrent: zonder deze
  // regel is het een race wie er als eerste gooit, en de ruwe cast-fout hieronder wint van
  // een nette 404. Zie de regel bij requireUuid in lib/uuid.ts.
  requireUuid(id);
  const dossier = await getDossier(db, id);
  if (!dossier) notFound();

  // Ijzeren regel 4: value-engineering bestaat alleen ná gunning. In tender: poort dicht.
  // De fase-badge staat al in de dossier-layout; hier alleen een nette melding.
  if (dossier.phase !== "awarded") {
    return (
      // Geen actie: de fase omzetten gebeurt op het dossier zelf, niet hier. Dat is
      // een bewuste `action={null}` — ijzeren regel 4 wil hier geen uitweg bieden.
      <EmptyState
        title="This tab only exists when awarded"
        description="Alternatives and value engineering only appear once the project is set to “Won”. Default = safe: during the tender phase the tool shows nothing that could jeopardize spec equivalence."
        action={null}
      />
    );
  }

  const lines = await getSpecLines(db, id);
  const matched = lines.filter((l) => l.matchedProductId);
  const actor = await getActor();

  // Parallel aan de view houden we per regel het referentie-product + de alternatieven vast,
  // zodat we een substitutievoorstel kunnen genereren (F-06) en naar het productdetail linken.
  type SubLine = {
    specLineId: string;
    fixtureCode: string;
    referenceProductId: string;
    referenceName: string;
    alternatives: { id: string; name: string; brandName: string | null }[];
  };
  const subLines: SubLine[] = [];

  const vmLines: WerkvoorbereiderLine[] = [];
  for (const l of matched) {
    const referenceProductId = l.matchedProductId as string;
    const { alternatives } = await getEquivalentAlternatives(db, {
      phase: "awarded",
      referenceProductId,
      limit: 4,
      actor,
    });
    subLines.push({
      specLineId: l.id,
      fixtureCode: l.fixtureCode,
      referenceProductId,
      referenceName: l.matchedName ?? "",
      alternatives: alternatives.map((a) => ({
        id: a.id,
        name: a.name,
        brandName: a.brandName,
      })),
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

  const subActionable = subLines.filter((s) => s.alternatives.length > 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-end">
        <Link
          href={`/projects/${id}/luminaire-schedule/versions`}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Luminaire schedule versions →
        </Link>
      </div>

      <WerkvoorbereiderView dossierName={dossier.name} lines={vmLines} />

      {subActionable.length > 0 && (
        <section className="border-t pt-6">
          <h2 className="text-lg font-semibold tracking-tight">
            Generate substitution proposal
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Record an equivalent alternative as a printable proposal for the customer.
            The price difference is added as text only — money never counts in the
            ordering.
          </p>
          <div className="mt-4 flex flex-col gap-4">
            {subActionable.map((s) => (
              <div key={s.specLineId} className="rounded-lg border p-3">
                <p className="text-sm font-medium">
                  {s.fixtureCode}
                  {" · "}
                  <Link
                    href={`/products/${s.referenceProductId}`}
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {s.referenceName || "reference"}
                  </Link>
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {s.alternatives.map((alt) => (
                    <div
                      key={alt.id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <Link
                        href={`/products/${alt.id}`}
                        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        {alt.brandName ? `${alt.brandName} ` : ""}
                        {alt.name}
                      </Link>
                      <form action={generateSubstitutionAction}>
                        <input type="hidden" name="dossierId" value={id} />
                        <input
                          type="hidden"
                          name="specLineId"
                          value={s.specLineId}
                        />
                        <input
                          type="hidden"
                          name="referenceProductId"
                          value={s.referenceProductId}
                        />
                        <input
                          type="hidden"
                          name="alternativeProductId"
                          value={alt.id}
                        />
                        <Button type="submit" size="sm" variant="outline">
                          Generate substitution proposal
                        </Button>
                      </form>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
