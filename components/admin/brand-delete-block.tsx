"use client";
// Verwijderen — of, veel vaker, uitleggen waarom dat niet kan (plan §3).
//
// Bij 405 van de 437 bestaande merken is de énige blokkade een lege prijslijst die de
// import heeft aangemaakt. Daarom staat die prijslijst hier BIJ NAAM met zijn aantal
// prijsregels: "1 price list — Brutoprijslijst Tronconi (0 price rows)". Zonder die naam
// en die nul leest "1 price list" als een fout en gaat iemand zoeken naar iets wat er
// niet is.
//
// Twee besluiten die je hieronder terugziet:
//  - Bij ≥1 blocker is er GEEN verwijderknop. Afwezig, niet uitgegrijsd: een dode knop
//    leert niets en nodigt uit tot klikken.
//  - De uitweg staat in HETZELFDE blok (G4). Wie hier komt wil het merk uit de werklijst
//    hebben; "bestaat niet meer" is dan het juiste antwoord, en dat mag geen zoektocht
//    naar een ander scherm worden.
import { useActionState } from "react";
import { veldClass } from "@/components/ui/field";
import type { BrandLifecycle } from "@/db/schema";
import type { BrandDeleteImpact } from "@/lib/repo/brands";
import type { BrandDeleteState } from "@/app/admin/brands/actions";
import { LIFECYCLE_LABEL } from "./brand-form";

export type BrandDeleteAction = (
  prev: BrandDeleteState,
  formData: FormData,
) => Promise<BrandDeleteState>;

const BLOCKER_LABEL: Record<
  keyof BrandDeleteImpact["blockers"],
  (n: number) => string
> = {
  products: (n) => `${n} ${n === 1 ? "product" : "products"}`,
  priceLists: (n) => `${n} ${n === 1 ? "price list" : "price lists"}`,
  enrichmentRuns: (n) => `${n} ${n === 1 ? "enrichment run" : "enrichment runs"}`,
  leads: (n) => `${n} ${n === 1 ? "lead" : "leads"}`,
};

const BLOCKER_ORDER: (keyof BrandDeleteImpact["blockers"])[] = [
  "products",
  "priceLists",
  "enrichmentRuns",
  "leads",
];

// brand_relations bovenaan en in gewone taal: dat is het outreach-spoor uit sprint 1.4
// (status, contactpersoon, notities) en het verdwijnt stil mee. Dat mag niet als
// "1 brand_relations" langskomen.
const CASCADE_ORDER: {
  key: keyof BrandDeleteImpact["cascades"];
  text: (n: number) => string;
}[] = [
  {
    key: "brandRelations",
    text: () => "the outreach record — status, contact person, notes",
  },
  {
    key: "brandAliases",
    text: (n) => `${n} alternative ${n === 1 ? "name" : "names"} (aliases)`,
  },
  {
    key: "brandFieldVisibility",
    text: (n) => `${n} per-field visibility ${n === 1 ? "exception" : "exceptions"}`,
  },
  {
    key: "brandUploads",
    text: (n) => `${n} uploaded ${n === 1 ? "file" : "files"} from this brand`,
  },
];

const LIFECYCLE_ORDER: BrandLifecycle[] = [
  "actief",
  "slapend",
  "bestaat_niet_meer",
];

function blockerLines(impact: BrandDeleteImpact) {
  return BLOCKER_ORDER.filter((k) => impact.blockers[k] > 0).map((k) => {
    const n = impact.blockers[k];
    const base = BLOCKER_LABEL[k](n);
    if (k !== "priceLists" || !impact.priceListName) return base;
    const rows = impact.priceRowCount;
    return `${base} — ${impact.priceListName} (${rows} price ${rows === 1 ? "row" : "rows"})`;
  });
}

function cascadeLines(impact: BrandDeleteImpact) {
  return CASCADE_ORDER.filter((c) => impact.cascades[c.key] > 0).map((c) =>
    c.text(impact.cascades[c.key]),
  );
}

export function BrandDeleteBlock({
  brandId,
  brandName,
  lifecycle,
  impact,
  deleteAction,
  setLifecycleAction,
  initialState = { status: "idle" },
}: {
  brandId: string;
  brandName: string;
  lifecycle: BrandLifecycle;
  impact: BrandDeleteImpact;
  deleteAction: BrandDeleteAction;
  setLifecycleAction: (formData: FormData) => void | Promise<void>;
  /** Alleen voor tests/verse render; productie start op idle. */
  initialState?: BrandDeleteState;
}) {
  const [state, formAction, pending] = useActionState<
    BrandDeleteState,
    FormData
  >(deleteAction, initialState);

  // De server mag het laatste woord hebben: hij hertelt vlak vóór de DELETE.
  const shown =
    state.status === "confirm" || state.status === "blocked"
      ? state.impact
      : impact;
  const blocked = state.status === "blocked" || shown.blocked;
  const confirming = state.status === "confirm" && !shown.blocked;

  const blockers = blockerLines(shown);
  const cascades = cascadeLines(shown);

  return (
    <section
      data-testid="brand-delete-block"
      className="rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10"
    >
      <h2 className="font-medium">Delete brand</h2>

      {blocked ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            {brandName} cannot be deleted: other records point to it. This is
            normal — the import gives every brand a price list, even an empty
            one.
          </p>
          <ul
            data-testid="brand-delete-blockers"
            className="mt-3 space-y-1 text-sm"
          >
            {blockers.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden>·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </>
      ) : confirming ? (
        <>
          <p className="mt-1 text-sm">
            Delete {brandName} for good? Nothing blocks it. These records
            disappear with it:
          </p>
          <ul
            data-testid="brand-delete-cascades"
            className="mt-3 space-y-1 text-sm"
          >
            {cascades.length === 0 ? (
              <li className="text-muted-foreground">
                Nothing else is attached to this brand.
              </li>
            ) : (
              cascades.map((line) => (
                <li key={line} className="flex gap-2">
                  <span aria-hidden>·</span>
                  <span>{line}</span>
                </li>
              ))
            )}
          </ul>
          <p className="mt-2 text-sm text-muted-foreground">
            This cannot be undone, and there is one database for both
            development and production.
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing blocks deleting {brandName}. You will see exactly what
          disappears before anything happens.
        </p>
      )}

      {state.status === "error" && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {state.message}
        </p>
      )}

      {/* Geen verwijderknop zolang er iets in de weg staat — afwezig, niet disabled. */}
      {!blocked && (
        <form action={formAction} className="mt-4">
          <input type="hidden" name="brandId" value={brandId} />
          {confirming && <input type="hidden" name="confirm" value="1" />}
          <button
            type="submit"
            disabled={pending}
            data-testid="brand-delete-button"
            className="inline-flex h-9 items-center rounded-md bg-destructive px-4 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-60"
          >
            {pending
              ? "Deleting…"
              : confirming
                ? `Yes, delete ${brandName}`
                : "Delete brand"}
          </button>
        </form>
      )}

      {/* De uitweg, in hetzelfde blok (G4). Bij een blokkade is dit het enige dat werkt;
          ook zonder blokkade is het meestal het betere antwoord dan wissen. */}
      <form
        action={setLifecycleAction}
        data-testid="brand-lifecycle-escape"
        className="mt-4 flex flex-wrap items-end gap-2 border-t border-foreground/10 pt-4"
      >
        <input type="hidden" name="brandId" value={brandId} />
        <label className="flex flex-col gap-1 text-sm">
          Lifecycle
          <select
            name="lifecycle"
            defaultValue={
              lifecycle === "actief" ? "bestaat_niet_meer" : lifecycle
            }
            aria-label={`Lifecycle for ${brandName}`}
            className={veldClass}
          >
            {LIFECYCLE_ORDER.map((l) => (
              <option key={l} value={l}>
                {LIFECYCLE_LABEL[l]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md border border-input px-4 text-sm font-medium hover:bg-accent"
        >
          Mark as discontinued instead
        </button>
        <p className="w-full text-xs text-muted-foreground">
          Keeps the history and the price list intact, and takes the brand out of
          the active work list. Reversible.
        </p>
      </form>
    </section>
  );
}
