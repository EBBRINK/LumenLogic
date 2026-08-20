// De uitkomst van een goedgekeurd merktemplate, op het scherm waar de gebruiker naartoe
// gestuurd wordt (reviewzwerm 2.5a, C8).
//
// WAT DIT WEL EN NIET IS. `applyTemplateProposal` geeft zes tellingen terug; de action gooide
// die weg en redirectte. Er ging daarmee NIETS verloren: lib/repo/template-return.ts logt
// `template_apply_finished` mét alle tellingen, en components/data/event-log-block.tsx heeft
// die sleutels expliciet in zijn PAYLOAD_LABEL-whitelist staan. Het doelscherm verandert
// bovendien zichtbaar (de upload verdwijnt uit "Waiting for your review", de relatiestatus
// springt naar 'verwerkt', de scorecard loopt op). Dit is dus een UX-verbetering, geen
// datalek en geen ontbrekend spoor: de tellingen ontbraken alleen op het moment dat de
// gebruiker keek.
//
// DAAROM IS DIT BEWUST KLEIN. Geen nieuw meldingssysteem, geen flash-cookie, geen state in
// de database — de tellingen reizen als querystring mee met de redirect die er toch al was,
// en de pagina rendert er één blok van. Het eventkanaal blijft ongemoeid en blijft de bron
// van waarheid; deze samenvatting verwijst er expliciet naar.
//
// ⚠️ Querystring = gebruikersinvoer. Alles wat hier binnenkomt wordt geparst als
// niet-negatief geheel getal en anders weggegooid — er komt nooit vreemde tekst op het
// scherm. (De zod-laag van blok 1 bestaat in deze worktree nog niet; dit is met opzet een
// paar regels handwerk en geen nieuwe afhankelijkheid.)
//
// Bewust een kale <a> en géén next/link, precies zoals app/not-found.tsx: de RSC-testharnas
// kan een SERVER-component die next/link importeert niet inladen (de react-server-build van
// Link klapt met "client reference export is called on server", gemeten 30 jul in
// vitest-plugin-rsc 0.2.3). Zonder die ruil is dit blok niet te testen, en juist de
// tellingen erop moeten bewaakt worden. Eén harde navigatie naar het eventlog is die ruil
// waard. Zodra de harnas het aankan mag dit een <Link> worden.

/** Wat de action van applyTemplateProposal doorgeeft aan de doelpagina. */
export type ApplySummary =
  | { kind: "already" }
  | {
      kind: "done";
      createdProducts: number;
      updatedProducts: number;
      appliedFields: number;
      skippedStaleFields: number;
      priceLines: { inserted: number; updated: number; archivedLines: number } | null;
    };

const AANTALLEN = "counts";
const PRIJZEN = "prices";
const VLAG = "applied";

/** Redirect-querystring (zonder '?'), of "" als er niets te melden valt. */
export function applySummaryQuery(summary: ApplySummary): string {
  if (summary.kind === "already") return `${VLAG}=already`;
  const counts = [
    summary.createdProducts,
    summary.updatedProducts,
    summary.appliedFields,
    summary.skippedStaleFields,
  ].join(",");
  const params = new URLSearchParams({ [VLAG]: "done", [AANTALLEN]: counts });
  if (summary.priceLines) {
    params.set(
      PRIJZEN,
      [
        summary.priceLines.inserted,
        summary.priceLines.updated,
        summary.priceLines.archivedLines,
      ].join(","),
    );
  }
  return params.toString();
}

function getal(v: string | undefined): number | null {
  if (v == null || !/^\d{1,9}$/.test(v)) return null;
  return Number.parseInt(v, 10);
}

function lijst(v: string | string[] | undefined, lengte: number): number[] | null {
  const raw = Array.isArray(v) ? v[0] : v;
  if (typeof raw !== "string") return null;
  const delen = raw.split(",");
  if (delen.length !== lengte) return null;
  const uit = delen.map(getal);
  return uit.every((n): n is number => n != null) ? uit : null;
}

/** searchParams → samenvatting, of null als er niets (geldigs) in staat. */
export function readApplySummary(
  sp: Record<string, string | string[] | undefined>,
): ApplySummary | null {
  const vlag = Array.isArray(sp[VLAG]) ? sp[VLAG][0] : sp[VLAG];
  if (vlag === "already") return { kind: "already" };
  if (vlag !== "done") return null;

  const counts = lijst(sp[AANTALLEN], 4);
  if (!counts) return null;
  const prijzen = lijst(sp[PRIJZEN], 3);
  return {
    kind: "done",
    createdProducts: counts[0],
    updatedProducts: counts[1],
    appliedFields: counts[2],
    skippedStaleFields: counts[3],
    priceLines: prijzen
      ? { inserted: prijzen[0], updated: prijzen[1], archivedLines: prijzen[2] }
      : null,
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

export function TemplateApplySummary({ summary }: { summary: ApplySummary }) {
  if (summary.kind === "already") {
    return (
      <section className="mb-8 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10">
        <h2 className="mb-1 font-medium">Already processed</h2>
        <p className="text-sm text-muted-foreground">
          This proposal had already been applied — nothing was written a second
          time.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-8 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10">
      <h2 className="mb-1 font-medium">Template applied</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        What the approved proposal wrote to the catalogue.
      </p>
      <dl className="flex flex-wrap gap-x-8 gap-y-4">
        <Regel label="Products created" waarde={summary.createdProducts} />
        <Regel label="Products updated" waarde={summary.updatedProducts} />
        <Regel label="Fields applied" waarde={summary.appliedFields} />
        <Regel
          label="Fields skipped (stale)"
          waarde={summary.skippedStaleFields}
        />
        {summary.priceLines && (
          <>
            <Regel label="Price lines added" waarde={summary.priceLines.inserted} />
            <Regel label="Price lines updated" waarde={summary.priceLines.updated} />
            <Regel
              label="Price lines archived"
              waarde={summary.priceLines.archivedLines}
            />
          </>
        )}
      </dl>
      {summary.skippedStaleFields > 0 && (
        // De stale-guard is geen fout maar een bewuste weigering: de catalogus wijzigde
        // tussen tonen en goedkeuren, dus die velden zijn NIET overschreven. Zonder deze
        // zin is het getal hierboven een raadsel.
        <p className="mt-4 max-w-prose text-sm text-muted-foreground">
          Skipped fields had changed in the catalogue between showing the
          proposal and approving it. They were left as they are — upload the
          template again to see them fresh.
        </p>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
        The full trail — including what happened per product — is in the{" "}
        {/* Bewuste kale <a>, geen vergeten <Link> — zie de toelichting bovenaan. */}
        <a href="/admin/event-log" className="underline underline-offset-4">
          event log
        </a>
        .
      </p>
    </section>
  );
}
