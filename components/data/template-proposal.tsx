// Het voorstel-scherm van het retour-pad (sprint 1.2, docs/plan-1-2-retourpad.md).
// Tussen "het merk leverde een bestand" en "de catalogus wijzigt" staat precies dit scherm:
// niets is opgeslagen, en niets wordt opgeslagen zonder een vinkje van een mens.
//
// DE DEFAULTS ZIJN HET ONTWERP (besluit 4) — niet de opmaak:
//   new              → vinkje AAN   (DB was leeg; additief, er sneuvelt niets)
//   changed          → vinkje UIT   (DB was gevuld: bestaand wint, tenzij aangevinkt)
//   conflict/clear   → vinkje UIT   (het merk wil WISSEN; zelfde klasse als changed)
//   overige conflicts→ GEEN vinkje  (niet toepasbaar — wel gemeld, nooit verzwegen)
//   nieuw product    → vinkje UIT op PRODUCTniveau (+ "Select all new products")
//
// DE VALUE VAN EEN VELD-VINKJE IS DE OUDE WAARDE. Dat is geen curiositeit maar de
// stale-guard (contract: ApplySelection.prevSeen): de apply-laag vergelijkt hem met de
// actuele DB-waarde en slaat het veld over als de catalogus intussen wijzigde. Wat je niet
// zag, overschrijf je niet. Leeg veld → lege string; de action maakt daar null van.
//
// GEEN EIGEN VALIDATIEPROZA: de 1.1-waarschuwingen komen door waarschuwingsTekst() en
// samenvattingsTekst() uit lib/excel-validate-messages.ts. Dit bestand schrijft geen enkele
// zin over het format van het bestand.
import { Button } from "@/components/ui/button";
import { FIELD_CATALOG } from "@/lib/field-catalog";
import type { RijWaarschuwing } from "@/lib/excel-validate";
import {
  samenvattingsTekst,
  waarschuwingsTekst,
} from "@/lib/excel-validate-messages";
import {
  fieldSelectionKey,
  newProductSelectionKey,
  priceSelectionKey,
  type FieldProposal,
  type PriceProposal,
  type ProductDiff,
  type TemplateProposal as TemplateProposalData,
} from "@/lib/template-diff";
import { SelectAllNewProducts } from "./select-all-new-products";

type FormAction = (formData: FormData) => void | Promise<void>;

/** De ACTIEVE prijslijst van dit merk, of null. Bepaalt of het formulier om een naam en
 *  geldigheid vraagt (besluit 1): met een actieve lijst erven de regels haar geldigheid. */
export type ActivePriceList = { name: string; validUntil: string };

// catalog-key → Engels label, precies het label dat het merk in zijn eigen bestand zag.
// Onbekende key → de key zelf: een veld zonder label is een signaal, geen reden om stil
// een rij weg te laten.
const LABEL_PER_KEY = new Map<string, string>(
  FIELD_CATALOG.flatMap((b) => b.fields.map((f) => [f.key, f.labelEn] as const)),
);

/** Sprint 1.8: een EIGEN veld van Stefan staat niet in FIELD_CATALOG, dus komt zijn label
 *  hier binnen als kant-en-klare map (fieldKey → labelEn). Bewust geen import uit
 *  lib/custom-fields.ts: dit scherm hoeft de sleutelvorm `custom:<uuid>` niet te kennen,
 *  en wat het niet kent kan het ook niet verkeerd samenstellen. De pagina levert de map. */
export type EigenVeldLabels = Readonly<Record<string, string>>;

const veldLabel = (key: string, eigen?: EigenVeldLabels): string =>
  LABEL_PER_KEY.get(key) ?? eigen?.[key] ?? key;

const PRIJS_LABEL = veldLabel("list_price_excl_vat");

// ── Kleine bouwstenen ───────────────────────────────────────────────────────

type BadgeSoort = "new" | "changed" | "conflict";

const BADGE_STIJL: Record<BadgeSoort, string> = {
  new: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  changed: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  // Amber, geen rood: een conflict is geen fout van de lezer maar iets dat een besluit
  // vraagt. Rood zou suggereren dat er iets stuk is.
  conflict:
    "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};

const BADGE_TEKST: Record<BadgeSoort, string> = {
  new: "New",
  changed: "Changed",
  conflict: "Conflict",
};

function Badge({ soort }: { soort: BadgeSoort }) {
  return (
    <span
      data-badge={soort}
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${BADGE_STIJL[soort]}`}
    >
      {BADGE_TEKST[soort]}
    </span>
  );
}

/** Oud → nieuw. Een lege kant is een em-dash: "" en "niets" zien er in een tabel
 *  identiek uit, en juist dáár zit het verschil tussen wissen en niets doen. */
function OudNieuw({ prev, next }: { prev: string | null; next: string | null }) {
  return (
    <span className="flex flex-wrap items-baseline gap-1.5">
      <span
        className={
          prev
            ? "text-muted-foreground line-through decoration-muted-foreground/50"
            : "text-muted-foreground"
        }
      >
        {prev || "—"}
      </span>
      <span aria-hidden className="text-muted-foreground">
        →
      </span>
      <span className={next ? "font-medium" : "text-muted-foreground"}>
        {next || "(empty)"}
      </span>
    </span>
  );
}

function Vinkje({
  name,
  value,
  defaultChecked,
  label,
}: {
  name: string;
  value: string;
  defaultChecked: boolean;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      name={name}
      // De getoonde oude waarde reist mee als stale-guard (zie kop van dit bestand).
      value={value}
      defaultChecked={defaultChecked}
      aria-label={label}
      className="size-4 shrink-0 accent-foreground"
    />
  );
}

/** Vaste plek voor het vinkje, ook als er geen is: zonder deze cel schuift een rij zonder
 *  vinkje op en lijkt hij bij het veld ernaast te horen. */
function GeenVinkje() {
  return <span aria-hidden className="inline-block size-4 shrink-0" />;
}

// ── Eén veldrij ─────────────────────────────────────────────────────────────

function VeldRij({
  rij,
  artikelcode,
  veld,
  eigenVeldLabels,
  readOnly = false,
}: {
  rij: number;
  artikelcode: string;
  veld: FieldProposal;
  eigenVeldLabels?: EigenVeldLabels;
  /** Nieuw product: álles hangt aan het ene productvinkje, dus geen veld-vinkjes.
   *  Per-veld vinkjes zouden suggereren dat je een half product kunt aanmaken. */
  readOnly?: boolean;
}) {
  if (veld.kind === "unchanged") return null; // telt alleen mee in de samenvatting
  const label = veldLabel(veld.fieldKey, eigenVeldLabels);
  const naam = fieldSelectionKey(rij, veld.fieldKey);
  const aria = `Apply ${label} for ${artikelcode}`;

  const inhoud = () => {
    switch (veld.kind) {
      case "new":
        return {
          soort: "new" as const,
          reden: null,
          // value="" — de DB was leeg; de action leest dat als prevSeen null.
          vink: <Vinkje name={naam} value="" defaultChecked label={aria} />,
          body: <OudNieuw prev={null} next={veld.next} />,
          uitleg: null,
        };
      case "changed":
        return {
          soort: "changed" as const,
          reden: null,
          vink: (
            <Vinkje
              name={naam}
              value={veld.prev}
              defaultChecked={false}
              label={aria}
            />
          ),
          body: <OudNieuw prev={veld.prev} next={veld.next} />,
          uitleg: null,
        };
      case "conflict":
        switch (veld.reden.code) {
          case "clear":
            return {
              soort: "conflict" as const,
              reden: "clear",
              vink: (
                <Vinkje
                  name={naam}
                  value={veld.reden.prev}
                  defaultChecked={false}
                  label={aria}
                />
              ),
              body: <OudNieuw prev={veld.reden.prev} next={null} />,
              uitleg:
                "The brand left this field empty while we have a value. Check to clear it.",
            };
          case "unprocessable":
            return {
              soort: "conflict" as const,
              reden: "unprocessable",
              vink: <GeenVinkje />,
              body: <OudNieuw prev={null} next={veld.reden.ruw} />,
              uitleg: `Received — cannot be stored: "${veld.reden.ruw}" is not a valid ${KOLOMTYPE_TEKST[veld.reden.kolomType]} value for this field. Ask the brand to correct it.`,
            };
          case "not_storable":
            return {
              soort: "conflict" as const,
              reden: "not_storable",
              vink: <GeenVinkje />,
              body: <OudNieuw prev={null} next={veld.reden.ruw} />,
              uitleg:
                "Received — cannot be stored: we have no field for this yet. The value is shown here and nowhere else.",
            };
          case "price_clear":
            return {
              soort: "conflict" as const,
              reden: "price_clear",
              vink: <GeenVinkje />,
              body: <OudNieuw prev={veld.reden.prev} next={null} />,
              uitleg: PRIJS_WISSEN_UITLEG,
            };
        }
    }
  };

  const { soort, reden, vink, body, uitleg } = inhoud();
  return (
    <li
      data-veld={veld.fieldKey}
      data-soort={soort}
      data-reden={reden ?? undefined}
      className="flex items-start gap-3 border-t border-foreground/5 px-3 py-2 first:border-t-0"
    >
      <span className="mt-0.5">{readOnly ? <GeenVinkje /> : vink}</span>
      <span className="grid flex-1 gap-1 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="min-w-0 text-sm">
          {body}
          {uitleg && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {uitleg}
            </span>
          )}
        </span>
      </span>
      <Badge soort={soort} />
    </li>
  );
}

/** Eén zin, twee plekken (veld-conflict en prijsrij) — uit elkaar laten lopen zou twee
 *  verschillende verhalen over dezelfde regel vertellen. */
const PRIJS_WISSEN_UITLEG =
  "Clearing a price is not supported here — a product without a price disappears from every search. Ask the brand for the new price.";

const KOLOMTYPE_TEKST: Record<string, string> = {
  text: "text",
  int: "whole number",
  num: "number",
  bool: "yes/no",
};

// ── De prijsrij ─────────────────────────────────────────────────────────────

/**
 * De prijs staat NIET op products maar op prices/price_lists, en heeft daarom een eigen
 * selectie-sleutel (priceSelectionKey ≠ fieldSelectionKey). Vandaar een eigen rij i.p.v.
 * hergebruik van VeldRij — die zou de sleutel fout maken.
 */
function PrijsRij({
  rij,
  artikelcode,
  prijs,
  readOnly = false,
}: {
  rij: number;
  artikelcode: string;
  prijs: PriceProposal;
  readOnly?: boolean;
}) {
  if (prijs.kind === "unchanged") return null;
  const naam = priceSelectionKey(rij);
  const aria = `Apply ${PRIJS_LABEL} for ${artikelcode}`;

  if (prijs.kind === "conflict") {
    return (
      <li
        data-veld="list_price_excl_vat"
        data-soort="conflict"
        data-reden={prijs.reden.code}
        className="flex items-start gap-3 border-t border-foreground/5 px-3 py-2"
      >
        <span className="mt-0.5">
          <GeenVinkje />
        </span>
        <span className="grid flex-1 gap-1 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-3">
          <span className="text-sm text-muted-foreground">{PRIJS_LABEL}</span>
          <span className="min-w-0 text-sm">
            <OudNieuw
              prev={prijs.reden.code === "price_clear" ? prijs.reden.prev : null}
              next={
                prijs.reden.code === "unprocessable" ? prijs.reden.ruw : null
              }
            />
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {prijs.reden.code === "price_clear"
                ? PRIJS_WISSEN_UITLEG
                : "Received — cannot be stored: this is not a valid amount. Ask the brand to correct it."}
            </span>
          </span>
        </span>
        <Badge soort="conflict" />
      </li>
    );
  }

  return (
    <li
      data-veld="list_price_excl_vat"
      data-soort={prijs.kind}
      className="flex items-start gap-3 border-t border-foreground/5 px-3 py-2"
    >
      <span className="mt-0.5">
        {readOnly ? (
          <GeenVinkje />
        ) : (
          <Vinkje
            name={naam}
            value={prijs.kind === "changed" ? prijs.prev : ""}
            defaultChecked={prijs.kind === "new"}
            label={aria}
          />
        )}
      </span>
      <span className="grid flex-1 gap-1 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-3">
        <span className="text-sm text-muted-foreground">{PRIJS_LABEL}</span>
        <span className="min-w-0 text-sm">
          <OudNieuw
            prev={prijs.kind === "changed" ? prijs.prev : null}
            next={prijs.next}
          />
        </span>
      </span>
      <Badge soort={prijs.kind === "new" ? "new" : "changed"} />
    </li>
  );
}

// ── Waarschuwingen van 1.1 bij een rij ──────────────────────────────────────

function Waarschuwingen({ items }: { items: RijWaarschuwing[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="px-3 pb-2 pt-1">
      {items.map((w, i) => (
        <li key={`${w.code}-${w.rij}-${i}`} className="text-xs text-muted-foreground">
          {waarschuwingsTekst(w)}
        </li>
      ))}
    </ul>
  );
}

// ── Eén productgroep ────────────────────────────────────────────────────────

function ProductGroep({
  diff,
  eigenVeldLabels,
}: {
  diff: ProductDiff;
  eigenVeldLabels?: EigenVeldLabels;
}) {
  if (diff.kind === "ambiguous_duplicate") {
    return (
      <section
        data-groep="ambiguous_duplicate"
        className="rounded-lg bg-card ring-1 ring-foreground/10"
      >
        <header className="flex flex-wrap items-center gap-2 px-3 py-2">
          <span className="font-medium tabular-nums">{diff.articleCode}</span>
          <Badge soort="conflict" />
        </header>
        <p className="px-3 pb-3 text-sm text-muted-foreground">
          This article code appears on rows{" "}
          <span className="tabular-nums">{diff.rijen.join(", ")}</span> of the
          file. We will not guess which row counts, so nothing from these rows
          can be applied — please fix the file and upload it again.
        </p>
      </section>
    );
  }

  const nieuw = diff.kind === "new_product";
  const blokkade = diff.kind === "new_product" ? diff.blocked : null;
  const geblokkeerd = blokkade !== null;
  // Nieuw product: geen enkel veld-vinkje — het ene productvinkje draagt de hele rij.
  // Een geblokkeerd voorstel heeft ook dát vinkje niet en is dus volledig read-only.
  const readOnly = nieuw;

  return (
    <section
      data-groep={diff.kind}
      data-rij={diff.rij}
      data-blocked={blokkade?.code}
      className="rounded-lg bg-card ring-1 ring-foreground/10"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-foreground/5 px-3 py-2">
        {nieuw &&
          (geblokkeerd ? (
            <GeenVinkje />
          ) : (
            <input
              type="checkbox"
              name={newProductSelectionKey(diff.rij)}
              value="1"
              // Default UIT: een tikfout in een artikelcode maakt anders stil een
              // dubbelproduct — precies de stille schade die dit pad moet voorkomen.
              aria-label={`Create new product ${diff.articleCode}`}
              className="size-4 shrink-0 accent-foreground"
            />
          ))}
        <span className="font-medium tabular-nums">
          {/* Zonder artikelcode is er geen identiteit om te tonen; het rijnummer is dan
              het enige waar een mens in Excel iets aan heeft. */}
          {diff.articleCode || "(no article code)"}
        </span>
        {diff.kind === "known" ? (
          <span className="text-sm text-muted-foreground">
            {diff.productName}
          </span>
        ) : (
          <Badge soort={geblokkeerd ? "conflict" : "new"} />
        )}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          row {diff.rij}
        </span>
      </header>

      {nieuw && (
        <p className="px-3 pt-2 text-sm text-muted-foreground">
          {blokkade ? BLOKKADE_TEKST[blokkade.code] : NIEUW_PRODUCT_TEKST}
        </p>
      )}

      <Waarschuwingen items={diff.waarschuwingen} />

      <ul>
        {diff.fields.map((veld) => (
          <VeldRij
            key={veld.fieldKey}
            rij={diff.rij}
            artikelcode={diff.articleCode}
            veld={veld}
            eigenVeldLabels={eigenVeldLabels}
            readOnly={readOnly}
          />
        ))}
        {diff.price && (
          <PrijsRij
            rij={diff.rij}
            artikelcode={diff.articleCode}
            prijs={diff.price}
            readOnly={readOnly}
          />
        )}
      </ul>
    </section>
  );
}

const NIEUW_PRODUCT_TEKST =
  "We do not know this article code yet. Check it against the brand's price list before you create it: a typo here silently creates a duplicate product. Checking the box creates the product with everything below.";

/** Een geblokkeerd voorstel is géén afwijzing van de rij: de waarden zijn ontvangen en
 *  staan hieronder. Er is alleen niets om ze aan te hangen. Beide codes uit het contract
 *  (ProductDiff.blocked) hebben hun eigen zin — "geen naam" en "geen artikelcode" vragen
 *  een ander gesprek met het merk. */
const BLOKKADE_TEKST: Record<"missing_name" | "missing_article_code", string> = {
  missing_name:
    "We cannot create this product without a name — “Product name (English)” is empty on this row. Everything below was received, but nothing can be stored until the brand supplies a name.",
  missing_article_code:
    "This row has no “Supplier article code”, so there is nothing to identify the product by — two such rows would silently become one. Everything below was received, but nothing can be stored until the brand supplies a code.",
};

// ── Het scherm ──────────────────────────────────────────────────────────────

export function TemplateProposal({
  brandId,
  uploadId,
  filename,
  rowCount,
  proposal,
  waarschuwingen,
  activePriceList,
  eigenVeldLabels,
  approveAction,
  rejectAction,
}: {
  brandId: string;
  uploadId: string;
  filename: string;
  /** Aantal product-rijen in het bestand (uit de snapshot) — de teller die 1.1 gebruikt. */
  rowCount: number;
  proposal: TemplateProposalData;
  /** Alle 1.1-waarschuwingen van het bestand; voor de samenvattingszin. */
  waarschuwingen: RijWaarschuwing[];
  activePriceList: ActivePriceList | null;
  /** fieldKey → labelEn voor de EIGEN velden (sprint 1.8), inclusief gearchiveerde: een
   *  bestand dat onderweg was mag zijn kolom hier niet als kale sleutel zien. */
  eigenVeldLabels?: EigenVeldLabels;
  approveAction: FormAction;
  rejectAction: FormAction;
}) {
  const { rows, counts } = proposal;
  // counts.priceLines telt exact de toepasbare prijsvoorstellen (new + changed) — een
  // prijs-conflict is per definitie niet toepasbaar en mag geen prijslijst laten aanmaken.
  const prijsVoorstellen = counts.priceLines;
  // NIET counts.newProducts: dat telt óók de geblokkeerde groepen, en die hebben geen
  // vinkje. Een knop "Select all new products (3)" die er twee aanvinkt liegt.
  const nieuweProducten = rows.filter(
    (r) => r.kind === "new_product" && r.blocked === null,
  ).length;

  return (
    <form action={approveAction}>
      <input type="hidden" name="brandId" value={brandId} />
      <input type="hidden" name="uploadId" value={uploadId} />

      {/* Samenvattingsbanner: wat zit erin, en wat gebeurt er niet. */}
      <div className="mb-5 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-foreground">Template proposal</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{filename}</span>
        </div>
        {/* De 1.1-renderer vat de waarschuwingen samen — 400 losse "nieuw product?"-regels
            zijn geen mislukking maar een eerste levering. */}
        <p className="mt-1">{samenvattingsTekst(waarschuwingen, rowCount)}</p>
        <p className="mt-1">
          <span className="font-medium text-foreground tabular-nums">
            {counts.newFields}
          </span>{" "}
          new ·{" "}
          <span className="font-medium text-foreground tabular-nums">
            {counts.changedFields}
          </span>{" "}
          changed ·{" "}
          <span className="font-medium text-foreground tabular-nums">
            {counts.conflicts}
          </span>{" "}
          conflicts ·{" "}
          <span className="tabular-nums">{counts.unchangedFields}</span>{" "}
          unchanged ·{" "}
          <span className="tabular-nums">{counts.newProducts}</span> new
          product(s) · <span className="tabular-nums">{counts.priceLines}</span>{" "}
          price line(s)
        </p>
        <p className="mt-1">
          Nothing is saved yet. New values are checked by default; anything that
          would overwrite or clear existing data is off by default — existing
          data wins unless you say otherwise.
        </p>
      </div>

      {nieuweProducten > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <SelectAllNewProducts count={nieuweProducten} />
          <span className="text-xs text-muted-foreground">
            A first delivery is often all new — but check the article codes.
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This file changes nothing: everything in it matches what we already
          have.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((diff) => (
            <ProductGroep
              key={
                diff.kind === "ambiguous_duplicate"
                  ? `dup-${diff.articleCode}`
                  : `r${diff.rij}`
              }
              diff={diff}
              eigenVeldLabels={eigenVeldLabels}
            />
          ))}
        </div>
      )}

      {/* Prijslijst (besluit 1). Alleen uitvragen als het moet: mét actieve lijst erven
          de regels haar geldigheid, en die verlengen is een ander scenario. */}
      {prijsVoorstellen > 0 &&
        (activePriceList ? (
          <p className="mt-5 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
            Prices will be added to price list{" "}
            <span className="font-medium text-foreground">
              {activePriceList.name}
            </span>{" "}
            (valid until{" "}
            <span className="tabular-nums">{activePriceList.validUntil}</span>).
            Products you do not touch keep their current price.
          </p>
        ) : (
          <fieldset className="mt-5 rounded-lg bg-card p-4 ring-1 ring-foreground/10">
            <legend className="px-1 text-sm font-medium">
              New price list
            </legend>
            <p className="mb-3 text-sm text-muted-foreground">
              This brand has no active price list, so the{" "}
              <span className="tabular-nums">{prijsVoorstellen}</span> price
              line(s) need one. An end date is required: an expired price list
              makes a brand&apos;s products invisible everywhere, so we never
              guess one.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">Name</span>
                <input
                  type="text"
                  name="priceListName"
                  required
                  placeholder="Price list 2026"
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">
                  Valid from
                </span>
                <input
                  type="date"
                  name="priceListValidFrom"
                  required
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">
                  Valid until
                </span>
                <input
                  type="date"
                  name="priceListValidUntil"
                  required
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
                />
              </label>
            </div>
          </fieldset>
        ))}

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">
            Note (kept with a rejection)
          </span>
          <input
            type="text"
            name="reviewNote"
            placeholder="e.g. wrong price list attached"
            className="w-full min-w-64 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
          />
        </label>
        <div className="flex items-center gap-2">
          {/* formNoValidate: afwijzen mag niet stuklopen op de prijslijst-velden — je
              wijst juist af omdat het bestand niet deugt. */}
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            formAction={rejectAction}
            formNoValidate
          >
            Reject
          </Button>
          <Button type="submit" size="sm">
            Approve checked changes
          </Button>
        </div>
      </div>
    </form>
  );
}
