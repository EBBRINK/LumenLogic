import type { AnalyticsTiles } from "@/lib/repo/analytics-tiles";

import { TestPeriodBand } from "./test-period-band";
import {
  formatCount,
  formatPercent,
  plural,
  pluralWord,
  Tile,
  TileBar,
  TileDot,
  TileList,
  TileRow,
  TileStat,
} from "./tile";

// De negen tegels van sprint 2.1 + 2.2, in drie blokken (docs/plan-2.1-2.2-analytics.md §3).
// Server component: krijgt alles als prop, doet zelf geen enkele query.
//
// Besluit 4: elke tegel gaat door `Tile`, en `Tile` rendert zijn `emptyText` zodra zijn
// `data` leeg is. Een volledig lege `AnalyticsTiles` (alle arrays leeg, alle tellingen 0)
// levert dus negen tegels met "No data yet" op, geen enkele lege of verdwenen kaart.
//
// Kleur: uitsluitend tokens uit app/globals.css (--success/--warning/--destructive/
// --chart-1/--muted-foreground als bg-*-utility). DESIGN.md §7: kleur is nooit het enige
// onderscheid — elk bolletje staat naast zijn tekstlabel in de `TileRow`. Het bolletje zelf
// is aria-hidden (zie `TileDot`), juist omdat dat tekstlabel er altijd staat.
//
// De beschrijvingen onder elke kop zeggen wat de query telt, niet wat mooi klinkt: waar de
// query events telt staat er "events", waar hij niet filtert wordt geen filter beloofd.

const EMPTY = "No data yet";

/** De zes matcher-statussen. Code-namen blijven NL (DB-waarden), labels zijn Engels. */
const STATUS_LABEL: Record<string, string> = {
  groen: "Green",
  geel: "Yellow",
  blauw: "Blue",
  rood: "Red",
  paars: "Purple",
  open: "Open",
  // De query coalesce't een ontbrekende status naar 'onbekend'; zonder deze sleutel zou er
  // een Nederlands woord in de Engelse UI belanden.
  onbekend: "Unknown",
};

const STATUS_TONE: Record<string, string> = {
  groen: "bg-success",
  geel: "bg-warning",
  blauw: "bg-chart-1",
  rood: "bg-destructive",
  paars: "bg-muted-foreground",
  open: "bg-muted-foreground",
  onbekend: "bg-muted-foreground",
};

/** De veld-oordelen uit de `deviations`-jsonb. */
const VERDICT_LABEL: Record<string, string> = {
  groen: "Green",
  geel: "Yellow",
  rood: "Red",
  onbekend: "Unknown",
};

const VERDICT_TONE: Record<string, string> = {
  groen: "bg-success",
  geel: "bg-warning",
  rood: "bg-destructive",
  onbekend: "bg-muted-foreground",
};

/** De twee kandidatenlijsten uit de matcher, leesbaar gemaakt. */
const LIST_LABEL: Record<string, string> = {
  aantoonbaar: "provable",
  onvolledig: "incomplete",
  // Idem: de query coalesce't een ontbrekende lijst naar 'onbekend'.
  onbekend: "unknown",
};

/**
 * De status van een rij in de inlaadwachtrij. Exact dezelfde vertaling als
 * components/data/brand-load-queue.tsx, zodat dezelfde DB-waarde in de hele app hetzelfde
 * heet — daar stond al "Waiting" / "Loaded", hier stond `humanize()` en dus "Wachtend" /
 * "Ingeladen" in een verder Engelse UI.
 */
const QUEUE_STATUS_LABEL: Record<string, string> = {
  wachtend: "Waiting",
  ingeladen: "Loaded",
};

/** Veldnamen uit de matcher/spec-regels; onbekende velden worden generiek leesbaar gemaakt. */
const FIELD_LABEL: Record<string, string> = {
  kelvin: "Colour temperature",
  cri: "CRI",
  ip: "IP rating",
  watt: "Wattage",
  lumen: "Lumen",
  beamAngle: "Beam angle",
  sizeCm: "Size",
  shape: "Shape",
  color: "Colour",
  dimmable: "Dimmability",
  brand: "Brand",
  quantity: "Quantity",
};

/** camelCase en snake_case → losse woorden, eerste letter groot. */
function humanize(value: string): string {
  const words = value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : value;
}

function fieldLabel(field: string): string {
  return FIELD_LABEL[field] ?? humanize(field);
}

function BlockHeading({ id, children }: { id: string; children: string }) {
  return (
    <h2 id={id} className="mb-3 text-sm font-semibold text-foreground">
      {children}
    </h2>
  );
}

export function AnalyticsTilesView({ data }: { data: AnalyticsTiles }) {
  const { searchHealth, projects } = data;

  // KPI-tegels hebben geen lijst; hun "leeg" is "alles nul". Door dat als (lege) array aan
  // `Tile` te geven, loopt ook deze vorm door exact dezelfde lege tak.
  const searchRows = searchHealth.total > 0 ? [searchHealth] : [];
  const projectRows =
    projects.dossiers +
      projects.quotes +
      projects.quoteLines +
      projects.specLines >
    0
      ? [projects]
      : [];

  return (
    <div className="flex flex-col gap-8">
      <TestPeriodBand period={data.period} />

      {/* ── Blok A — sturen: wat loopt goed, wat ontbreekt (2.1) ───────────── */}
      <section aria-labelledby="analytics-block-steering">
        <BlockHeading id="analytics-block-steering">Steering</BlockHeading>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Tile
            title="Most considered products"
            // De query telt `product_considered`-events, niet unieke producten: hetzelfde
            // product dat twee keer wordt overwogen telt twee keer. De tekst zegt dat nu.
            description="Times a product was shown in a match result, split by list."
            emptyText={EMPTY}
            data={data.consideredProducts}
          >
            {(rows) => (
              <TileList>
                {rows.map((p, i) => (
                  <TileRow
                    key={`${p.brand ?? "-"}|${p.name}|${p.list}|${i}`}
                    label={p.name}
                    meta={`${p.brand ?? "Unknown brand"} · ${LIST_LABEL[p.list] ?? p.list}`}
                    value={formatCount(p.count)}
                  />
                ))}
              </TileList>
            )}
          </Tile>

          <Tile
            title="Matcher status split"
            // Ook hier events (`matched_status`), geen spec-regels: een regel die opnieuw
            // gematcht wordt — dat gebeurt live via "Mark as loaded" op /admin/loading —
            // telt opnieuw mee. "How spec lines came out of the matcher" beloofde dus meer
            // dan de query levert.
            description="Recorded matcher outcomes; a re-matched line counts again."
            emptyText={EMPTY}
            data={data.statusSplit}
          >
            {(rows) => {
              const total = rows.reduce((sum, r) => sum + r.count, 0);
              return (
                <TileList>
                  {rows.map((s) => (
                    <TileRow
                      key={s.status}
                      leading={
                        <TileDot toneClassName={STATUS_TONE[s.status] ?? ""} />
                      }
                      label={STATUS_LABEL[s.status] ?? s.status}
                      meta={formatPercent(s.count, total)}
                      value={formatCount(s.count)}
                    />
                  ))}
                </TileList>
              );
            }}
          </Tile>

          <Tile
            title="Where matches break down"
            description="Field and verdict from the recorded deviations."
            emptyText={EMPTY}
            data={data.breakdown}
          >
            {(rows) => (
              <TileList>
                {rows.map((b, i) => (
                  <TileRow
                    key={`${b.field}|${b.verdict}|${i}`}
                    leading={
                      <TileDot toneClassName={VERDICT_TONE[b.verdict] ?? ""} />
                    }
                    label={fieldLabel(b.field)}
                    meta={VERDICT_LABEL[b.verdict] ?? b.verdict}
                    value={formatCount(b.count)}
                  />
                ))}
              </TileList>
            )}
          </Tile>

          <Tile
            title="Gaps in spec lines"
            // "imported" beloofde een herkomst die de query niet toetst: hij telt lege
            // waarden over álle spec-regels, ongeacht hoe ze binnenkwamen.
            description="Empty values on the spec lines, per field."
            emptyText={EMPTY}
            data={data.specGaps}
          >
            {(rows) => (
              <ul className="flex flex-col gap-3 text-sm">
                {rows.map((g) => (
                  <li key={g.field} className="flex flex-col gap-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-foreground">
                        {fieldLabel(g.field)}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatCount(g.missing)} of {formatCount(g.total)} ·{" "}
                        {formatPercent(g.missing, g.total)}
                      </span>
                    </span>
                    <TileBar
                      ratio={g.total > 0 ? g.missing / g.total : 0}
                      toneClassName="bg-warning"
                    />
                  </li>
                ))}
              </ul>
            )}
          </Tile>

          <Tile
            title="Queries without results"
            // De oude ondertitel ("Deduplicated searches, test accounts excluded") klopte in
            // geen van beide helften: er wordt niet op account gefilterd — machine-actors als
            // ai:vangnet, system en seed@brink tellen gewoon mee — en het filter werkt op
            // querytekst (ZZTEST + lege query). Deze tekst benoemt precies dát filter.
            description="Unique queries, ZZTEST and empty queries excluded."
            emptyText={EMPTY}
            data={searchRows}
          >
            {(rows) => {
              const h = rows[0];
              return (
                <div className="flex flex-col gap-2">
                  <TileStat
                    // Eenheid = unieke querytekst, niet ruwe zoekacties; vandaar "queries".
                    label={pluralWord(
                      h.withoutResults,
                      "query without results",
                      "queries without results",
                    )}
                    value={formatCount(h.withoutResults)}
                    hint={`${formatPercent(h.withoutResults, h.total)} of ${plural(h.total, "query", "queries")}`}
                  />
                  <TileBar
                    ratio={h.total > 0 ? h.withoutResults / h.total : 0}
                    toneClassName="bg-destructive"
                  />
                </div>
              );
            }}
          </Tile>
        </div>
      </section>

      {/* ── Blok B — waar omzet blijft liggen (2.2) ────────────────────────── */}
      <section aria-labelledby="analytics-block-revenue">
        <BlockHeading id="analytics-block-revenue">
          Where revenue is left on the table
        </BlockHeading>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Tile
            title="Requested brands not in the catalogue"
            description="Asked for on spec lines, no products loaded yet."
            emptyText={EMPTY}
            data={data.brandsNotInCatalogue}
          >
            {(rows) => (
              <TileList>
                {rows.map((b, i) => (
                  <TileRow
                    key={`${b.brand}|${i}`}
                    label={b.brand}
                    meta={pluralWord(b.lines, "spec line", "spec lines")}
                    value={formatCount(b.lines)}
                  />
                ))}
              </TileList>
            )}
          </Tile>

          <Tile
            title="Brand load queue by demand"
            // De query filtert NIET op status en levert de hele wachtrij (top 10 op vraag).
            // Vandaag staat alles op 'wachtend', maar "Mark as loaded" op /admin/loading is
            // uitgeleverd: één klik en er stond "Loaded" onder "Brands waiting to be loaded".
            // De query mag ik niet aanraken, dus de UI lost het op: de kop/ondertitel claimt
            // geen status meer, en elke rij draagt haar eigen status als tekst in de meta.
            description="Every brand in the load queue, ranked by demand. Status per row."
            emptyText={EMPTY}
            data={data.brandLoadQueue}
          >
            {(rows) => (
              <TileList>
                {rows.map((q, i) => (
                  <TileRow
                    key={`${q.brand}|${i}`}
                    label={q.brand}
                    meta={`${QUEUE_STATUS_LABEL[q.status] ?? humanize(q.status)} · demand`}
                    value={formatCount(q.demand)}
                  />
                ))}
              </TileList>
            )}
          </Tile>

          <Tile
            title="Unmet product demand"
            description="Searched for, nothing in the catalogue matched."
            emptyText={EMPTY}
            data={data.unmetDemand}
          >
            {(rows) => (
              <TileList>
                {rows.map((u, i) => (
                  <TileRow
                    key={`${u.query}|${i}`}
                    label={u.query}
                    meta={pluralWord(u.count, "search", "searches")}
                    value={formatCount(u.count)}
                  />
                ))}
              </TileList>
            )}
          </Tile>
        </div>
      </section>

      {/* ── Blok C — klein en eerlijk ──────────────────────────────────────── */}
      <section aria-labelledby="analytics-block-projects">
        <BlockHeading id="analytics-block-projects">Projects</BlockHeading>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Tile
            title="Projects & quotes"
            // De query kent geen datumfilter: het zijn kale tellingen over de hele database.
            // Dat die database vandaag alleen testdata bevat maakt het geen periodefilter —
            // de band bovenaan zegt al dat dit onze eigen testdagen zijn.
            description="Totals over the whole database, not filtered by date."
            emptyText={EMPTY}
            footnote="Not a funnel: there are no stages and no conversion to report yet."
            data={projectRows}
            className="sm:col-span-2"
          >
            {(rows) => {
              const p = rows[0];
              return (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <TileStat
                    label={pluralWord(p.dossiers, "project", "projects")}
                    value={formatCount(p.dossiers)}
                  />
                  <TileStat
                    label={pluralWord(p.quotes, "quote", "quotes")}
                    value={formatCount(p.quotes)}
                  />
                  <TileStat
                    label={pluralWord(p.quoteLines, "quote line", "quote lines")}
                    value={formatCount(p.quoteLines)}
                  />
                  <TileStat
                    label={pluralWord(p.specLines, "spec line", "spec lines")}
                    value={formatCount(p.specLines)}
                  />
                </div>
              );
            }}
          </Tile>
        </div>
      </section>
    </div>
  );
}
