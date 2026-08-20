// De prijstoestand van een product — ijzeren regel 3, herschreven (19 aug 2026).
//
// De regel luidt sinds vandaag: "Verlopen prijslijst = product zichtbaar zonder prijs. Nooit
// een prijs tonen uit een verlopen lijst; altijd rood gemarkeerd, altijd met de melding welke
// prijslijst de laatst bekende was." Achtergrond in docs/probleem-vervallen-producten.md.
//
// Dit bestand is de LEESKANT van die regel. De poort zelf zit in de view
// (db/migrations/0022): daar zijn gross_price, currency, price_list_id en valid_until NULL
// zodra de toestand niet 'actueel' is. Hier staat alleen wat je een mens vertelt.
//
// WAAROM DE TWEE VERVAL-TOESTANDEN UIT ELKAAR BLIJVEN. Op het scherm zien ze er hetzelfde
// uit — rood, geen bedrag — maar het antwoord op "en nu?" is tegengesteld. Bij een verlopen
// prijslijst bel je het merk om een verlenging (het product is waarschijnlijk gewoon
// leverbaar; het is ónze data die achterloopt). Bij een product dat uit de nieuwe lijst is
// gevallen zoek je een vervanger. Eén gedeelde melding zou dat verschil wegpoetsen, en
// precies dat verschil is waar de bestekschrijver op vastloopt.
//
// Geen React, geen database: puur, zodat de tekst in de RSC-tests, de PDF en de zoekkaart
// dezelfde is en niet op drie plekken uit elkaar kan lopen.

/** De drie toestanden uit `visible_products.price_state`. Gesloten — er is geen vierde. */
export type Prijstoestand =
  /** Prijsregel in een lopende lijst. Het bedrag mag getoond worden. */
  | "actueel"
  /** Onze data loopt achter: de lijst van dit merk is verlopen. Bedrag = NULL. */
  | "prijslijst_verlopen"
  /** Het product zelf: het staat niet meer in de actuele lijst. Bedrag = NULL. */
  | "uit_prijslijst";

const TOESTANDEN: readonly string[] = [
  "actueel",
  "prijslijst_verlopen",
  "uit_prijslijst",
];

/**
 * Leest de kolom terug als gesloten unie. Onbekend of ontbrekend → "actueel"? Nee:
 * "uit_prijslijst". Dat is de veilige kant (ijzeren regel 4) — een rij waarvan we de
 * toestand niet kunnen lezen mag géén bedrag rechtvaardigen. In de praktijk gebeurt dit
 * alleen bij een leftJoin die geen rij vond, en dan is er ook geen prijs.
 */
export function leesPrijstoestand(waarde: string | null | undefined): Prijstoestand {
  return TOESTANDEN.includes(waarde ?? "")
    ? (waarde as Prijstoestand)
    : "uit_prijslijst";
}

/** Kort: is dit product vervallen? Eén vraag voor elk scherm dat alleen rood/niet-rood wil. */
export function isVervallen(toestand: Prijstoestand): boolean {
  return toestand !== "actueel";
}

export type PrijslijstStempel = {
  /** Naam van de laatst bekende prijslijst, zoals het merk hem aanleverde. */
  name: string | null;
  /** Einddatum van die lijst, ISO (yyyy-mm-dd). */
  validUntil: string | null;
};

/** dd-mm-jjjj, zoals price-list-expiry-notice.tsx het al doet. */
function fmtDatum(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}-${m}-${y}` : iso;
}

/**
 * De melding die naast een vervallen product staat. Engels, net als de rest van de
 * schermteksten. Geeft `null` voor 'actueel' — dan valt er niets te melden, en een
 * component kan op die null zijn hele blok overslaan.
 *
 * Noemt ALTIJD de laatst bekende lijst als we die hebben; dat was de expliciete wens uit de
 * demo ("gewoon dat het oud is, laatste prijslijst was die en die"). Ontbreekt de naam of de
 * datum, dan zakt de tekst terug naar de toestand alleen — nooit naar een verzonnen datum.
 */
export function vervalMelding(
  toestand: Prijstoestand,
  stempel: PrijslijstStempel,
  brandName?: string | null,
): string | null {
  if (toestand === "actueel") return null;
  const datum = fmtDatum(stempel.validUntil);

  if (toestand === "prijslijst_verlopen") {
    const wie = brandName?.trim() || "this brand";
    return datum
      ? `Price list of ${wie} expired on ${datum} — no current price.`
      : `Price list of ${wie} has expired — no current price.`;
  }

  // uit_prijslijst
  const lijst = stempel.name?.trim();
  if (datum && lijst) {
    return `No longer included in the price list of ${datum} (${lijst}) — no current price.`;
  }
  if (datum) return `No longer included in the price list of ${datum} — no current price.`;
  return `No longer included in the current price list — no current price.`;
}

/** Het korte rode label op een kaart of regel, waar geen ruimte is voor de hele zin. */
export function vervalLabel(toestand: Prijstoestand): string | null {
  switch (toestand) {
    case "actueel":
      return null;
    case "prijslijst_verlopen":
      return "Price list expired";
    case "uit_prijslijst":
      return "Discontinued";
  }
}
