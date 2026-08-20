import { isLosOnderdeel } from "@/lib/onderdeel-signaal";
import { merkenMetLosseOnderdelen } from "@/lib/repo/onderdeel-merken";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { QuoteView } from "@/components/dossier/quote-view";
import { ExternalQuoteView } from "@/components/dossier/quote-view-extern";
import {
  PrintButton,
  XisPushDialog,
  type ExistingExport,
} from "@/components/dossier/xis-push-dialog";
import { Button } from "@/components/ui/button";
import { getEstimateData } from "@/lib/repo/estimate";
import { toPricelessEstimate } from "@/lib/repo/estimate-extern";
import { resolvePrijszicht } from "@/lib/repo/prijszicht";
import { getXisExports, preflightSummary } from "@/lib/repo/xis";
import { requireUuid } from "@/lib/uuid";
import {
  generateQuoteAction,
  saveQuoteHeaderAction,
} from "../../actions";
import { xisExportAction } from "./actions";
import { bewaakRoute } from "@/lib/route-toegang";
import { toegangScope } from "@/lib/repo/toegang";

// A-10: kopblok bewerkbaar tot de estimate wordt uitgestuurd (bevroren → op slot).
function KopblokBewerken({
  dossierId,
  q,
  frozen,
  openen,
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
  /** Kop nog niet compleet → meteen open; de gebruiker moet hier toch zijn (bug #6). */
  openen: boolean;
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
    <details open={openen} className="mb-6 rounded-lg border">
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
          {/* Sub-formulier in een uitklap: het corrigeert kopvelden. De primary van dit
              scherm is "Generate / Refresh estimate" in de actiebalk. */}
          <Button type="submit" size="sm" variant="outline">
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
  const toegang = await bewaakRoute("/projects/[id]/quote");
  const { id } = await params;
  // Layout en pagina renderen concurrent en dekken elkaar dus NIET; zonder deze
  // regel gooit getEstimateData de uuid-cast en wint die 500 van de nette 404 van
  // de layout. Zie de regel bij requireUuid in lib/uuid.ts.
  requireUuid(id);

  const data = await getEstimateData(db, toegangScope(toegang), id);
  if (!data) notFound();
  const [preflight, exports, prijszicht] = await Promise.all([
    preflightSummary(db, toegangScope(toegang), id),
    getXisExports(db, id),
    // Sprint 3.2b: mag deze gebruiker bedragen zien? Afgeleid uit organizations.type
    // (G31) via de sessie, en bij twijfel "extern" — default = veilig. Dezelfde functie
    // die de PDF-route gebruikt, dus scherm en download kunnen niet uit elkaar lopen.
    resolvePrijszicht(db, toegang.email),
  ]);
  const { dossier, quote: q, header, lines } = data;

  // Driver-waarschuwing (demo 12 aug): welke merken op dit stuk voeren losse drivers en
  // accessoires? Eén melding boven de tabel, met de merken erin genoemd — niet per regel,
  // want een waarschuwing op elk van veertig regels wordt weggekeken.
  //
  // Regels die zélf een los onderdeel zijn tellen niet mee: staat er al een driver op de
  // offerte, dan is de vraag voor dát merk beantwoord.
  const driverMerken = [
    ...(await merkenMetLosseOnderdelen(
      db,
      lines
        .filter((l) => !isLosOnderdeel(l.productName))
        .map((l) => l.productBrand ?? null),
    )),
  ].sort();

  const firstExport = exports[0];
  const existing: ExistingExport = firstExport
    ? {
        environment: firstExport.environment,
        createdAt: nlDate.format(new Date(firstExport.createdAt)),
        status: firstExport.status,
      }
    : null;

  // UX-audit bug #6: Print / Download PDF / → To XIS zijn uitgangen naar de klant.
  // Zolang datum of geldigheid leeg is, is het stuk geen aanbod en horen ze er niet te
  // staan — afwezig, niet uitgegrijsd (zelfde lijn als BrandDeleteBlock: een dode knop
  // leert niets en nodigt uit tot klikken). "Generate estimate" blijft wél staan: dát
  // is de stap die datum én geldigheid invult.
  //
  // De poort zelf (outputsAllowed) komt uit computeEstimate en telt de bevriezing mee:
  // een uitgestuurde offerte IS het klantstuk en gaat nooit op slot. Zonder die
  // uitzondering haalde deze pagina Print/PDF/XIS weg bij élke bestaande offerte —
  // en bij een bevroren offerte rendert KopblokBewerken hieronder niets, dus er was
  // geen weg terug.
  const frozen = data.frozen;
  const outputsAllowed = data.computed.outputsAllowed;
  // Is "Edit header" straks écht in beeld? Exact dezelfde voorwaarde als
  // KopblokBewerken hieronder — de banner in QuoteView mag alleen naar dat blok
  // verwijzen als het er staat.
  const headerEditable = q != null && !frozen;

  const actions = (
    <>
      <form action={generateQuoteAction}>
        <input type="hidden" name="dossierId" value={dossier.id} />
        {/* De primary van /projects/[id]/quote (DESIGN.md §6): dit bouwt de estimate op
            en overschrijft bij "Refresh" een bestaande — het zwaarste gevolg op deze
            pagina. Stond op het neutrale `secondary`-vlak, dus het lichtste element van
            het scherm. "Send to XIS" is zwaarder, maar die knop staat ín de dialoog en
            heeft dáár zijn eigen primary; de trigger op deze pagina opent alleen. */}
        <Button type="submit" size="sm">
          {q ? "Refresh estimate" : "Generate estimate"}
        </Button>
      </form>
      {outputsAllowed && (
        <>
          <PrintButton />
          <Button asChild variant="outline" size="sm">
            <a href={`/projects/${dossier.id}/quote/pdf`} download>
              Download PDF
            </a>
          </Button>
        </>
      )}
      {/* De XIS-dialoog blijft staan óók als de poort dicht is: hij is niet alleen de
          verzendknop maar ook de plek waar "Already sent — {datum} ({omgeving},
          {status})" te lezen valt. Dat exportspoor verbergen omdat het kopblok leeg is
          zou een administratie wissen om een lege datum. Alleen de push zelf gaat op
          slot — in de dialoog én in xisExportAction (een verborgen knop is geen poort). */}
      <XisPushDialog
        dossierId={dossier.id}
        preflight={preflight}
        existing={existing}
        action={xisExportAction}
        blockedReason={
          outputsAllowed
            ? null
            : `The quote header is incomplete (${data.computed.missingHeaderFields.join(", ")}). Fill it in before sending to XIS.`
        }
      />
    </>
  );

  // Twee renderpaden, geen vlag door één component (sprint 3.2b). Het externe pad krijgt
  // een PricelessEstimate binnen: dat type draagt geen stukprijs, geen regeltotaal en
  // geen totalenblok, dus er valt niets te verbergen — er is niets.
  //
  // Het kopblok-bewerkformulier blijft buiten het externe pad. Niet omdat het bedragen
  // toont (dat doet het niet) maar omdat het offertevelden schrijft; wie dat mag is
  // item 3.2a en wordt hier bewust niet uitgebreid.
  if (prijszicht === "extern") {
    return (
      <ExternalQuoteView
        estimate={toPricelessEstimate(data)}
        phase={dossier.phase}
        actions={actions}
      />
    );
  }

  return (
    <>
      <KopblokBewerken
        dossierId={dossier.id}
        q={q}
        frozen={frozen}
        openen={!outputsAllowed}
      />
      <QuoteView
        dossierName={dossier.name}
        phase={dossier.phase}
        header={header}
        lines={lines}
        actions={actions}
        frozen={frozen}
        headerEditable={headerEditable}
        driverMerken={driverMerken}
      />
    </>
  );
}
