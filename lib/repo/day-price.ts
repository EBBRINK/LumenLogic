// I-04, DE DAGPRIJSREGEL: een dagprijs op de regel (manual_price) wint van de
// catalogusprijs (de bruto adviesprijs van het gematchte product). Eén functie, drie
// aanroepers — de estimate (lib/repo/estimate.ts), de XIS-export (lib/repo/xis.ts) en
// de gegenereerde offerte (generateQuote in lib/repo/dossiers.ts).
//
// Waarom het hier staat en niet drie keer los (reviewzwerm A8): de regel stond als
// `manualPrice ?? matchedPrice` op drie plekken, en twee daarvan werden door géén
// enkele fixture getoetst — elke fixture zette de dagprijs op een regel ZONDER match,
// dus de `??` hoefde nooit tussen twee gevulde waarden te kiezen. Draai je de volgorde
// om (een refactor, een merge, een sessie die "opruimt"), dan gaat de verouderde
// catalogusprijs het klantstuk én het projecttotaal in en wordt geen enkele test rood.
// Nu is er één plek waar dat gekozen wordt, en drie tests die de omkering betrappen.
//
// Deze module is bewust PUUR en importeert niets: hij zit onder estimate.ts én
// dossiers.ts, en een import van (of naar) een van beide maakt er een cyclus van.
//
// DE VERVALREGEL (reviewzwerm A7). `manual_price_valid_until` werd door niets gelezen:
// een dagprijs van €199 die op 30 juni afliep stond in september nog steeds als hét
// bedrag op het scherm, op de PDF én in de XIS-export. Dat is de spiegel van ijzeren
// regel 3 (verlopen prijslijst = product onzichtbaar, centraal afgedwongen), maar dan
// voor de andere soort prijs — en daar gebeurde niets.
//
// Het besluit, hier uitgevoerd omdat dit de enige plek is waar "welke prijs telt"
// beantwoord wordt:
//
//   Een VERLOPEN dagprijs valt terug op de catalogusprijs, en de regel wordt gemarkeerd.
//
// Waarom terugvallen en niet leegmaken: een verlopen prijs mag niet als gezaghebbend
// bedrag op een klantstuk staan, maar de catalogusprijs is per constructie wél actueel
// (hij komt via `visible_products`, dat op `valid_until >= CURRENT_DATE` filtert). Terug-
// vallen houdt de estimate dus compleet in plaats van er een gat in te slaan. En het is
// nooit stilzwijgend: `dayPriceExpiredOn` draagt de vervaldatum mee, zodat scherm en PDF
// erbij kunnen zetten dát de dagprijs verlopen is en wát er nu gebruikt wordt. Is er geen
// catalogusprijs, dan heeft de regel gewoon géén prijs (regeltotaal "—") en legt het
// merkteken uit waarom — een eerlijk gat, nooit een verouderd getal.
//
// GRENS: `valid_until` is INCLUSIEF, exact als de prijslijstregel (`valid_until >=
// CURRENT_DATE`). Een dagprijs die tot vandaag geldig is, is vandaag nog geldig.
// `manualPriceValidUntil = null` = geen vervaldatum — de bestaande semantiek van
// setDayPrice, en die verandert niet.

// Alleen de velden die de regel nodig heeft. Zo smal dat álle rijvormen (de
// getSpecLines-projectie en wat daarvan afgeleid is) er structureel aan voldoen.
// `manualPriceValidUntil` staat er BEWUST als verplicht veld in: laat een toekomstige
// projectie de kolom weg, dan weigert de compiler — in plaats van dat de vervalregel
// stilzwijgend weer uitvalt, wat precies is wat A7 was.
export type PricedLine = {
  manualPrice: string | null;
  matchedPrice: string | null;
  manualPriceValidUntil: string | null; // 'YYYY-MM-DD' of null (= nooit verlopen)
};

// Waar de gekozen prijs vandaan kwam. `null` = er is helemaal geen prijs.
export type PriceSource = "dagprijs" | "catalogus";

export type ChosenPrice = {
  unitPrice: string | null;
  source: PriceSource | null;
  // Was er een dagprijs die verlopen is? Dan staat hier de datum waarop hij verliep
  // ('YYYY-MM-DD'), óók als er geen catalogusprijs was om op terug te vallen. `null` =
  // geen verlopen dagprijs (dus ook bij een regel zónder dagprijs).
  dayPriceExpiredOn: string | null;
};

// Vandaag als 'YYYY-MM-DD' in UTC — dezelfde conventie als `addDays` in
// lib/repo/dossiers.ts en als de `date`-kolommen zelf, die geen tijdzone dragen.
//
// ER IS WÉL EEN TIJDZONE IN HET SPEL, en het is UTC. Op 1 juli 01:30 Nederlandse tijd
// (CEST = UTC+2) staat hier nog `2026-06-30`, dus een dagprijs die t/m 30 juni geldig
// was telt dan nog mee. Dat venster is 2 uur in de zomer (CEST) en 1 uur in de winter
// (CET), en het loopt altijd de kant op van "nog even geldig", nooit van "te vroeg
// verlopen". Dat is een BESLUIT, geen ongelukje: ijzeren regel 3 (`valid_until >=
// CURRENT_DATE`) draait in Postgres op een UTC-server en heeft exact hetzelfde venster,
// dus de dagprijs en de prijslijst kantelen op hetzelfde moment. Eén conventie voor
// beide prijssoorten is meer waard dan een paar nachtelijke uren nauwkeurigheid — wie
// het venster wil sluiten, verschuift beide regels tegelijk naar Europe/Amsterdam, niet
// deze alleen.
//
// LET OP (opgemerkt bij de A7-reparatie, bewust niet in deze commit opgelost): dit is de
// dérde UTC-vandaag-helper in de repo, naast `isoVandaag()` in lib/repo/price-archive.ts
// en `daysUntil()` in lib/repo/enrichment.ts. Samenvoegen raakt price-archive.ts, dat
// net door een andere workstream is gecommit — dus eerst die twee laten landen.
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// De stukprijs van één regel + zijn herkomst. De herkomst is geen extraatje: de offerte
// hangt haar prijslijst-verwijzing eraan op (een dagprijsregel krijgt bewust géén
// prijslijst-herkomst), en dat mag geen tweede, losse kopie van dezelfde regel zijn.
//
// `today` is injecteerbaar zodat tests deterministisch zijn; de default is de echte dag.
//
// ⚠️ ÉÉN KLOKLEZING PER OPERATIE. Roept een aanroeper deze functie meer dan één keer aan
// voor dezelfde operatie — generateQuote doet dat twee keer per regel, in de opnamefilter
// én bij het bouwen van de offerteregel — dan MOET hij zijn eigen `todayIso()` één keer
// lezen en die doorgeven. Twee defaults zijn twee klokken, en over de UTC-middernacht-
// grens kunnen die van mening verschillen: de filter zegt "geldig, neem hem mee", de
// bouwer een tel later "verlopen, geen prijs". Dat leverde `Number(null)` = 0 en dus een
// € 0,00-regel op het klantdocument op.
export function unitPriceOf(
  line: PricedLine,
  today: string = todayIso(),
): ChosenPrice {
  if (line.manualPrice != null) {
    // Stringvergelijking is voor 'YYYY-MM-DD' chronologisch (vaste breedte, van groot
    // naar klein geordend), dus `<` is hier letterlijk "ligt vóór". Geen Date-object
    // nodig. De tijdzone zit niet hier maar in `today`: die is UTC, met het venster dat
    // bij todayIso hierboven staat uitgeschreven.
    const expiredOn =
      line.manualPriceValidUntil != null && line.manualPriceValidUntil < today
        ? line.manualPriceValidUntil
        : null;
    if (expiredOn == null)
      return {
        unitPrice: line.manualPrice,
        source: "dagprijs",
        dayPriceExpiredOn: null,
      };
    // Verlopen → terugvallen op de catalogus, mét het merkteken. Ook als die er niet
    // is: dan geen prijs, en het merkteken legt uit waarom.
    return line.matchedPrice != null
      ? {
          unitPrice: line.matchedPrice,
          source: "catalogus",
          dayPriceExpiredOn: expiredOn,
        }
      : { unitPrice: null, source: null, dayPriceExpiredOn: expiredOn };
  }

  if (line.matchedPrice != null)
    return {
      unitPrice: line.matchedPrice,
      source: "catalogus",
      dayPriceExpiredOn: null,
    };
  return { unitPrice: null, source: null, dayPriceExpiredOn: null };
}
