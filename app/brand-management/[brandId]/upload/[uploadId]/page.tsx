// Het voorstel-scherm van het retour-pad (sprint 1.2, docs/plan-1-2-retourpad.md).
// Tussen "het merk leverde een bestand" en "de catalogus wijzigt" staat precies deze
// pagina — en er staat nog niets in de catalogus.
//
// DE DIFF WORDT HIER VERS BEREKEND EN NERGENS BEWAARD (besluit 2). Dat is geen
// prestatie-afweging maar een eerlijkheids-eis: een opgeslagen diff toont "oud"-waarden
// van gisteren en past bij goedkeuren iets toe wat de gebruiker niet zag. Wat je hier
// leest is de catalogus van dít moment; applyTemplateProposal herberekent hem nog eens en
// vergelijkt met de waarden die op dít scherm stonden (de stale-guard).
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { brands } from "@/db/schema";
import { TemplateProposal } from "@/components/data/template-proposal";
import { eigenVeldKey } from "@/lib/custom-fields";
import { getTemplateReturn } from "@/lib/repo/template-return";
import { requireUuid } from "@/lib/uuid";
import {
  approveTemplateProposalAction,
  rejectTemplateProposalAction,
} from "../../upload-actions";
import { bewaakRoute } from "@/lib/route-toegang";

export default async function TemplateVoorstelPage({
  params,
}: {
  params: Promise<{ brandId: string; uploadId: string }>;
}) {
  await bewaakRoute("/brand-management/[brandId]/upload/[uploadId]");
  const { brandId, uploadId } = await params;
  // Beide params zijn uuid-kolommen (brands.id, brand_uploads.id) en beide gaan in
  // dezelfde Promise.all — één kapotte van de twee gooit dus de hele render om.
  requireUuid(brandId, uploadId);

  const [[brand], retour] = await Promise.all([
    db.select().from(brands).where(eq(brands.id, brandId)).limit(1),
    getTemplateReturn(db, uploadId),
  ]);

  // KRUISLEK-GUARD (precedent: de import-run-pagina eist run.dossierId === id). De upload
  // moet bij DÍT merk horen: anders toont /brand-relations/A het voorstel van merk B, en
  // zou goedkeuren daar de data van B in de producten van A schrijven. getTemplateReturn
  // bewaakt `kind === 'template'` zelf (een prijslijst-upload uit het merkportaal heeft
  // een andere payload en geeft daar null), maar het merk kent alléén de route.
  if (!brand || !retour || retour.upload.brandId !== brandId) notFound();

  const { upload, payload, proposal, actievePrijslijst, eigenVelden } = retour;

  // Sprint 1.8: het scherm kent de sleutelvorm `custom:<uuid>` niet en hoeft dat ook niet
  // — het krijgt een kant-en-klare labelmap. GEARCHIVEERDE velden zitten er bewust ook in:
  // een bestand dat onderweg was toen het veld nog bestond, moet zijn kolom hier met naam
  // en toenaam zien in plaats van als kale sleutel.
  const eigenVeldLabels = Object.fromEntries(
    eigenVelden.map((def) => [eigenVeldKey(def), def.labelEn]),
  );

  const terug = (
    <Link
      href={`/brand-management/${brandId}`}
      className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" /> {brand.name}
    </Link>
  );

  // Al afgehandeld: geen formulier meer (precedent: de import-run-pagina). Een tweede tab
  // die hier nog open stond mag geen knop tonen die niets meer doet — applyTemplateProposal
  // zou hem afvangen, maar een knop die stil niets doet is precies het verboden gedrag
  // (zie besluit 9 over het /admin/imports-gat).
  if (upload.status !== "staging") {
    return (
      <main className="mx-auto w-full max-w-7xl px-6 py-8">
        {terug}
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">
          Template proposal
        </h1>
        <p className="text-sm text-muted-foreground">
          This proposal for{" "}
          <span className="tabular-nums">{payload.filename}</span> has already
          been{" "}
          {upload.status === "approved" ? "approved" : "rejected"}
          {upload.reviewedBy && <> by {upload.reviewedBy}</>}.
          {upload.status === "approved"
            ? " The checked changes are in the catalogue."
            : " Nothing from this file was applied."}
        </p>
        {upload.reviewNote && (
          <p className="mt-1 text-sm text-muted-foreground">
            Note: {upload.reviewNote}
          </p>
        )}
      </main>
    );
  }

  // Alleen naam + einddatum: het scherm belooft "prices will be added to X (valid until
  // Y)" en heeft de rest van de lijst niet nodig.
  const actieveLijst = actievePrijslijst
    ? { name: actievePrijslijst.name, validUntil: actievePrijslijst.validUntil }
    : null;

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      {terug}
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Template proposal
          <span className="ml-2 text-base font-normal text-muted-foreground">
            {brand.name}
          </span>
        </h1>
      </header>

      <TemplateProposal
        brandId={brandId}
        uploadId={upload.id}
        filename={payload.filename}
        rowCount={payload.rijen.length}
        proposal={proposal}
        waarschuwingen={payload.waarschuwingen}
        activePriceList={actieveLijst}
        eigenVeldLabels={eigenVeldLabels}
        approveAction={approveTemplateProposalAction}
        rejectAction={rejectTemplateProposalAction}
      />
    </main>
  );
}
