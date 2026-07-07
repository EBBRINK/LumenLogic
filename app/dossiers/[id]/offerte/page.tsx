import { notFound } from "next/navigation";
import { db } from "@/db/client";
import {
  QuoteView,
  type EstimateHeader,
  type EstimateLine,
} from "@/components/dossier/quote-view";
import {
  PrintButton,
  XisPushDialog,
  type ExistingExport,
} from "@/components/dossier/xis-push-dialog";
import { Button } from "@/components/ui/button";
import { getDossier, getQuote, getSpecLines } from "@/lib/repo/dossiers";
import { getXisExports, preflightSummary } from "@/lib/repo/xis";
import type { Deviation, MatchStatus } from "@/components/dossier/types";
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
        Kopblok bewerken
      </summary>
      <form action={saveQuoteHeaderAction} className="border-t p-4">
        <input type="hidden" name="dossierId" value={dossierId} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {field("quoteNumber", "Offertenummer", q.quoteNumber)}
          {field("quoteDate", "Datum", q.quoteDate, "date")}
          {field("validUntil", "Geldig tot", q.validUntil, "date")}
          {field("customer", "Klant", q.customer)}
          {field("contactName", "Contactpersoon", q.contactName)}
          {field("address", "Adres", q.address)}
          {field("projectRef", "Project", q.projectRef)}
          {field("authorEmail", "Opsteller", q.authorEmail)}
        </div>
        <div className="mt-3">
          <Button type="submit" size="sm">
            Kopblok opslaan
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
export default async function EstimatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const dossier = await getDossier(db, id);
  if (!dossier) notFound();

  const [specRows, quote, preflight, exports] = await Promise.all([
    getSpecLines(db, id),
    getQuote(db, id),
    preflightSummary(db, id),
    getXisExports(db, id),
  ]);

  const lines: EstimateLine[] = specRows.map((r) => ({
    id: r.id,
    fixtureCode: r.fixtureCode,
    zone: r.zone,
    status: r.status as MatchStatus,
    quantity: r.quantity,
    productName: r.matchedName ?? null,
    sku: r.matchedArticleCode ?? null,
    unitPrice: r.manualPrice ?? r.matchedPrice ?? null, // I-04: dagprijs wint
    deviations: (r.deviations as Deviation[] | null) ?? null,
    brandText: r.brandText,
    productText: r.productText,
  }));

  const q = quote?.quote ?? null;
  const header: EstimateHeader = {
    quoteNumber: q?.quoteNumber ?? null,
    quoteDate: q?.quoteDate ?? null,
    customer: q?.customer ?? dossier.customer,
    projectRef: q?.projectRef ?? null,
    author: q?.authorEmail ?? null,
    validUntil: q?.validUntil ?? null,
  };

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
          {quote ? "Ververs estimate" : "Genereer estimate"}
        </Button>
      </form>
      <PrintButton />
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
