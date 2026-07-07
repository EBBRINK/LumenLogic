import { IconCheck, IconSearch } from "./icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "./status-badge";
import { cn } from "@/lib/utils";
import { formatEur } from "@/lib/format";
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
const HEADING_PROVABLE = "Voldoet aantoonbaar";
const HEADING_INCOMPLETE = "Mogelijk — data onvolledig";

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
                <IconCheck className="size-3" /> gekozen
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
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                  <span className="text-amber-500" aria-hidden>
                    ⚠
                  </span>
                  {f}: geen data
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
            Reden (verplicht bij onvolledige data)
            <Input
              name="reason"
              required
              placeholder="bv. IP-waarde telefonisch bevestigd"
              className="mt-1"
            />
          </label>
        )}
        <Button
          type="submit"
          size="sm"
          variant={list === "aantoonbaar" ? "default" : "outline"}
        >
          <IconCheck /> Kies
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
          Geen kandidaten in deze lijst.
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
        <h4 className="text-sm font-medium">Geen passende kandidaat? Rond eerlijk af.</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Elke regel houdt een status — niets wordt stil weggelaten.
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
            <span className="text-sm font-medium">Geen passend product</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Merk hebben we wél, dit specifieke product niet — actie bij de klant. Een
            custom configuratie bij de leverancier is soms mogelijk.
          </p>
          <div className="mt-2 flex items-end gap-2">
            <label className="flex-1 text-xs text-muted-foreground">
              Reden
              <Input
                name="reason"
                placeholder="bv. exact type niet leverbaar"
                className="mt-1"
              />
            </label>
            <Button type="submit" size="sm" variant="outline">
              Zet op rood
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
              Merk ontbreekt — zet op inlaadlijst
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {specLine.brandText ? (
              <>
                <span className="font-medium">{specLine.brandText}</span> staat nog
                niet in de catalogus. We zetten het merk op de inlaadwachtrij.
              </>
            ) : (
              "Het gevraagde merk staat nog niet in de catalogus; we zetten het op de inlaadwachtrij."
            )}
          </p>
          <div className="mt-2 flex justify-end">
            <Button type="submit" size="sm" variant="outline">
              Zet op inlaadlijst
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
            <span className="text-sm font-medium">Buiten assortiment</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Geen verlichting — hoort niet in de catalogus. Expliciet melden, niet
            weglaten.
          </p>
          <div className="mt-2 flex justify-end">
            <Button type="submit" size="sm" variant="outline">
              Zet op paars
            </Button>
          </div>
        </form>
      </section>

      {/* Dagprijs op DE REGEL (I-04) — de catalogus blijft leeg, het gat blijft eerlijk. */}
      <section className="rounded-lg border p-4">
        <h4 className="text-sm font-medium">Dagprijs op deze regel</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Prijslijst verlopen? Voer een dagprijs op deze regel in. De catalogus blijft
          leeg, maar deze regel krijgt een gemarkeerde handmatige prijs met
          geldigheidsdatum.
        </p>
        <form
          action={setDayPriceAction}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="dossierId" value={dossierId} />
          <input type="hidden" name="specLineId" value={specLine.id} />
          <label className="text-xs text-muted-foreground">
            Prijs (€)
            <Input
              name="price"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="0,00"
              className="mt-1 w-32 tabular-nums"
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Geldig tot
            <Input name="validUntil" type="date" className="mt-1 w-44" />
          </label>
          <Button type="submit" size="sm" variant="outline">
            Dagprijs opslaan
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
            hint="Alle gevraagde velden zijn bewezen binnen de marge."
            dossierId={dossierId}
            specLineId={specLine.id}
            candidates={provable}
            list="aantoonbaar"
            chooseAction={chooseAction}
          />
          <CandidateList
            heading={HEADING_INCOMPLETE}
            hint="Kán passen, maar een of meer velden zijn onbekend — kies met een reden."
            dossierId={dossierId}
            specLineId={specLine.id}
            candidates={incomplete}
            list="onvolledig"
            chooseAction={chooseAction}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="font-medium">Nog geen kandidaten</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            De matcher heeft voor deze regel nog niet gedraaid, of vond niets
            vergelijkbaars. Draai de matcher om de twee lijsten te vullen — of rond de
            regel hieronder eerlijk af.
          </p>
          <form action={runMatchAction} className="mt-4 inline-block">
            <input type="hidden" name="dossierId" value={dossierId} />
            <input type="hidden" name="specLineId" value={specLine.id} />
            <Button type="submit" size="sm" variant="outline">
              <IconSearch /> Draai de matcher
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
