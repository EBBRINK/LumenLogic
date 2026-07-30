// Review-station (functioneel ontwerp §3.7, flow §4.4). De wachtrij toont per regel met
// reviewKind ≠ null een kaart met de juiste beslis-acties; afgeronde regels dragen een
// audit-spoor (wie/wat/wanneer) — het menselijke oordeel blijft in beeld (D-06).
// Volgorde = aanvraagvolgorde, niet urgentie (C-11). Esthetiek = eerlijkheid: rustige
// tinten, geen rode alarmen, geen prijs- of statusgedreven hersortering.
//
// Herontwerp 2026-07-14 (stap 7): élke bevestigende keuze maakt de regel groen met
// merkteken "handmatig gekozen". De variantkaart toont échte kleurvarianten uit de
// catalogus (nooit verzonnen kleuren; nul varianten → kandidatenlijst als fallback).
// Gele regels met meerdere schone kandidaten krijgen een "welke van deze N"-kaart.
// Rode regels zonder match staan onderaan in "Niet gevonden — handmatig linken":
// de mens zoekt daar zélf (ijzeren regel 4 — het systeem doet géén suggesties).
import { IconCheck, IconSearch } from "./icons";
import { AiSuggestionBlock } from "./ai-suggestion-block";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { formatEur } from "@/lib/format";
import { fieldLabelTitle } from "@/lib/matching/tolerances";
import { StatusBadge } from "./status-badge";
import type {
  Deviation,
  Phase,
  RedLinkLine,
  ReviewCandidate,
  ReviewItem,
} from "./types";

// Hoeveel kandidaten de "welke van deze N"-kaart maximaal toont (top op matchvolgorde).
const MAX_CHOICE_CANDIDATES = 4;

const DECISION_LABEL: Record<string, string> = {
  accepteer: "accepted → green",
  afgewezen: "rejected → red",
  variant: "variant chosen → green",
  gecontroleerd: "checked",
  bevestigd: "confirmed despite data gap",
};

type Action = (formData: FormData) => void | Promise<void>;

function EntityLine({
  item,
}: {
  item: Pick<ReviewItem, "fixtureCode" | "brandText" | "productText">;
}) {
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
      <span className="font-medium">{item.fixtureCode}</span>
      {(item.brandText || item.productText) && (
        <span className="min-w-0 text-sm font-normal text-muted-foreground">
          {item.brandText} {item.productText}
        </span>
      )}
    </span>
  );
}

// Link naar het regel-detail voor een andere match — dezelfde affordance als de
// spec-regeltabel (functioneel ontwerp 3.4-2).
function OtherMatch({ dossierId, itemId }: { dossierId: string; itemId: string }) {
  return (
    <Button asChild size="sm" variant="outline">
      <a href={`/projects/${dossierId}/line/${itemId}`}>
        <IconSearch /> Other match
      </a>
    </Button>
  );
}

// De gele afwijkingen benoemen (transparantieregel C-07): gevraagd → geleverd + oordeel.
function DeviationList({ deviations }: { deviations: Deviation[] }) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {deviations.map((d) => (
        <li key={d.field} className="text-status-amber-ink">
          {/* Leesbaar veldlabel, geen code-identifier (UX-audit 30 jul, bug #8). Begin van
              een lijstitem → de begin-van-de-regel-vorm; midden in een zin gebruikt de
              app fieldLabel() (reparatie 30 jul, bevinding 3). */}
          <span className="font-medium">{fieldLabelTitle(d.field)}</span>: requested{" "}
          {d.requested} → delivered {d.delivered ?? "—"}
        </li>
      ))}
    </ul>
  );
}

// Afwijzen → rood vereist een reden (D-05). Het redenveld staat altijd in beeld.
function RejectForm({
  dossierId,
  itemId,
  decideAction,
}: {
  dossierId: string;
  itemId: string;
  decideAction: Action;
}) {
  return (
    <form
      action={decideAction}
      className="flex flex-col gap-2 rounded-lg border border-dashed p-3"
    >
      <input type="hidden" name="dossierId" value={dossierId} />
      <input type="hidden" name="specLineId" value={itemId} />
      <input type="hidden" name="decision" value="afgewezen" />
      <label htmlFor={`reason-${itemId}`} className="text-sm font-medium">
        Reason (required for rejection)
      </label>
      <textarea
        id={`reason-${itemId}`}
        name="reason"
        rows={2}
        required
        placeholder="Why does this deviation fall outside what the customer accepts?"
        className="w-full rounded-lg border border-input bg-background p-2.5 text-sm"
      />
      <div>
        <Button type="submit" size="sm" variant="destructive">
          Reject → red
        </Button>
      </div>
    </form>
  );
}

// Benoemenswaardige afwijkingen van een kandidaat (zelfde filter als overal: C-07,
// exacte velden en onbekenden niet herhalen op een knop).
function notable(deviations?: Deviation[] | null): Deviation[] {
  return (deviations ?? []).filter(
    (d) => d.verdict !== "onbekend" && d.note && d.note !== "exact",
  );
}

// Eén kandidaat als keuzeknop ("welke van deze N" / variant-fallback): merk, naam,
// artikelcode + de afwijkingen t.o.v. gevraagd. Kiezen = menskeuze → groen.
function CandidateChoice({
  dossierId,
  itemId,
  candidate,
  decision,
  decideAction,
}: {
  dossierId: string;
  itemId: string;
  candidate: ReviewCandidate;
  decision: "accepteer" | "variant";
  decideAction: Action;
}) {
  const devs = notable(candidate.deviations);
  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm">
            <span className="text-muted-foreground">
              {candidate.brandName ?? "—"}
            </span>{" "}
            <span className="font-medium">{candidate.name}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {candidate.articleCode ?? "—"}
          </p>
          {devs.length > 0 && (
            <p className="mt-1 text-xs text-status-amber-ink">
              {devs.map((d) => d.note).join(" · ")}
            </p>
          )}
        </div>
        <form action={decideAction}>
          <input type="hidden" name="dossierId" value={dossierId} />
          <input type="hidden" name="specLineId" value={itemId} />
          <input type="hidden" name="decision" value={decision} />
          <input type="hidden" name="productId" value={candidate.productId} />
          <Button type="submit" size="sm">
            <IconCheck /> Choose this
          </Button>
        </form>
      </div>
    </li>
  );
}

function GeelCard({
  dossierId,
  item,
  decideAction,
}: {
  dossierId: string;
  item: ReviewItem;
  decideAction: Action;
}) {
  const gele = (item.deviations ?? []).filter((d) => d.verdict === "geel");
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Same brand, deviation within the yellow margin. Accept as proposal — the line
        turns green (manually chosen) and the deviation stays as a note — or reject to
        red.
      </p>
      {gele.length > 0 && <DeviationList deviations={gele} />}
      <div className="flex flex-wrap items-center gap-2">
        <form action={decideAction}>
          <input type="hidden" name="dossierId" value={dossierId} />
          <input type="hidden" name="specLineId" value={item.id} />
          <input type="hidden" name="decision" value="accepteer" />
          <Button type="submit" size="sm">
            <IconCheck /> Accept as proposal
          </Button>
        </form>
        <OtherMatch dossierId={dossierId} itemId={item.id} />
      </div>
      <RejectForm dossierId={dossierId} itemId={item.id} decideAction={decideAction} />
    </>
  );
}

// "Welke van deze N": een gele regel met meerdere schone kandidaten (B3 vuurde niet
// omdat er meer dan één was). De mens kiest — zelfde pad als chooseCandidate
// (menskeuze, chosenBy = actor), de regel wordt groen.
function KeuzeCard({
  dossierId,
  item,
  candidates,
  decideAction,
}: {
  dossierId: string;
  item: ReviewItem;
  candidates: ReviewCandidate[];
  decideAction: Action;
}) {
  const shown = candidates.slice(0, MAX_CHOICE_CANDIDATES);
  return (
    <>
      <p className="text-sm text-muted-foreground">
        We found {candidates.length} matching candidates — which should it be?
        Choosing turns the line green (manually chosen); the deviations stay as a
        note.
      </p>
      <ul className="flex flex-col gap-2">
        {shown.map((c) => (
          <CandidateChoice
            key={c.productId}
            dossierId={dossierId}
            itemId={item.id}
            candidate={c}
            decision="accepteer"
            decideAction={decideAction}
          />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <form action={decideAction}>
          <input type="hidden" name="dossierId" value={dossierId} />
          <input type="hidden" name="specLineId" value={item.id} />
          <input type="hidden" name="decision" value="accepteer" />
          <Button type="submit" size="sm" variant="secondary">
            <IconCheck /> Accept as proposal
          </Button>
        </form>
        <OtherMatch dossierId={dossierId} itemId={item.id} />
      </div>
      <RejectForm dossierId={dossierId} itemId={item.id} decideAction={decideAction} />
    </>
  );
}

// Variantkeuze met échte kleurvarianten uit de catalogus (zusterproducten, zelfde
// merk + naam minus kleur-token). Nul varianten gevonden → fallback op de bestaande
// kandidatenlijst van de regel; er wordt NOOIT een kleur verzonnen.
function VariantCard({
  dossierId,
  item,
  decideAction,
}: {
  dossierId: string;
  item: ReviewItem;
  decideAction: Action;
}) {
  const variants = item.variants ?? [];
  const candidates = item.candidates ?? [];
  const req = item.reqColor?.trim() || null;

  if (variants.length > 0) {
    return (
      <>
        <p className="text-sm text-muted-foreground">
          Choose a color variant — these colors really exist in the catalog
          {req ? (
            <>
              {" "}
              (requested: <span className="font-medium">{req}</span>)
            </>
          ) : null}
          . Choosing turns the line green (manually chosen).
        </p>
        <ul className="flex flex-wrap gap-2">
          {variants.map((v) => (
            <li key={v.productId}>
              <form action={decideAction}>
                <input type="hidden" name="dossierId" value={dossierId} />
                <input type="hidden" name="specLineId" value={item.id} />
                <input type="hidden" name="decision" value="variant" />
                <input type="hidden" name="productId" value={v.productId} />
                <input type="hidden" name="variantColor" value={v.color} />
                <Button type="submit" size="sm" variant="outline" title={v.name}>
                  <IconCheck /> {v.color}
                </Button>
              </form>
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (candidates.length > 0) {
    return (
      <>
        <p className="text-sm text-muted-foreground">
          No color variants of this product found in the catalog — choose from the
          line's candidates (choosing turns the line green, manually chosen).
        </p>
        <ul className="flex flex-col gap-2">
          {candidates.slice(0, MAX_CHOICE_CANDIDATES).map((c) => (
            <CandidateChoice
              key={c.productId}
              dossierId={dossierId}
              itemId={item.id}
              candidate={c}
              decision="variant"
              decideAction={decideAction}
            />
          ))}
        </ul>
        <OtherMatch dossierId={dossierId} itemId={item.id} />
      </>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        No color variants and no candidates found — open the line for another
        match.
      </p>
      <OtherMatch dossierId={dossierId} itemId={item.id} />
    </>
  );
}

function OnvolledigCard({
  dossierId,
  item,
  decideAction,
}: {
  dossierId: string;
  item: ReviewItem;
  decideAction: Action;
}) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Confirm despite missing data. Missing data is not an error — confirm the
        match or choose another.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <form
          action={decideAction}
          className="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="dossierId" value={dossierId} />
          <input type="hidden" name="specLineId" value={item.id} />
          <input type="hidden" name="decision" value="bevestigd" />
          <Input
            name="reason"
            placeholder="Reason (optional)"
            className="h-7 w-56 text-sm"
          />
          <Button type="submit" size="sm">
            <IconCheck /> Confirm
          </Button>
        </form>
        <OtherMatch dossierId={dossierId} itemId={item.id} />
      </div>
    </>
  );
}

function OcrCard({
  dossierId,
  item,
  decideAction,
}: {
  dossierId: string;
  item: ReviewItem;
  decideAction: Action;
}) {
  // B6: de échte bron van een OCR-regel is het opgeslagen paginabeeld — toon het
  // paginanummer en link ernaar (nieuw tabblad) zodat de reviewer het boek naast
  // de gelezen waarden kan leggen. Alleen als de regel zijn herkomst draagt.
  // hasPageImage komt per PAGINA uit de review-query (UX-audit 30 jul, bug #2):
  // true = er is een beeld van déze pagina. Alleen dán de beeldlink. Anders — een
  // leesroute-run (AI-tekstroute, stap 3 fase B, die reviewKind 'ocr' deelt maar
  // nooit beelden heeft), een OCR-run die maar een deel van zijn pagina's in beeld
  // kreeg, óf een aanroeper die de vlag niet meestuurt — linkt de kaart naar het
  // markdown-controlespoor van de importrun, met hetzelfde paginanummer als tekst.
  // Bewust `=== true` en niet `!== false` (reviewronde 2, 30 jul): de "onbekend →
  // tóch de beeldlink"-tak was de enige tak die een kale 404 kón opleveren en had
  // geen enkele aanroeper meer — getReviewQueue levert altijd een echte boolean.
  const hasSource = item.importRunId != null && item.sourcePage != null;
  const hasImage = item.hasPageImage === true;
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Check the imported line — OCR import can misread characters. Confirm if the
        line is correct, or open it for another match.
      </p>
      {/* De ruwe tabelregel zoals de import hem las: zonder dit citaat vraagt de
          kaart om een controle zonder het te controleren materiaal te tonen
          (UX-audit 30 jul). Compact in rust (twee regels), maar de hele regel is
          bereikbaar: uitklappen haalt de line-clamp weg. Géén title-tooltip meer
          (reviewronde 2, 30 jul) — die droeg dezelfde al afgekapte tekst en doet
          op 375px, waar geen hover bestaat, helemaal niets. De tekst staat precies
          één keer in de DOM; alleen de clamp klapt open. */}
      {item.sourceText && (
        <details className="group/src border-l-2 pl-2.5">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <span className="text-xs font-medium text-foreground">
              Source text
            </span>
            <span className="text-xs text-muted-foreground">
              {" · "}
              <span className="underline underline-offset-2 group-open/src:hidden">
                show all
              </span>
              <span className="hidden underline underline-offset-2 group-open/src:inline">
                show less
              </span>
            </span>
            <span className="mt-0.5 line-clamp-2 font-mono text-xs leading-snug break-words whitespace-pre-wrap text-muted-foreground group-open/src:line-clamp-none">
              {item.sourceText}
            </span>
          </summary>
        </details>
      )}
      {hasSource && (
        <p className="text-sm text-muted-foreground">
          Read from page{" "}
          <span className="font-medium text-foreground">{item.sourcePage}</span>
          {" · "}
          {hasImage ? (
            <a
              href={`/projects/${dossierId}/ocr-image/${item.importRunId}/${item.sourcePage}`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              View page image
            </a>
          ) : (
            <a
              href={`/projects/${dossierId}/import/${item.importRunId}`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              View source text
            </a>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <form action={decideAction}>
          <input type="hidden" name="dossierId" value={dossierId} />
          <input type="hidden" name="specLineId" value={item.id} />
          <input type="hidden" name="decision" value="gecontroleerd" />
          <Button type="submit" size="sm">
            <IconCheck /> Checked
          </Button>
        </form>
        <OtherMatch dossierId={dossierId} itemId={item.id} />
      </div>
    </>
  );
}

function PendingCard({
  dossierId,
  item,
  decideAction,
  phase,
  aiUseAction,
  aiDismissAction,
}: {
  dossierId: string;
  item: ReviewItem;
  decideAction: Action;
  phase: Phase;
  aiUseAction?: Action;
  aiDismissAction?: Action;
}) {
  // "Welke van deze N": alleen bij ≥2 schone kandidaten (lijst 'aantoonbaar' — volledig
  // beoordeelbaar, geen rood/onbekend). Eén schone kandidaat → de gewone geel-kaart.
  const clean = (item.candidates ?? []).filter((c) => c.list === "aantoonbaar");
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <EntityLine item={item} />
        </CardTitle>
        <CardAction>
          <StatusBadge status={item.status} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* AI-vangnet (B4): niet-verworpen suggesties, duidelijk gelabeld. */}
        {aiUseAction && aiDismissAction && (item.aiSuggestions?.length ?? 0) > 0 && (
          <AiSuggestionBlock
            dossierId={dossierId}
            specLineId={item.id}
            suggestions={item.aiSuggestions ?? []}
            phase={phase}
            brandText={item.brandText}
            useAction={aiUseAction}
            dismissAction={aiDismissAction}
          />
        )}
        {item.reviewKind === "geel" &&
          (clean.length >= 2 ? (
            <KeuzeCard
              dossierId={dossierId}
              item={item}
              candidates={clean}
              decideAction={decideAction}
            />
          ) : (
            <GeelCard dossierId={dossierId} item={item} decideAction={decideAction} />
          ))}
        {item.reviewKind === "variant" && (
          <VariantCard dossierId={dossierId} item={item} decideAction={decideAction} />
        )}
        {item.reviewKind === "onvolledig" && (
          <OnvolledigCard
            dossierId={dossierId}
            item={item}
            decideAction={decideAction}
          />
        )}
        {item.reviewKind === "ocr" && (
          <OcrCard dossierId={dossierId} item={item} decideAction={decideAction} />
        )}
      </CardContent>
    </Card>
  );
}

// Rood-kaart: "merk wél, product niet". Compacte catalogus-zoeker (GET-formulier →
// dezelfde pagina met ?regel&zoek; de server zoekt via visible_products) + link-knop.
// BEWUST geen automatische suggesties: dit is een menshandeling (zoeken + klikken),
// fase-veilig in élke stand (ijzeren regel 4).
function RedLinkCard({
  dossierId,
  line,
  linkAction,
  phase,
  aiUseAction,
  aiDismissAction,
}: {
  dossierId: string;
  line: RedLinkLine;
  linkAction: Action;
  phase: Phase;
  aiUseAction?: Action;
  aiDismissAction?: Action;
}) {
  const results = line.results ?? null;
  return (
    <Card id={`link-${line.id}`}>
      <CardHeader>
        <CardTitle>
          <EntityLine item={line} />
        </CardTitle>
        <CardAction>
          <StatusBadge status="rood" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          No match found{line.noMatchReason ? ` — ${line.noMatchReason}` : ""}.
          Search for a comparable product in the catalog yourself and link it; the
          line turns green with the &ldquo;manually chosen&rdquo; mark.
        </p>
        {/* AI-vangnet (B4): suggesties zijn een startpunt — linken blijft de menskeuze. */}
        {aiUseAction && aiDismissAction && (line.aiSuggestions?.length ?? 0) > 0 && (
          <AiSuggestionBlock
            dossierId={dossierId}
            specLineId={line.id}
            suggestions={line.aiSuggestions ?? []}
            phase={phase}
            brandText={line.brandText}
            useAction={aiUseAction}
            dismissAction={aiDismissAction}
          />
        )}
        <form
          method="get"
          action={`/projects/${dossierId}/review`}
          className="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="line" value={line.id} />
          <Input
            name="q"
            defaultValue={line.searchQuery ?? ""}
            placeholder="Search the catalog (name or article code)"
            className="h-8 w-72 max-w-full text-sm"
            aria-label={`Search comparable product for ${line.fixtureCode}`}
          />
          <Button type="submit" size="sm" variant="secondary">
            <IconSearch /> Search
          </Button>
        </form>
        {results && results.length > 0 && (
          <ul className="flex flex-col gap-2">
            {results.map((r) => (
              <li key={r.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="text-muted-foreground">
                        {r.brandName ?? "—"}
                      </span>{" "}
                      <span className="font-medium">{r.name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.articleCode ?? "—"}
                      {r.grossPrice != null && (
                        <>
                          {" · "}
                          <span className="tabular-nums">
                            {formatEur(r.grossPrice)}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <form action={linkAction}>
                    <input type="hidden" name="dossierId" value={dossierId} />
                    <input type="hidden" name="specLineId" value={line.id} />
                    <input type="hidden" name="productId" value={r.id} />
                    <Button type="submit" size="sm">
                      <IconCheck /> Link this product
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        {results && results.length === 0 && line.searchQuery && (
          // Zit al in een <Card>: inline, anders een kader binnen een kader.
          <EmptyState
            variant="inline"
            title={`No visible products found for “${line.searchQuery}” — try a broader search term.`}
            action={null}
          />
        )}
      </CardContent>
    </Card>
  );
}

export function ReviewQueue({
  dossierId,
  pending,
  done,
  rood = [],
  // Default 'tender' = veilig (ijzeren regel 4): zonder expliciete fase worden
  // AI-suggesties van een ander merk nooit gerenderd.
  phase = "tender",
  decideAction,
  linkAction,
  aiUseAction,
  aiDismissAction,
}: {
  dossierId: string;
  pending: ReviewItem[];
  done: ReviewItem[];
  rood?: RedLinkLine[];
  phase?: Phase;
  decideAction: Action;
  linkAction?: Action;
  aiUseAction?: Action;
  aiDismissAction?: Action;
}) {
  if (pending.length === 0 && done.length === 0 && rood.length === 0) {
    return (
      // Geen actie: de wachtrij vult zichzelf vanuit de matcher — er is hier niets
      // te starten. Bewuste `action={null}`.
      <EmptyState
        title="Nothing to review — all lines are unambiguous."
        description="Lines only appear here when a human verdict is needed: a yellow deviation, a color variant, a confirmation for missing data, an OCR check, or a not-found product that must be linked manually."
        action={null}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium">
          Review — {pending.length + rood.length} pending, {done.length} done
        </h2>
        <p className="text-xs text-muted-foreground">Order = request order.</p>
      </div>

      {pending.length > 0 ? (
        <div className="flex flex-col gap-3">
          {pending.map((item) => (
            <PendingCard
              key={item.id}
              dossierId={dossierId}
              item={item}
              decideAction={decideAction}
              phase={phase}
              aiUseAction={aiUseAction}
              aiDismissAction={aiDismissAction}
            />
          ))}
        </div>
      ) : (
        rood.length === 0 && (
          <EmptyState
            variant="inline"
            title="No pending items — everything is done."
            action={null}
          />
        )
      )}

      {rood.length > 0 && linkAction && (
        <section className="flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-medium">
              Not found — link manually ({rood.length})
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Brand in the catalog, this product not. The system deliberately makes
              no suggestions here — searching and choosing is up to you.
            </p>
          </div>
          {rood.map((line) => (
            <RedLinkCard
              key={line.id}
              dossierId={dossierId}
              line={line}
              linkAction={linkAction}
              phase={phase}
              aiUseAction={aiUseAction}
              aiDismissAction={aiDismissAction}
            />
          ))}
        </section>
      )}

      {done.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Done ({done.length})
          </h3>
          <ul className="flex flex-col divide-y rounded-lg border">
            {done.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
              >
                <IconCheck className="shrink-0 text-status-green-ink" />
                <EntityLine item={item} />
                <StatusBadge status={item.status} className="ml-auto" />
                <span className="w-full text-xs text-muted-foreground sm:w-auto">
                  {item.reviewDecision
                    ? `${DECISION_LABEL[item.reviewDecision] ?? item.reviewDecision} · `
                    : ""}
                  by {item.reviewedBy ?? "unknown"}
                  {item.reviewedAt ? ` · ${item.reviewedAt}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
