import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { QuoteView } from "@/components/dossier/quote-view";
import {
  PrintButton,
  XisPushDialog,
  type ExistingExport,
} from "@/components/dossier/xis-push-dialog";
import { Button } from "@/components/ui/button";
import { getEstimateData } from "@/lib/repo/estimate";
import { getXisExports, preflightSummary } from "@/lib/repo/xis";
import { requireSession } from "@/lib/session";
import {
  generateQuoteAction,
  saveQuoteHeaderAction,
} from "../../actions";
import { xisExportAction } from "./actions";

// A-10: kopblok bewerkbaar tot de estimate wordt uitgestuurd (bevroren → op slot).
function KopblokBewerken({
  dossierId,
  q,
  frozen,
}: {
  dossierId: string;
  q: {
    quoteNumber: string | null;
    customer: string | null;
    contactName: string | null;
    address: string | null;
    projectRef: string | null;
    authorEmail: string | null;
    quoteDate: string | null;
    validUntil: string | null;
  } | null;
  frozen: boolean;
}) {
  if (!q || frozen) return null;
  const field = (
    name: string,
    label: string,
    value: string | null,
    type = "text",
  ) => (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={value ?? ""}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
      />
    </label>
  );
  return (
    <details className="mb-6 rounded-lg border">
      <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
        Edit header
      </summary>
      <form action={saveQuoteHeaderAction} className="border-t p-4">
        <input type="hidden" name="dossierId" value={dossierId} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {field("quoteNumber", "Quote number", q.quoteNumber)}
          {field("quoteDate", "Date", q.quoteDate, "date")}
          {field("validUntil", "Valid until", q.validUntil, "date")}
          {field("customer", "Customer", q.customer)}
          {field("contactName", "Contact", q.contactName)}
          {field("address", "Address", q.address)}
          {field("projectRef", "Project", q.projectRef)}
          {field("authorEmail", "Author", q.authorEmail)}
        </div>
        <div className="mt-3">
          <Button type="submit" size="sm">
            Save header
          </Button>
        </div>
      </form>
    </details>
  );
}

const nlDate = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

// Tab ESTIMATE (§3.8/§3.9). Header + tabs komen uit layout.tsx → deze pagina rendert
// alleen zijn eigen inhoud (fragment). De estimate leest ÁLLE spec-regels (niet enkel
// de gegenereerde offerteregels), zodat blauw/rood/paars zichtbaar meelopen als p.m.
// Kopblok, regels én berekening komen uit lib/repo/estimate — dezelfde bron als de PDF.
export default async function EstimatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;

  const data = await getEstimateData(db, id);
  if (!data) notFound();
  const [preflight, exports] = await Promise.all([
    preflightSummary(db, id),
    getXisExports(db, id),
  ]);
  const { dossier, quote: q, header, lines } = data;

  const firstExport = exports[0];
  const existing: ExistingExport = firstExport
    ? {
        environment: firstExport.environment,
        createdAt: nlDate.format(new Date(firstExport.createdAt)),
        status: firstExport.status,
      }
    : null;

  const actions = (
    <>
      <form action={generateQuoteAction}>
        <input type="hidden" name="dossierId" value={dossier.id} />
        <Button type="submit" variant="secondary" size="sm">
          {q ? "Refresh estimate" : "Generate estimate"}
        </Button>
      </form>
      <PrintButton />
      <Button asChild variant="outline" size="sm">
        <a href={`/projects/${dossier.id}/quote/pdf`} download>
          Download PDF
        </a>
      </Button>
      <XisPushDialog
        dossierId={dossier.id}
        preflight={preflight}
        existing={existing}
        action={xisExportAction}
      />
    </>
  );

  return (
    <>
      <KopblokBewerken
        dossierId={dossier.id}
        q={q}
        frozen={q?.frozenAt != null}
      />
      <QuoteView
        dossierName={dossier.name}
        phase={dossier.phase}
        header={header}
        lines={lines}
        actions={actions}
      />
    </>
  );
}
