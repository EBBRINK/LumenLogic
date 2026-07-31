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
// De volgende status-/prijsregel hoort hier ook — denk aan het verlopen van een
// dagprijs (manual_price_valid_until), dat nu nog nergens wordt gelezen. Zet zo'n regel
// in `unitPriceOf`, niet in een aanroeper: dán blijft "welke prijs telt" één antwoord.

// Alleen de twee velden die de regel nodig heeft. Zo smal dat álle drie de rijvormen
// (de getSpecLines-projectie en wat daarvan afgeleid is) er structureel aan voldoen.
export type PricedLine = {
  manualPrice: string | null;
  matchedPrice: string | null;
};

// Waar de gekozen prijs vandaan kwam. `null` = er is helemaal geen prijs.
export type PriceSource = "dagprijs" | "catalogus";

export type ChosenPrice = {
  unitPrice: string | null;
  source: PriceSource | null;
};

// De stukprijs van één regel + zijn herkomst. De herkomst is geen extraatje: de offerte
// hangt haar prijslijst-verwijzing eraan op (een dagprijsregel krijgt bewust géén
// prijslijst-herkomst), en dat mag geen tweede, losse kopie van dezelfde regel zijn.
export function unitPriceOf(line: PricedLine): ChosenPrice {
  if (line.manualPrice != null)
    return { unitPrice: line.manualPrice, source: "dagprijs" };
  if (line.matchedPrice != null)
    return { unitPrice: line.matchedPrice, source: "catalogus" };
  return { unitPrice: null, source: null };
}
