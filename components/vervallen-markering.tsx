// De rode markering bij een vervallen product — ijzeren regel 3, herschreven (19 aug 2026).
//
// Eén component, hergebruikt op elk scherm waar een product als kaart, kandidaat of
// offerteregel voorkomt (catalogus, match-kandidaten, review-wachtrij, regel-detail,
// offerte) — nooit vijf losse implementaties die uit elkaar kunnen lopen. Zelfde keuze en
// dezelfde reden als components/data/price-list-expiry-notice.tsx, dat hetzelfde doet voor
// de MERKKANT (daar heet het "vraag een verlenging aan"); dit is de PRODUCTKANT.
//
// TOONT NOOIT EEN BEDRAG. Er is bewust geen prop voor een prijs en die komt er ook niet: de
// hele wijziging bestaat eruit dat een verlopen lijst geen bedrag meer oplevert. De view
// levert `grossPrice` al als NULL; deze component zou het tweede slot zijn waar er alsnog
// eentje binnen kan glippen, en dat slot bestaat dus niet.
//
// De tekst komt uit lib/prijstoestand.ts, niet uit dit bestand — dezelfde zin staat ook in
// de PDF en in de RSC-tests, en drie kopieën gaan gegarandeerd uiteenlopen.
//
// Server-component, geen client-JS, geen lucide-react — precedent price-list-expiry-notice
// (~regel 12 aldaar): de RSC-testbrug struikelt over de client-referentie van lucide.
import {
  isVervallen,
  vervalLabel,
  vervalMelding,
  type Prijstoestand,
  type PrijslijstStempel,
} from "@/lib/prijstoestand";
import { cn } from "@/lib/utils";

export function VervallenMarkering({
  toestand,
  stempel,
  brandName,
  variant,
  className,
}: {
  toestand: Prijstoestand;
  stempel: PrijslijstStempel;
  brandName?: string | null;
  /**
   * `badge` — alleen het korte label, voor een kaart of regel waar geen zin bij past.
   * `inline` — label plus de volledige melding, voor een detailscherm of een offerteregel.
   */
  variant: "badge" | "inline";
  className?: string;
}) {
  // 'actueel' rendert niets. Dat is bewust géén taak van de aanroeper: zo kan een scherm de
  // component onvoorwaardelijk plaatsen en klopt het geval "product is gewoon in orde"
  // vanzelf, ook op een scherm dat later wordt toegevoegd.
  if (!isVervallen(toestand)) return null;
  const label = vervalLabel(toestand);
  const melding = vervalMelding(toestand, stempel, brandName);

  if (variant === "badge") {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center rounded-md bg-status-red-tint px-1.5 py-0.5 text-xs font-medium text-status-red-ink",
          className,
        )}
        // De melding hangt óók aan de badge: op een smalle kaart is dit het enige plekje
        // waar "welke prijslijst was de laatste" nog past.
        title={melding ?? undefined}
      >
        {label}
      </span>
    );
  }

  return (
    <p
      role="note"
      className={cn(
        "rounded-md bg-status-red-tint px-2 py-1 text-xs text-status-red-ink",
        className,
      )}
    >
      <span className="font-medium">{label}</span>
      {melding ? <> — {melding}</> : null}
    </p>
  );
}
