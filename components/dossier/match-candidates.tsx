import { IconCheck, IconSearch } from "./icons";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "./status-badge";
import { VERDICT } from "./deviation-table";
import { cn } from "@/lib/utils";
import { formatEur } from "@/lib/format";
import { fieldLabelTitle } from "@/lib/matching/tolerances";
import type { Candidate, Deviation } from "./types";

// Regel-detail, kandidatenkant (functioneel ontwerp §3.6 / C-08). Twee gescheiden lijsten:
// "Voldoet aantoonbaar" (alle gevraagde velden bewezen binnen marge) en "Mogelijk — data
// onvolledig" (kán passen, maar een of meer velden zijn onbekend). Een keuze uit lijst 2
// vraagt een verplichte reden → beslissing komt in de review-wachtrij.
//
// Twee ijzeren regels leven hier zichtbaar:
//   • Regel 2: prijs wordt getóónd, nooit gebruikt om te sorteren. De volgorde is de
//     aanvraag-/matcher-rangschikking; geld raakt die codepad nooit. Sinds de UX-audit
//     van 30 jul geldt dat ook voor het oog: zie MatchEvidence hieronder.
//   • Niets stil weglaten: ook zonder passende kandidaat kan de regel eerlijk worden
//     afgerond (rood/blauw/paars) — elke regel houdt een status.

// Een kandidaat verrijkt met of hij gekozen is (chosen) — de rest komt uit de gedeelde
// Candidate-vorm zodat dit component met fixtures getest kan worden.
export type RegelCandidate = Candidate & { chosen?: boolean };

type Action = (formData: FormData) => void | Promise<void>;

// Koppen exact zoals de tests ze verwachten — badge-taal/labels blijven overal gelijk.
const HEADING_PROVABLE = "Provably compliant";
const HEADING_INCOMPLETE = "Possible — data incomplete";

function specSummary(c: RegelCandidate): string {
  const parts: string[] = [];
  if (c.kelvin) parts.push(`${c.kelvin}K`);
  if (c.cri) parts.push(`CRI ${c.cri}`);
  if (c.ipValue) parts.push(c.ipValue);
  if (c.lumenOutput) parts.push(`${c.lumenOutput} lm`);
  return parts.join(" · ");
}

// ── Match-onderbouwing (UX-audit 30 jul, item 3) ────────────────────────────
//
// De kaart leidde met de PRIJS: grootste, zwaarste element rechtsboven, terwijl er van de
// match zelf niets te zien was. Dat is precies de omkering van ijzeren regel 2 — de logica
// is prijsblind, het oog was dat niet. Nu leidt de kaart met de per-veld-oordelen uit de
// tolerantietabel (judgeCandidate, lib/matching/tolerances.ts) en staat de prijs op
// bodygewicht in de grijstint.
//
// GEEN VERZONNEN SCORE. De engine levert geen getal, dus er staat geen getal: alleen welk
// veld is getoetst, tegen welke waarde, en met welke marge-uitkomst. De woorden en kleuren
// komen uit dezelfde VERDICT-map als de transparantietabel (C-07), dus "geel" betekent
// hier hetzelfde als daar.

// Eén zin die de kaart samenvat: hoeveel velden binnen de marge, en wat er verder is.
// "onbekend" is geen verwijt (ontbrekend ≠ afwijkend) maar staat er wel — een kandidaat
// waarvan je de helft niet weet mag er niet even overtuigend uitzien als een bewezen match.
function evidenceSummary(deviations: Deviation[]): string {
  const n = (v: Deviation["verdict"]) =>
    deviations.filter((d) => d.verdict === v).length;
  const parts = [
    `${n("groen")} of ${deviations.length} requested fields within margin`,
  ];
  if (n("geel") > 0) parts.push(`${n("geel")} in the yellow margin`);
  if (n("rood") > 0) parts.push(`${n("rood")} outside the margin`);
  if (n("onbekend") > 0) parts.push(`${n("onbekend")} without data`);
  return parts.join(" · ");
}

// Chiptekst per veld. Gelijk = "exact", anders "gevraagd → geleverd" met het marge-oordeel;
// zonder data blijft het bestaande "<veld>: no data" (leesbaar label, nooit de camelCase-
// sleutel — UX-audit bug #8). `fieldLabelTitle` en niet `fieldLabel`: de chip begint met
// het veld, dus dit is de begin-van-een-regel-vorm (zie lib/matching/tolerances.ts).
function evidenceText(d: Deviation): string {
  const label = fieldLabelTitle(d.field);
  if (d.verdict === "onbekend") return `${label}: no data`;
  const requested = String(d.requested);
  const delivered = d.delivered == null ? "—" : String(d.delivered);
  if (requested === delivered) return `${label} ${requested}: exact`;
  return `${label} ${requested} → ${delivered}: ${VERDICT[d.verdict].label}`;
}

function MatchEvidence({ deviations }: { deviations: Deviation[] }) {
  return (
    <div className="mt-2 rounded-md bg-muted/40 px-2.5 py-2">
      {deviations.length === 0 ? (
        // Geen oordelen betekent niet "alles klopt": de matcher heeft voor deze kandidaat
        // niets vastgelegd. Dat zeggen we, in plaats van een lege ruimte die als
        // instemming leest.
        <p className="text-sm font-medium text-muted-foreground">
          No field-level verdicts recorded for this candidate.
        </p>
      ) : (
        <>
          <p className="text-sm font-medium">{evidenceSummary(deviations)}</p>
          <p className="mt-1.5 flex flex-wrap gap-1.5">
            {deviations.map((d) => (
              // Geen `title` met de note: die zou woordelijk herhalen wat de chip al
              // zichtbaar zegt ("requested 2700, delivered 3000"), en een title bereikt
              // toetsenbord noch touch. Zie dezelfde afweging in deviation-table.tsx.
              <span
                key={d.field}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
                  VERDICT[d.verdict].tint,
                )}
              >
                <span
                  className={cn("size-1.5 rounded-full", VERDICT[d.verdict].dot)}
                  aria-hidden
                />
                {evidenceText(d)}
              </span>
            ))}
          </p>
        </>
      )}
    </div>
  );
}

function CandidateRow({
  dossierId,
  specLineId,
  candidate,
  list,
  chooseAction,
}: {
  dossierId: string;
  specLineId: string;
  candidate: RegelCandidate;
  list: "aantoonbaar" | "onvolledig";
  chooseAction: Action;
}) {
  const specs = specSummary(candidate);
  return (
    <li
      className={cn(
        "rounded-lg border p-3",
        candidate.chosen && "border-primary/60 ring-1 ring-primary/25",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {candidate.brandName ?? "—"}
            </span>
            {candidate.chosen && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                <IconCheck className="size-3" /> chosen
              </span>
            )}
          </div>
          <p className="truncate font-medium">{candidate.name}</p>
          <p className="text-xs text-muted-foreground">
            {candidate.articleCode ?? candidate.supplierArticleCode ?? "—"}
            {specs ? ` · ${specs}` : ""}
          </p>
        </div>
        {/* Regel 2: prijs tonen, nooit sorteren — en sinds de UX-audit van 30 jul ook
            nooit meer het zwaarste element op de kaart. Zichtbaar en exact, op
            bodygewicht: geld mag hier meekijken, niet meebeslissen. */}
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {formatEur(candidate.grossPrice)}
        </span>
      </div>

      <MatchEvidence deviations={candidate.deviations ?? []} />
      <form action={chooseAction} className="mt-3 flex items-end gap-2">
        <input type="hidden" name="dossierId" value={dossierId} />
        <input type="hidden" name="specLineId" value={specLineId} />
        <input type="hidden" name="productId" value={candidate.id} />
        <input type="hidden" name="fromList" value={list} />
        {list === "onvolledig" && (
          <label className="flex-1 text-xs text-muted-foreground">
            Reason (required for incomplete data)
            <Input
              name="reason"
              required
              placeholder="e.g. IP value confirmed by phone"
              className="mt-1"
            />
          </label>
        )}
        <Button
          type="submit"
          size="sm"
          variant={list === "aantoonbaar" ? "default" : "outline"}
        >
          <IconCheck /> Choose
        </Button>
      </form>
    </li>
  );
}

function CandidateList({
  heading,
  hint,
  dossierId,
  specLineId,
  candidates,
  list,
  chooseAction,
}: {
  heading: string;
  hint: string;
  dossierId: string;
  specLineId: string;
  candidates: RegelCandidate[];
  list: "aantoonbaar" | "onvolledig";
  chooseAction: Action;
}) {
  return (
    <section>
      <div className="mb-1 flex items-baseline gap-2">
        <h4 className="text-sm font-medium">{heading}</h4>
        <span className="text-xs tabular-nums text-muted-foreground">
          {candidates.length}
        </span>
      </div>
      <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
      {candidates.length === 0 ? (
        // Eén van de twee kolommen kan leeg zijn; het kader markeert die kolom. Geen
        // actie: de matcher-knop hoort bij de regel als geheel, niet bij één lijst.
        <EmptyState title="No candidates in this list." action={null} />
      ) : (
        <ul className="flex flex-col gap-2">
          {candidates.map((c) => (
            <CandidateRow
              key={c.id}
              dossierId={dossierId}
              specLineId={specLineId}
              candidate={c}
              list={list}
              chooseAction={chooseAction}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// Handmatige afronding zonder catalogus-match (C-14/H-08). Rustige tinten: rood betekent
// "actie bij de klant", blauw "onze actie (merk inladen)", paars "buiten assortiment" —
// geen van drieën is een alarm.
function ResolutionBlock({
  dossierId,
  specLine,
  setLineStatusAction,
  setDayPriceAction,
}: {
  dossierId: string;
  specLine: {
    id: string;
    brandText: string | null;
  };
  setLineStatusAction: Action;
  setDayPriceAction: Action;
}) {
  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-lg border p-4">
        <h4 className="text-sm font-medium">No matching candidate?</h4>
        {/* UX-audit 30 jul (item 12): dit is de ENIGE plek waar deze belofte nog staat.
            Ze stond ook op /catalog, in de catalogus-zoeklijst, op het substitutie-
            document en bij de afwijkingentabel — vier keer een regel uitleggen die
            nergens te kiezen viel. Hier valt hij wél te kiezen: de drie knoppen
            hieronder ZIJN de status die de regel houdt. Niet verplaatsen, niet
            dupliceren. */}
        <p className="mt-0.5 text-xs text-muted-foreground">
          Every line keeps a status — nothing is silently omitted.
        </p>

        {/* Rood — merk hebben we wél, dit product niet. Actie bij de klant. */}
        <form
          action={setLineStatusAction}
          className="mt-3 rounded-lg border p-3"
        >
          <input type="hidden" name="dossierId" value={dossierId} />
          <input type="hidden" name="specLineId" value={specLine.id} />
          <input type="hidden" name="status" value="rood" />
          <div className="flex items-center gap-2">
            <StatusBadge status="rood" />
            <span className="text-sm font-medium">No matching product</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            We do have the brand, just not this specific product — action on the
            customer's side. A custom configuration from the supplier is sometimes
            possible.
          </p>
          <div className="mt-2 flex items-end gap-2">
            <label className="flex-1 text-xs text-muted-foreground">
              Reason
              <Input
                name="reason"
                placeholder="e.g. exact type not available"
                className="mt-1"
              />
            </label>
            {/* UX-audit 30 jul (item 5): hier stond "Set to Red". O13 bevriest de hue,
                het badge-label en het geprinte `word` — de badge hiernaast zegt dus nog
                steeds "Red". Een knop-WERKWOORD valt daarbuiten, en een kleurnaam
                vertelt niet wat er gebeurt. Deze tekst volgt de zin erboven: de actie
                ligt bij de klant. */}
            <Button type="submit" size="sm" variant="outline">
              Report back to customer
            </Button>
          </div>
        </form>

        {/* Blauw — merk nog niet in de catalogus. Datagat, onze eigen actie. */}
        <form
          action={setLineStatusAction}
          className="mt-3 rounded-lg border p-3"
        >
          <input type="hidden" name="dossierId" value={dossierId} />
          <input type="hidden" name="specLineId" value={specLine.id} />
          <input type="hidden" name="status" value="blauw" />
          <input
            type="hidden"
            name="brandText"
            value={specLine.brandText ?? ""}
          />
          <div className="flex items-center gap-2">
            <StatusBadge status="blauw" />
            <span className="text-sm font-medium">
              Brand missing — add to load list
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {specLine.brandText ? (
              <>
                <span className="font-medium">{specLine.brandText}</span> is not in
                the catalog yet. We'll add the brand to the load queue.
              </>
            ) : (
              "The requested brand is not in the catalog yet; we'll add it to the load queue."
            )}
          </p>
          <div className="mt-2 flex justify-end">
            <Button type="submit" size="sm" variant="outline">
              Add to load list
            </Button>
          </div>
        </form>

        {/* Paars — buiten assortiment (geen verlichting). Expliciet melden. */}
        <form
          action={setLineStatusAction}
          className="mt-3 rounded-lg border p-3"
        >
          <input type="hidden" name="dossierId" value={dossierId} />
          <input type="hidden" name="specLineId" value={specLine.id} />
          <input type="hidden" name="status" value="paars" />
          <div className="flex items-center gap-2">
            <StatusBadge status="paars" />
            <span className="text-sm font-medium">Outside assortment</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Not lighting — doesn't belong in the catalog.
          </p>
          <div className="mt-2 flex justify-end">
            {/* Idem als bij rood: de badge houdt de kleurnaam (O13), de knop zegt wat
                er gebeurt. "Report explicitly, don't omit" is uit de zin hierboven
                geschrapt — dat herhaalde de belofte drie regels hoger (item 12). */}
            <Button type="submit" size="sm" variant="outline">
              Mark as outside assortment
            </Button>
          </div>
        </form>
      </section>

      {/* Dagprijs op DE REGEL (I-04) — de catalogus blijft leeg, het gat blijft eerlijk. */}
      <section className="rounded-lg border p-4">
        <h4 className="text-sm font-medium">Spot price on this line</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Price list expired? Enter a spot price on this line. The catalog stays
          empty, but this line gets a flagged manual price with a validity date.
        </p>
        <form
          action={setDayPriceAction}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="dossierId" value={dossierId} />
          <input type="hidden" name="specLineId" value={specLine.id} />
          <label className="text-xs text-muted-foreground">
            Price (€)
            <Input
              name="price"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="0.00"
              className="mt-1 w-32 tabular-nums"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Valid until
            <Input name="validUntil" type="date" className="mt-1 w-44" />
          </label>
          <Button type="submit" size="sm" variant="outline">
            Save spot price
          </Button>
        </form>
      </section>
    </div>
  );
}

export function MatchCandidates({
  dossierId,
  specLine,
  provable,
  incomplete,
  chooseAction,
  setLineStatusAction,
  setDayPriceAction,
  runMatchAction,
}: {
  dossierId: string;
  specLine: {
    id: string;
    fixtureCode: string;
    brandText: string | null;
    productText: string | null;
  };
  provable: RegelCandidate[];
  incomplete: RegelCandidate[];
  chooseAction: Action;
  setLineStatusAction: Action;
  setDayPriceAction: Action;
  runMatchAction: Action;
}) {
  const hasCandidates = provable.length + incomplete.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {hasCandidates ? (
        <div className="grid gap-5 md:grid-cols-2">
          <CandidateList
            heading={HEADING_PROVABLE}
            hint="All requested fields are proven within the margin."
            dossierId={dossierId}
            specLineId={specLine.id}
            candidates={provable}
            list="aantoonbaar"
            chooseAction={chooseAction}
          />
          <CandidateList
            heading={HEADING_INCOMPLETE}
            hint="May fit, but one or more fields are unknown — choose with a reason."
            dossierId={dossierId}
            specLineId={specLine.id}
            candidates={incomplete}
            list="onvolledig"
            chooseAction={chooseAction}
          />
        </div>
      ) : (
        <EmptyState
          title="No candidates yet"
          description="The matcher hasn't run for this line yet, or found nothing comparable. Run the matcher to fill the two lists — or resolve the line honestly below."
          action={
            <form action={runMatchAction}>
              <input type="hidden" name="dossierId" value={dossierId} />
              <input type="hidden" name="specLineId" value={specLine.id} />
              <Button type="submit" size="sm" variant="outline">
                <IconSearch /> Run the matcher
              </Button>
            </form>
          }
        />
      )}

      <ResolutionBlock
        dossierId={dossierId}
        specLine={{ id: specLine.id, brandText: specLine.brandText }}
        setLineStatusAction={setLineStatusAction}
        setDayPriceAction={setDayPriceAction}
      />
    </div>
  );
}
