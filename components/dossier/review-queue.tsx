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
import { Input } from "@/components/ui/input";
import { formatEur } from "@/lib/format";
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
  accepteer: "geaccepteerd → groen",
  afgewezen: "afgewezen → rood",
  variant: "variant gekozen → groen",
  gecontroleerd: "gecontroleerd",
  bevestigd: "bevestigd ondanks datagat",
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
        <IconSearch /> Andere match
      </a>
    </Button>
  );
}

// De gele afwijkingen benoemen (transparantieregel C-07): gevraagd → geleverd + oordeel.
function DeviationList({ deviations }: { deviations: Deviation[] }) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {deviations.map((d) => (
        <li key={d.field} className="text-amber-700 dark:text-amber-400">
          <span className="font-medium">{d.field}</span>: gevraagd {d.requested} →
          geleverd {d.delivered ?? "—"}
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
        Reden (verplicht bij afwijzen)
      </label>
      <textarea
        id={`reason-${itemId}`}
        name="reason"
        rows={2}
        required
        placeholder="Waarom valt deze afwijking buiten wat de klant accepteert?"
        className="w-full rounded-lg border border-input bg-background p-2.5 text-sm"
      />
      <div>
        <Button type="submit" size="sm" variant="destructive">
          Wijs af → rood
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
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
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
            <IconCheck /> Kies deze
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
        Zelfde merk, afwijking binnen de gele marge. Accepteer als voorstel — de regel
        wordt groen (handmatig gekozen) en de afwijking blijft als notitie staan — of
        wijs af naar rood.
      </p>
      {gele.length > 0 && <DeviationList deviations={gele} />}
      <div className="flex flex-wrap items-center gap-2">
        <form action={decideAction}>
          <input type="hidden" name="dossierId" value={dossierId} />
          <input type="hidden" name="specLineId" value={item.id} />
          <input type="hidden" name="decision" value="accepteer" />
          <Button type="submit" size="sm">
            <IconCheck /> Accepteer als voorstel
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
        We vonden {candidates.length} passende kandidaten — welke moet het worden?
        Kiezen maakt de regel groen (handmatig gekozen); de afwijkingen blijven als
        notitie staan.
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
            <IconCheck /> Accepteer als voorstel
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
          Kleurvariant kiezen — deze kleuren bestaan écht in de catalogus
          {req ? (
            <>
              {" "}
              (gevraagd: <span className="font-medium">{req}</span>)
            </>
          ) : null}
          . Kiezen maakt de regel groen (handmatig gekozen).
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
          Geen kleurvarianten van dit product in de catalogus gevonden — kies uit de
          kandidaten van de regel (kiezen maakt de regel groen, handmatig gekozen).
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
        Geen kleurvarianten én geen kandidaten gevonden — open de regel voor een
        andere match.
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
        Bevestig ondanks ontbrekende data. Ontbrekende data is geen fout — bevestig de
        match of kies een andere.
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
            placeholder="Reden (optioneel)"
            className="h-7 w-56 text-sm"
          />
          <Button type="submit" size="sm">
            <IconCheck /> Bevestig
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
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Controleer de ingelezen regel — de OCR-import kan tekens verkeerd lezen. Bevestig
        als de regel klopt, of open ‘m voor een andere match.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <form action={decideAction}>
          <input type="hidden" name="dossierId" value={dossierId} />
          <input type="hidden" name="specLineId" value={item.id} />
          <input type="hidden" name="decision" value="gecontroleerd" />
          <Button type="submit" size="sm">
            <IconCheck /> Gecontroleerd
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
          Geen match gevonden{line.noMatchReason ? ` — ${line.noMatchReason}` : ""}.
          Zoek zelf een vergelijkbaar product in de catalogus en link het; de regel
          wordt groen met het merkteken &ldquo;handmatig gekozen&rdquo;.
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
          <input type="hidden" name="regel" value={line.id} />
          <Input
            name="zoek"
            defaultValue={line.searchQuery ?? ""}
            placeholder="Zoek in de catalogus (naam of artikelcode)"
            className="h-8 w-72 max-w-full text-sm"
            aria-label={`Zoek vergelijkbaar product voor ${line.fixtureCode}`}
          />
          <Button type="submit" size="sm" variant="secondary">
            <IconSearch /> Zoek
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
                      <IconCheck /> Link dit product
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
        {results && results.length === 0 && line.searchQuery && (
          <p className="text-sm text-muted-foreground">
            Geen zichtbare producten gevonden voor &ldquo;{line.searchQuery}&rdquo; —
            probeer een ruimere zoekterm.
          </p>
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
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="font-medium">Niets te reviewen — alle regels zijn eenduidig.</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Regels komen hier alleen als er een menselijk oordeel nodig is: een gele
          afwijking, een kleurvariant, een bevestiging bij ontbrekende data, een
          OCR-controle of een niet-gevonden product dat handmatig gelinkt moet worden.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium">
          Review — {pending.length + rood.length} wachtend, {done.length} afgerond
        </h2>
        <p className="text-xs text-muted-foreground">Volgorde = aanvraagvolgorde.</p>
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
          <p className="text-sm text-muted-foreground">
            Geen wachtende items — alles is afgerond.
          </p>
        )
      )}

      {rood.length > 0 && linkAction && (
        <section className="flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-medium">
              Niet gevonden — handmatig linken ({rood.length})
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Merk in de catalogus, dit product niet. Het systeem doet hier bewust
              geen suggesties — zoeken en kiezen is aan jou.
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
            Afgerond ({done.length})
          </h3>
          <ul className="flex flex-col divide-y rounded-lg border">
            {done.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
              >
                <IconCheck className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                <EntityLine item={item} />
                <StatusBadge status={item.status} className="ml-auto" />
                <span className="w-full text-xs text-muted-foreground sm:w-auto">
                  {item.reviewDecision
                    ? `${DECISION_LABEL[item.reviewDecision] ?? item.reviewDecision} · `
                    : ""}
                  door {item.reviewedBy ?? "onbekend"}
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
