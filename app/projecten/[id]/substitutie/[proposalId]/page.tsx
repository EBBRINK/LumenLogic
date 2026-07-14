import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { SubstitutionDoc } from "@/components/dossier/substitution-doc";
import { getDossier } from "@/lib/repo/dossiers";
import { getSubstitution } from "@/lib/repo/substitution";
import { requireSession } from "@/lib/session";
import { PrintButton } from "../../armaturenboek/print-button";

// Substitutievoorstel-document (F-06/07). Binnen de dossier-layout: die rendert de
// hoofd-header, fasebadge, tally en tabs al — deze pagina levert alléén zijn eigen inhoud
// (fragment), met een sub-terug-link naar de werkvoorbereiding-tab en een print-knop.
export default async function SubstitutiePage({
  params,
}: {
  params: Promise<{ id: string; proposalId: string }>;
}) {
  await requireSession();
  const { id, proposalId } = await params;
  const dossier = await getDossier(db, id);
  if (!dossier) notFound();
  const proposal = await getSubstitution(db, proposalId);
  // Voorstel moet bij dít dossier horen — anders geen toegang via deze URL.
  if (!proposal || proposal.dossierId !== id) notFound();

  return (
    <>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href={`/projecten/${id}/werkvoorbereiding`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Werkvoorbereiding
        </Link>
        <PrintButton />
      </div>
      <SubstitutionDoc
        dossierName={dossier.name}
        reference={proposal.reference}
        alternative={proposal.alternative}
        fields={proposal.fields}
        savingNote={proposal.savingNote}
        createdAt={
          proposal.createdAt
            ? new Date(proposal.createdAt).toISOString().slice(0, 10)
            : null
        }
      />
    </>
  );
}
