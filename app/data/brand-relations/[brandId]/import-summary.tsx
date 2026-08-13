// De uitkomst van een directe template-import, op het merkscherm waar de gebruiker na de
// upload landt. Zelfde model als apply-summary.tsx (C8): de tellingen reizen als
// querystring mee met de redirect die er toch al was; het eventkanaal
// (template_import_finished) blijft de bron van waarheid.
//
// ⚠️ Querystring = gebruikersinvoer: alles wordt geparst als niet-negatief geheel getal
// en anders weggegooid — er komt nooit vreemde tekst op het scherm.
// Kale <a> i.p.v. next/link om dezelfde reden als apply-summary.tsx (RSC-testharnas).

import type { TemplateImportResult } from "@/lib/repo/template-import";

const VLAG = "imported";
const AANTALLEN = "icounts";

/** Redirect-querystring (zonder '?'). Volgorde is het contract met readImportSummary. */
export function importSummaryQuery(result: TemplateImportResult): string {
  const counts = [
    result.createdProducts,
    result.updatedProducts,
    result.appliedFields,
    result.clearedFields,
    result.skippedFields,
    result.skippedRows,
    result.goneProducts,
    result.priceList.priceLines,
    result.priceList.archivedLines,
  ].join(",");
  return new URLSearchParams({ [VLAG]: "done", [AANTALLEN]: counts }).toString();
}

export type ImportSummary = {
  createdProducts: number;
  updatedProducts: number;
  appliedFields: number;
  clearedFields: number;
  skippedFields: number;
  skippedRows: number;
  goneProducts: number;
  priceLines: number;
  archivedLines: number;
};

function getal(v: string | undefined): number | null {
  if (v == null || !/^\d{1,9}$/.test(v)) return null;
  return Number.parseInt(v, 10);
}

/** searchParams → samenvatting, of null als er niets (geldigs) in staat. */
export function readImportSummary(
  sp: Record<string, string | string[] | undefined>,
): ImportSummary | null {
  const vlag = Array.isArray(sp[VLAG]) ? sp[VLAG][0] : sp[VLAG];
  if (vlag !== "done") return null;
  const raw = Array.isArray(sp[AANTALLEN]) ? sp[AANTALLEN][0] : sp[AANTALLEN];
  if (typeof raw !== "string") return null;
  const delen = raw.split(",").map(getal);
  if (delen.length !== 9 || !delen.every((n): n is number => n != null)) return null;
  return {
    createdProducts: delen[0],
    updatedProducts: delen[1],
    appliedFields: delen[2],
    clearedFields: delen[3],
    skippedFields: delen[4],
    skippedRows: delen[5],
    goneProducts: delen[6],
    priceLines: delen[7],
    archivedLines: delen[8],
  };
}

function Regel({ label, waarde }: { label: string; waarde: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-medium tabular-nums">{waarde}</dd>
    </div>
  );
}

export function TemplateImportSummary({ summary }: { summary: ImportSummary }) {
  return (
    <section className="mb-8 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10">
      <h2 className="mb-1 font-medium">Template imported</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        The file replaced this brand&apos;s data. The previous price list has
        been archived.
      </p>
      <dl className="flex flex-wrap gap-x-8 gap-y-4">
        <Regel label="Products created" waarde={summary.createdProducts} />
        <Regel label="Products updated" waarde={summary.updatedProducts} />
        <Regel label="Fields set" waarde={summary.appliedFields} />
        <Regel label="Fields cleared" waarde={summary.clearedFields} />
        <Regel label="Price lines" waarde={summary.priceLines} />
        <Regel label="Price lines archived" waarde={summary.archivedLines} />
        {summary.goneProducts > 0 && (
          <Regel label="Products no longer listed" waarde={summary.goneProducts} />
        )}
        {summary.skippedFields > 0 && (
          <Regel label="Fields skipped" waarde={summary.skippedFields} />
        )}
        {summary.skippedRows > 0 && (
          <Regel label="Rows skipped" waarde={summary.skippedRows} />
        )}
      </dl>
      {summary.goneProducts > 0 && (
        // Vervang-semantiek: dit getal is een gevolg van het bestand, geen fout — maar
        // zonder deze zin is "no longer listed" een raadsel én een stille verrassing.
        <p className="mt-4 max-w-prose text-sm text-muted-foreground">
          Products that were in the catalogue but not in this file have no
          price on the new price list, so they no longer appear in any search
          results. Their data and history are kept.
        </p>
      )}
      {(summary.skippedFields > 0 || summary.skippedRows > 0) && (
        <p className="mt-4 max-w-prose text-sm text-muted-foreground">
          Skipped fields could not be stored (wrong type or unknown column);
          skipped rows had a duplicate or missing article code, or no product
          name. Details are in the event log.
        </p>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
        The full trail — including what happened per product — is in the{" "}
        {/* Bewuste kale <a>, geen vergeten <Link> — zie de toelichting bovenaan. */}
        <a href="/data/event-log" className="underline underline-offset-4">
          event log
        </a>
        .
      </p>
    </section>
  );
}
