// Review-station (functioneel ontwerp §3.7, flow §4.4). De wachtrij toont per regel met
// reviewKind ≠ null een kaart met de juiste beslis-acties; afgeronde regels dragen een
// audit-spoor (wie/wat/wanneer) — het menselijke oordeel blijft in beeld (D-06).
// Volgorde = aanvraagvolgorde, niet urgentie (C-11). Esthetiek = eerlijkheid: rustige
// tinten, geen rode alarmen, geen prijs- of statusgedreven hersortering.
import { IconCheck, IconSearch } from "./icons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "./status-badge";
import type { Deviation, ReviewItem } from "./types";

// Standaard-afwerkingen voor de variantkeuze (zelfde prijs → Brink kiest). De gevraagde
// kleur is de default; een gevraagde kleur die niet in de standaardlijst zit wordt vooraan
// toegevoegd — niets valt stil weg (ijzeren regel: niets stilzwijgend weglaten).
const STANDARD_FINISHES = ["wit", "zwart", "grijs", "aluminium"];

const DECISION_LABEL: Record<string, string> = {
  accepteer: "geaccepteerd als voorstel",
  afgewezen: "afgewezen → rood",
  variant: "variant gekozen",
  gecontroleerd: "gecontroleerd",
  bevestigd: "bevestigd ondanks datagat",
};

type Action = (formData: FormData) => void | Promise<void>;

function EntityLine({ item }: { item: ReviewItem }) {
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
      <a href={`/dossiers/${dossierId}/regel/${itemId}`}>
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
          {d.note ? ` · ${d.note}` : ""}
        </li>
      ))}
    </ul>
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
        Zelfde merk, afwijking binnen de gele marge. Accepteer als voorstel richting
        klant, of wijs af naar rood.
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
      {/* Afwijzen → rood vereist een reden (D-05). Het redenveld staat altijd in beeld. */}
      <form
        action={decideAction}
        className="flex flex-col gap-2 rounded-lg border border-dashed p-3"
      >
        <input type="hidden" name="dossierId" value={dossierId} />
        <input type="hidden" name="specLineId" value={item.id} />
        <input type="hidden" name="decision" value="afgewezen" />
        <label
          htmlFor={`reason-${item.id}`}
          className="text-sm font-medium"
        >
          Reden (verplicht bij afwijzen)
        </label>
        <textarea
          id={`reason-${item.id}`}
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
    </>
  );
}

function VariantCard({
  dossierId,
  item,
  decideAction,
}: {
  dossierId: string;
  item: ReviewItem;
  decideAction: Action;
}) {
  const req = item.reqColor?.trim() || null;
  const options =
    req && !STANDARD_FINISHES.includes(req.toLowerCase())
      ? [req, ...STANDARD_FINISHES]
      : STANDARD_FINISHES;
  const defaultColor = req ?? options[0];
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Kleurvariant kiezen — zelfde prijs → Brink kiest.
      </p>
      <form action={decideAction} className="flex flex-col gap-3">
        <input type="hidden" name="dossierId" value={dossierId} />
        <input type="hidden" name="specLineId" value={item.id} />
        <input type="hidden" name="decision" value="variant" />
        <fieldset className="flex flex-wrap gap-2">
          {options.map((color) => (
            <label
              key={color}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm has-[:checked]:border-foreground has-[:checked]:bg-muted"
            >
              <input
                type="radio"
                name="variantColor"
                value={color}
                defaultChecked={color === defaultColor}
              />
              {color}
            </label>
          ))}
        </fieldset>
        <div>
          <Button type="submit" size="sm">
            <IconCheck /> Bevestig kleur
          </Button>
        </div>
      </form>
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
}: {
  dossierId: string;
  item: ReviewItem;
  decideAction: Action;
}) {
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
        {item.reviewKind === "geel" && (
          <GeelCard dossierId={dossierId} item={item} decideAction={decideAction} />
        )}
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

export function ReviewQueue({
  dossierId,
  pending,
  done,
  decideAction,
}: {
  dossierId: string;
  pending: ReviewItem[];
  done: ReviewItem[];
  decideAction: Action;
}) {
  if (pending.length === 0 && done.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="font-medium">Niets te reviewen — alle regels zijn eenduidig.</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Regels komen hier alleen als er een menselijk oordeel nodig is: een gele
          afwijking, een kleurvariant, een bevestiging bij ontbrekende data of een
          OCR-controle.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium">
          Review — {pending.length} wachtend, {done.length} afgerond
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
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Geen wachtende items — alles is afgerond.
        </p>
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
