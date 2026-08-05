import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { SubstitutionDoc } from "@/components/dossier/substitution-doc";
import { formatDate } from "@/lib/format";
import { getDossier } from "@/lib/repo/dossiers";
import { getSubstitution } from "@/lib/repo/substitution";
import { requireUuid } from "@/lib/uuid";
import { PrintButton } from "../../luminaire-schedule/print-button";
import { bewaakRoute } from "@/lib/route-toegang";
import { toegangScope } from "@/lib/repo/toegang";

// Substitutievoorstel-document (F-06/07). Binnen de dossier-layout: die rendert de
// hoofd-header, fasebadge, tally en tabs al — deze pagina levert alléén zijn eigen inhoud
// (fragment), met een sub-terug-link naar de werkvoorbereiding-tab en een print-knop.
export default async function SubstitutiePage({
  params,
}: {
  params: Promise<{ id: string; proposalId: string }>;
}) {
  const toegang = await bewaakRoute("/projects/[id]/substitution/[proposalId]");
  const { id, proposalId } = await params;
  // Beide uuid-kolommen (project_dossiers.id, substitution_proposals.id).
  requireUuid(id, proposalId);
  const dossier = await getDossier(db, toegangScope(toegang), id);
  if (!dossier) notFound();
  const proposal = await getSubstitution(db, proposalId);
  // Voorstel moet bij dít dossier horen — anders geen toegang via deze URL.
  if (!proposal || proposal.dossierId !== id) notFound();

  return (
    <>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href={`/projects/${id}/work-prep`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Work preparation
        </Link>
        <PrintButton />
      </div>
      {/* UX-audit 30 jul (bug #9): createdAt was een kale ISO-slice (`2026-07-30`) — een
          derde datumformaat naast de twee die de app al had. Nu de gedeelde formatter. */}
      <SubstitutionDoc
        dossierName={dossier.name}
        reference={proposal.reference}
        alternative={proposal.alternative}
        fields={proposal.fields}
        savingNote={proposal.savingNote}
        createdAt={proposal.createdAt ? formatDate(proposal.createdAt) : null}
      />
    </>
  );
}
