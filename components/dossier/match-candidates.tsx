import { IconCheck, IconSearch } from "./icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "./status-badge";
import { cn } from "@/lib/utils";
import { formatEur } from "@/lib/format";
import { fieldLabel } from "@/lib/matching/tolerances";
import type { Candidate } from "./types";

// Regel-detail, kandidatenkant (functioneel ontwerp §3.6 / C-08). Twee gescheiden lijsten:
// "Voldoet aantoonbaar" (alle gevraagde velden bewezen binnen marge) en "Mogelijk — data
// onvolledig" (kán passen, maar een of meer velden zijn onbekend). Een keuze uit lijst 2
// vraagt een verplichte reden → beslissing komt in de review-wachtrij.
//
// Twee ijzeren regels leven hier zichtbaar:
//   • Regel 2: prijs wordt getóónd, nooit gebruikt om te sorteren. De volgorde is de
//     aanvraag-/matcher-rangschikking; geld raakt die codepad nooit.
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

function unknownFields(c: RegelCandidate): string[] {
  return (c.deviations ?? [])
    .filter((d) => d.verdict === "onbekend")
    .map((d) => d.field);
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
  const unknown = list === "onvolledig" ? unknownFields(candidate) : [];
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
          {unknown.length > 0 && (
            <p className="mt-1.5 flex flex-wrap gap-1.5">
              {unknown.map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center gap-1 rounded-full bg-status-grey-tint px-2 py-0.5 text-[11px] text-status-grey-ink"
                >
                  {/* -dot en niet -ink: dit is het hélder gele driehoekje (amber-500). De
                      ink-waarde is amber-800 en zou er een bruin vlekje van maken. */}
                  <span className="text-status-amber-dot" aria-hidden>
                    ⚠
                  </span>
                  {/* Leesbaar veldlabel, geen code-identifier (UX-audit 30 jul, bug #8):
                      hier stond "beamAngle: no data". */}
                  {fieldLabel(f)}: no data
                </span>
              ))}
            </p>
          )}
        </div>
        {/* Regel 2: prijs tonen, nooit sorteren. */}
        <span className="shrink-0 tabular-nums font-medium">
          {formatEur(candidate.grossPrice)}
        </span>
      </div>
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
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          No candidates in this list.
        </p>
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
        <h4 className="text-sm font-medium">No matching candidate? Resolve it honestly.</h4>
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
            <Button type="submit" size="sm" variant="outline">
              Set to Red
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
            Not lighting — doesn't belong in the catalog. Report explicitly, don't
            omit.
          </p>
          <div className="mt-2 flex justify-end">
            <Button type="submit" size="sm" variant="outline">
              Set to Purple
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
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="font-medium">No candidates yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            The matcher hasn't run for this line yet, or found nothing comparable.
            Run the matcher to fill the two lists — or resolve the line honestly
            below.
          </p>
          <form action={runMatchAction} className="mt-4 inline-block">
            <input type="hidden" name="dossierId" value={dossierId} />
            <input type="hidden" name="specLineId" value={specLine.id} />
            <Button type="submit" size="sm" variant="outline">
              <IconSearch /> Run the matcher
            </Button>
          </form>
        </div>
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
