// Verlengen van een prijslijst (bevinding B3) — de ingang die bij PriceListExpiryNotice
// hoort. Die melding staat op vier schermen en zegt: "What's needed now is an extension, not
// a new submission." Tot nu toe was er geen enkele plek waar die verlenging kon gebeuren;
// hier is hij. De tekst van de melding is niet aangepast — hij wordt waar.
//
// Server-component, geen client-JS, geen lucide-react — zelfde reden als bij
// price-list-expiry-notice.tsx: de RSC-testbrug struikelt over client-referenties, en het
// omliggende scherm (price-list-status.tsx) gebruikt ook geen iconen.
//
// Bewust ONDER de statustabel en niet ernaast: de tabel is het oordeel ("hier zit een gat"),
// dit is de handeling. Alleen lijsten die verlopen zijn of binnen 30 dagen verlopen komen
// hier — dezelfde grens die de tabel al hanteert voor zijn amber/blauwe standen. Een lijst
// met nog 178 dagen heeft geen datumknop nodig en zou de lijst alleen maar vullen.
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PriceListRow } from "@/components/data/price-list-status";

type FormAction = (formData: FormData) => void | Promise<void>;

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/** `until` komt uit de ADRESBALK, niet uit de action — iedereen met een sessie kan er
 *  zetten wat hij wil. fmtDate() splitst alleen op '-', dus "gefeliciteerd-x-y" zou als
 *  "y-x-gefeliciteerd" middenin een groene role="status"-zin belanden: een bestuurbare
 *  valse succesmelding via een geprepareerde link. React escapet het (geen XSS), maar de
 *  tekst is het probleem. Vorm afdwingen vóór hij gerenderd wordt; wat niet klopt valt
 *  terug op de zin zónder datum. */
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Vandaag als 'YYYY-MM-DD' (UTC) — zelfde conventie als daysUntil() in enrichment.ts en
 *  als de guard in extendPriceListValidity, zodat de `min` van het datumveld precies
 *  hetzelfde zegt als de server. */
function isoVandaag(today: Date): string {
  const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(today.getUTCDate()).padStart(2, "0");
  return `${today.getUTCFullYear()}-${mm}-${dd}`;
}

export type ExtendNotice = { tone: "ok" | "warn"; text: string };

/**
 * De uitkomst van extendPriceListAction, zoals hij in de URL terugkomt (`?extend=…`),
 * vertaald naar één zin. De action stuurt alleen codes; de UI-taal staat hier — één plek,
 * en nooit ruwe database-tekst in de adresbalk.
 */
export function extendNotice(
  extend: string | undefined,
  until: string | undefined,
): ExtendNotice | null {
  if (!extend) return null;
  switch (extend) {
    case "ok":
      return {
        tone: "ok",
        text:
          until && ISO_DATUM.test(until)
            ? `Extended — this price list is now valid until ${fmtDate(until)}. Its products are back in the matcher.`
            : "Extended — this price list is valid again.",
      };
    case "unknown_list":
      return { tone: "warn", text: "That price list no longer exists." };
    case "archived":
      // Dit is geen randgeval maar een echt verschil: een vervangen lijst heeft geen
      // prijsregels meer (die staan in het archief), dus een latere datum zou een lege
      // lijst groen kleuren.
      return {
        tone: "warn",
        text: "That list was replaced and its prices are archived. It needs a new price list, not a new date.",
      };
    case "invalid_date":
      return { tone: "warn", text: "Pick an end date first (day-month-year)." };
    case "date_in_past":
      return {
        tone: "warn",
        text: "An extension has to end today or later — a date in the past changes nothing.",
      };
    case "not_later":
      return {
        tone: "warn",
        text: "The new date has to be later than the current one. This form only moves an end date forward; shortening a list is a different decision.",
      };
    case "before_start":
      return {
        tone: "warn",
        text: "That date falls before the list's start date, so the products would stay hidden.",
      };
    case "not_started":
      // Geen mislukte verlenging maar een verkeerde handeling: de matcher toont alleen
      // lijsten die AL begonnen zijn (valid_from <= vandaag), dus geen enkele einddatum
      // helpt hier. De startdatum moet naar voren.
      return {
        tone: "warn",
        text: "That list has not started yet — its start date is still in the future. Extending the end date cannot bring its products back; the start date has to move first.",
      };
    default:
      return null;
  }
}

/** De statustabel toont ÁLLE lijsten, ook vervangen exemplaren (die blijven bestaan omdat
 *  quote_lines ernaar verwijzen). Deze sectie heeft één veld meer nodig dan die tabel: of de
 *  lijst vervangen is. Vandaar dit type i.p.v. PriceListRow — listPriceListStatus levert het
 *  al, en `?` houdt de bestaande fixtures geldig. */
export type PriceListExtendRow = PriceListRow & { replacedAt?: Date | null };

/** Verlopen eerst (zij zijn het gat van vandaag), daarna wat het snelst verloopt.
 *
 *  Vervangen lijsten vallen af. archivePriceList() zet `replaced_at` én laat `valid_until`
 *  in het verleden staan, dus zo'n lijst leest als "verlopen" en kreeg een verlengformulier
 *  dat extendPriceListValidity 100% van de tijd weigert met 'archived' — een knop die per
 *  definitie niet werkt. De guard in de repo-laag blijft staan (tweede verdedigingslijn,
 *  een request komt ook zonder dit formulier binnen); hier gaat de knop weg. */
function teVerlengen(rows: PriceListExtendRow[]): PriceListExtendRow[] {
  return rows
    .filter((r) => r.bucket !== "ok" && !r.replacedAt)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export function PriceListExtendSection({
  rows,
  extendAction,
  notice,
  today = new Date(),
}: {
  rows: PriceListExtendRow[];
  extendAction: FormAction;
  notice?: ExtendNotice | null;
  today?: Date;
}) {
  const rijen = teVerlengen(rows);
  // Geen lege sectie: de tabel hierboven zegt bij nul gaten al "All price lists valid with
  // room to spare". Een tweede kop die hetzelfde nog eens in het niets herhaalt, is ruis.
  // De melding blijft wél staan — die hoort bij de handeling die net gedaan is.
  if (rijen.length === 0 && !notice) return null;

  const vandaag = isoVandaag(today);

  return (
    <section className="mt-8 space-y-3">
      <div>
        <h2 className="text-sm font-medium">Extend a price list</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The brand confirmed the prices stay valid? Move the end date forward.
          Same list, same prices — only the end date changes, and the products
          return to the matcher. Shortening a list isn&apos;t done here.
        </p>
      </div>

      {notice && (
        <p
          role="status"
          className={
            notice.tone === "ok"
              ? "text-sm text-status-green-ink"
              : "text-sm text-status-amber-ink"
          }
        >
          {notice.text}
        </p>
      )}

      {rijen.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {rijen.map((r) => {
            const verlopen = r.bucket === "verlopen";
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-end justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.brandName ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.name} ·{" "}
                    <span className="tabular-nums">
                      {verlopen ? "expired on" : "valid until"}{" "}
                      {fmtDate(r.validUntil)}
                    </span>
                  </p>
                </div>
                <form
                  action={extendAction}
                  className="flex items-end gap-2"
                >
                  <input type="hidden" name="priceListId" value={r.id} />
                  <label className="text-xs text-muted-foreground">
                    New end date
                    {/* `min` is een dienst aan de gebruiker, geen grens — de grens staat
                        in extendPriceListValidity. Een request komt hier ook zonder dit
                        formulier binnen (zelfde afweging als de upload-cap). */}
                    <Input
                      type="date"
                      name="validUntil"
                      required
                      min={vandaag}
                      aria-label={`New end date for ${r.brandName ?? r.name}`}
                      className="mt-1 w-44"
                    />
                  </label>
                  <Button type="submit" size="sm" variant="outline">
                    Extend
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
