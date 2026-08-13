// Gecureerde toewijzing rauwe leverancierskolom → matchveld. GEEN afgeleide, GEEN fuzzy match
// op kolomnaam: dit is een handmatig ingevulde tabel, en dat is precies waarom elke ingang een
// `beschrijft`-oordeel én een `bewijs`-regel draagt. Zelfde vorm en zelfde reden als
// lib/enrichment/optic-code.ts.
//
// ── Waarom fuzzy matchen op kolomnaam verboden is ────────────────────────────
// Serien heeft twee kolommen die met "Schutz" beginnen: `Schutzart` is de IP-klasse (IP20/40/
// 30/44) en `Schutzklasse` is de elektrische veiligheidsklasse (I/II). Ze staan naast elkaar,
// posities 5 en 6. Een naam-heuristiek die "Schutz" ziet en `ip_value` vult, schrijft "I" in de
// IP-kolom — en omdat `parseIp` met /(\d{2})/ het eerste tweetal uit een string plukt
// (lib/matching/tolerances.ts:62) zou dat niet luid falen maar stil onzin opleveren.
// Een kolom die niet in deze tabel staat, levert nul voorstellen. Dat is de poort.
//
// ── Wat 'beschrijft' beslecht (val 2) ────────────────────────────────────────
// Alleen `beschrijft: "armatuur"` levert een voorstel. Muuto's kolommen heten letterlijk
// `BULB SPECIFICATION - KELVIN/WATT/LUMEN` (nagekeken in de bron): 100 % gevuld, maar over de
// aanbevolen LAMP. Die staan hieronder mét oordeel en zonder doelveld — want een kolom die
// ontbreekt is niet te onderscheiden van een kolom die we vergeten zijn.
//
// Alle bewijs-regels zijn gemeten op Supabase `uvmeytxejlzvdgjgthmr` (read-only, 30 jul 2026):
// `brink_serien_raw` heeft 1.956 rijen waarvan 1.955 op `supplier_article_code` koppelen aan de
// 1.955 Serien-producten in de catalogus — 0 catalogusrijen zonder bron, 1 bronrij zonder
// catalogus.

import { FIELDS } from "./parser";
import type { NormalisatorNaam } from "./supplier-cell";

// Eigen herkomst-label, per kolom samengesteld: `supplier-column:CCT K`. Zo is per gevuld veld
// permanent herleidbaar úit welke kolom het komt. `enrichment_items.source` is text en
// `products.tier2_source` is jsonb (db/schema.ts:849, :296), dus dit vergt geen migratie.
//
// NB — bewust buiten UNCONFIRMED_TIER2_SOURCES (lib/matching/engine.ts:197). Een
// leverancierskolom is de eigen opgave van de fabrikant, net als de productnaam; alleen onze
// eigen gok (`optic-code`) hoort daar in. Zet je dit label er wél in, dan kan geen enkele
// Serien-regel groen worden en is de hele overzet zinloos.
export const SUPPLIER_SOURCE_PREFIX = "supplier-column";

export function sourceLabel(kolom: string): string {
  return `${SUPPLIER_SOURCE_PREFIX}:${kolom}`;
}

export type Beschrijft =
  | "armatuur" // eigenschap van het armatuur zelf → mag een matchveld vullen
  | "lichtbron" // eigenschap van een (aanbevolen of verwisselbare) lamp → nooit een matchveld
  | "elektrische-klasse" // veiligheidsklasse, geen matchveld in ons schema
  | "commercieel" // prijs/verpakking/logistiek — buiten de matcher
  | "onbekend"; // gezien, niet begrepen → nooit een voorstel

// Doelvelden buiten de zeven matchvelden die de publiceerroute wél kent (APPLY_FIELDS in
// lib/repo/enrichment.ts). De matcher en de naam-parser blijven er blind voor; alleen
// publishRun kan ze vullen.
export const EXTRA_DOELVELDEN = ["countryOfOrigin"] as const;

export type KolomToewijzing = {
  merk: string;
  kolom: string;
  veld: (typeof FIELDS)[number] | (typeof EXTRA_DOELVELDEN)[number] | null;
  beschrijft: Beschrijft;
  normalisator: NormalisatorNaam | null;
  // Alleen voorstellen waar `Leuchtmittel` een geïntegreerde LED aanwijst. Zie het bewijs per
  // kolom: waar het armatuur een verwisselbare fitting heeft, is de waarde die van de lamp.
  alleenGeintegreerdeLed: boolean;
  bewijs: string;
};

export const SUPPLIER_COLUMNS: KolomToewijzing[] = [
  // ── Serien Lighting ────────────────────────────────────────────────────────
  {
    merk: "Serien Lighting",
    kolom: "Schutzart",
    veld: "ipValue",
    beschrijft: "armatuur",
    normalisator: "ip",
    alleenGeintegreerdeLed: false,
    bewijs:
      "IP20 (1.439) · IP40 (240) · IP30 (159) · IP44 (48) · null (70); NUL plaatshouders. " +
      "Gevuld over alle drie de lichtbron-groepen — 1.621/1.628 bij geïntegreerde LED, " +
      "159/214 zonder opgave, 106/114 bij verwisselbare fitting. Dat de kolom óók gevuld is " +
      "waar er géén LED in zit, is het bewijs dat hij de behuizing beschrijft en niet de lamp. " +
      "96,4 % gevuld: de schoonste kolom van de tabel, en stap-1 zonder normalisatie.",
  },
  {
    merk: "Serien Lighting",
    kolom: "CCT K",
    veld: "kelvin",
    beschrijft: "armatuur",
    normalisator: "kelvin",
    alleenGeintegreerdeLed: true,
    bewijs:
      "Kruistabel Leuchtmittel × CCT K is beslissend: ALLE 1.283 schone waarden (2700/3000/4000) " +
      "en ALLE 173 bereikvormen staan op een rij met Leuchtmittel = 'LED'. Van de 114 rijen met " +
      "een verwisselbare fitting (G4/G9/E27/GU10/R7S/B15D/E14) heeft er 0 een schone CCT-waarde. " +
      "Serien laat de kolom dus leeg zodra de kleurtemperatuur niet van hún LED is — precies " +
      "omgekeerd aan de Muuto-val. Daarom is deze kolom een armatuureigenschap, mét de " +
      "LED-restrictie als expliciete voorwaarde.",
  },
  {
    merk: "Serien Lighting",
    kolom: "Systemleistung W",
    veld: "maxWattage",
    beschrijft: "armatuur",
    normalisator: "watt",
    alleenGeintegreerdeLed: true,
    bewijs:
      "'Systemleistung' is het opgenomen vermogen van het hele armatuur inclusief driver, niet " +
      "van een losse lamp. 30 distincte waarden, ALLE kale getallen, nul plaatshouders. " +
      "LED-restrictie is hier gemeten nodig: 22 van de 114 rijen met een verwisselbare fitting " +
      "dragen tóch een waarde, en dat is dan het lampvermogen — 1.400 van de 1.422 gevulde " +
      "cellen zit op een LED-rij, die 22 zijn de val-2-restpost en zwijgen.",
  },
  {
    merk: "Serien Lighting",
    kolom: "CRI Ra",
    veld: "cri",
    beschrijft: "armatuur",
    normalisator: "cri",
    alleenGeintegreerdeLed: true,
    bewijs:
      "GEEN ENKELE schone waarde: alle 1.464 bruikbare cellen dragen een ondergrens-operator " +
      "(>97 ×564, >90 ×455, >95 ×230, '> 95' ×120, >80 ×48, '> 90' ×47), plus '-' ×316 en " +
      "null ×176. Een stap-1-run (alleen schone enkelwaarden) levert op deze kolom dus exact " +
      "NUL voorstellen — hij hoort per definitie in stap 2. LED-restrictie: 1.460 van de 1.464 " +
      "operatorcellen zit op een LED-rij, 4 op een verwisselbare fitting en die zwijgen.",
  },
  {
    merk: "Serien Lighting",
    kolom: "Regelung",
    veld: "dimmable",
    beschrijft: "armatuur",
    normalisator: "dimprotocol",
    alleenGeintegreerdeLed: false,
    bewijs:
      "Dimregeling zit in de driver, dus een armatuureigenschap — en gemeten gevuld op 114/114 " +
      "rijen met een verwisselbare fitting, wat die lezing steunt. Partitie over de 1.955 " +
      "gekoppelde producten: 1.264 met dimprotocol (DALI/TRIAC/CASAMBI/0-10V, ook samengesteld), " +
      "132 die niet-dimbaar zeggen (ON/OFF), 118 zonder dimgegeven (SENSORIK/INTEGR.), 441 " +
      "plaatshouder of null. Let op de EN-STREEP in 'TRIAC + 0–10 V' (20×).",
  },
  // Gezien en afgewezen — deze regels bestaan zodat een vergeten kolom te onderscheiden is van
  // een beoordeelde kolom.
  {
    merk: "Serien Lighting",
    kolom: "Schutzklasse",
    veld: null,
    beschrijft: "elektrische-klasse",
    normalisator: null,
    bewijs:
      "I (1.784) · II (46) · '-' (48) · null (78). Dit is de elektrische veiligheidsklasse, " +
      "GEEN IP-klasse — ons schema heeft er geen veld voor. Staat hier expliciet omdat hij " +
      "naast `Schutzart` ligt (posities 5 en 6) en een naam-heuristiek ze zou verwarren.",
    alleenGeintegreerdeLed: false,
  },
  {
    merk: "Serien Lighting",
    kolom: "Leuchtmittel",
    veld: null,
    beschrijft: "lichtbron",
    normalisator: null,
    bewijs:
      "LED (1.628) · '-' (187) · fittingen G4/G9/E27/GU10/R7S/B15D/E14, ook als aantal " +
      "('15 × G4'). Beschrijft de lichtbron, niet het armatuur. Wordt NIET overgezet, maar is " +
      "wél de voorwaarde-kolom voor `alleenGeintegreerdeLed` op CCT K, Systemleistung en CRI Ra. " +
      "Ons schema heeft hiervoor `lightSource`/`lampFoot` (db/schema.ts:282, :321) — een aparte " +
      "klus, niet deze.",
    alleenGeintegreerdeLed: false,
  },
  {
    merk: "Serien Lighting",
    kolom: "EEK",
    veld: null,
    beschrijft: "onbekend",
    normalisator: null,
    bewijs:
      "Energie-efficiëntieklasse. Geen matchveld; hoort eerder bij de duurzaamheidsvelden " +
      "(db/schema.ts, warrantyMonths e.o.) en is niet beoordeeld voor deze overzet.",
    alleenGeintegreerdeLed: false,
  },

  // ── Northern — de schoonste ingang van de tabel, en de eerste die echt draait ─
  {
    merk: "Northern",
    kolom: "IP code",
    veld: "ipValue",
    beschrijft: "armatuur",
    normalisator: "ip",
    alleenGeintegreerdeLed: false,
    bewijs:
      "Gemeten op de export brink_northern_raw.ndjson (838 rijen, sha256 7a909c02…, 4 aug 2026). " +
      "Over ALLE 838 rijen bestaan er precies twee niet-lege celvormen: 'IP20' (271×) en " +
      "'IP44' (21×) — nul plaatshouders, nul bereiken, nul spellingsvarianten, geen spaties of " +
      "kleinletters. klasseerIp zet er dus niets om (genormaliseerd=false op alle 282). " +
      "De kolom hangt aan het blad, niet aan de omschrijving: source_sheet Lighting draagt " +
      "282 van de 309 IP-codes, Furniture (346) en Accessories (111) nul, Spare parts 10 op 72. " +
      "Die 10 onderdelen matchen aantoonbaar GEEN enkel catalogusproduct (gemeten: 309/309 " +
      "catalogusmatches liggen alle op blad Lighting), dus het onderdelenrisico is hier nul en " +
      "een rijfilter is niet nodig. Kruiscontrole uit het zwerm-onderzoek: IP44 komt voor bij " +
      "zowel E27 als geïntegreerde LED, dus de waarde varieert per armatuur en niet per fitting " +
      "— het is de behuizingsklasse. Northern heeft geen Schutzklasse-achtige buurkolom.",
  },
  // De overige Northern-kolommen, gemeten op dezelfde export (838 rijen, sha256 7a909c02…,
  // 11 aug 2026). De kruistabel met `fitting` is per kolom het beslissende bewijs: Northern
  // vult de meeste cellen óók bij verwisselbare fittingen, en dan beschrijft de cel de LAMP
  // (of de maximale fittingbelasting), niet het armatuur.
  {
    merk: "Northern",
    kolom: "watt",
    veld: "maxWattage",
    beschrijft: "armatuur",
    normalisator: "watt",
    alleenGeintegreerdeLed: true,
    bewijs:
      "298 gevuld (290 op blad Lighting), 14 vormen — alle '<n>W', één keer met spatie '8 W' " +
      "(4×), één samengestelde cel '7W base E27/5.5W E14 horns' (1×, zwijgt als onbekend). " +
      "De LED-restrictie is hier gemeten NOODZAKELIJK: de kruistabel fitting × watt toont " +
      "'E27 | 100W' (34×) en 'null | 100W' (7×) — dat is de maximale fittingbelasting van een " +
      "hanglamp, geen opgenomen vermogen. Op de 67 Integrated-LED-rijen loopt watt 3–21W en is " +
      "het wél het armatuurvermogen. Zelfde besluit als Serien's Systemleistung.",
  },
  {
    merk: "Northern",
    kolom: "kelvin",
    veld: "kelvin",
    beschrijft: "armatuur",
    normalisator: "kelvin",
    alleenGeintegreerdeLed: true,
    bewijs:
      "61 gevuld, twee vormen: '2700k' (52×) en '2700' (9×) — één kleurtemperatuur in het " +
      "hele merk. Kruistabel: ALLE 61 cellen liggen op een rij met fitting 'Integrated LED', " +
      "nul op een verwisselbare fitting — Northern laat de kolom leeg zodra de kelvin niet van " +
      "hún LED is, hetzelfde patroon als Serien's CCT K. De restrictie is dus gratis (filtert " +
      "vandaag 0 rijen) en staat er als slot voor een toekomstige export die dat patroon breekt.",
  },
  {
    merk: "Northern",
    kolom: "lumen",
    veld: "lumenOutput",
    beschrijft: "armatuur",
    normalisator: "lumen",
    alleenGeintegreerdeLed: true,
    bewijs:
      "91 gevuld, 11 vormen: '<n> lm' (78×) en kaal '<n>' (13×), bereik 200–2635. De " +
      "LED-restrictie is gemeten NOODZAKELIJK: 36 van de 91 cellen liggen op een G9-rij — daar " +
      "is de lumen die van de (mee)geleverde G9-lamp, niet van het armatuur. De 55 op " +
      "Integrated LED zijn de armatuuropbrengst en mogen door.",
  },
  {
    merk: "Northern",
    kolom: "dimbaar",
    veld: "dimmable",
    beschrijft: "armatuur",
    normalisator: "dimbaarJaNee",
    alleenGeintegreerdeLed: true,
    bewijs:
      "297 gevuld, exact twee vormen: 'Yes' (240×) en 'No' (57×) — geen protocol. 'Yes' wordt " +
      "'DIM' (de bestaande generieke waarde, 901× in productie via de naam-parser); 'No' " +
      "zwijgt als plaatshouder, zelfde besluit als Serien's ON/OFF. LED-restrictie omdat " +
      "dimbaar bij een E27/G9/GU10-armatuur (216 van de 283 Lighting-cellen) van de LAMP " +
      "afhangt die de klant erin draait; alleen bij de 67 Integrated-LED-rijen is het een " +
      "eigenschap van het armatuur zelf.",
  },
  {
    merk: "Northern",
    kolom: "herkomst",
    veld: "countryOfOrigin",
    beschrijft: "armatuur",
    normalisator: "landcode",
    alleenGeintegreerdeLed: false,
    bewijs:
      "838/838 gevuld, negen vormen, alle ISO-3166 alpha-2: CN 409 · LV 228 · LT 72 · IT 42 · " +
      "EE 23 · PL 21 · SE 19 · IN 19 · NO 5. Op blad Lighting: CN 283 · IT 14 · SE 6 · NO 5 · " +
      "PL 1 = 309/309. Geen matchveld — products.country_of_origin (db/schema.ts:298) is een " +
      "productfeit; daarom via EXTRA_DOELVELDEN alleen aan de publiceerroute bekend.",
  },
  // Gezien en afgewezen:
  {
    merk: "Northern",
    kolom: "garantie",
    veld: null,
    beschrijft: "commercieel",
    normalisator: null,
    alleenGeintegreerdeLed: false,
    bewijs:
      "807 gevuld, ÉÉN vorm: '1 Yr. Production guarantee'. Naar warranty_months (integer) zou " +
      "een tekstparse vergen ('1 Yr.' → 12) en warranty_months zit niet in APPLY_FIELDS — de " +
      "publiceerroute kent hem niet. Bovendien is één identieke waarde voor het hele merk eerder " +
      "een merkvoorwaarde dan een productveld. Niet overzetbaar via deze route; aparte klus als " +
      "Timo hem wil.",
  },
  {
    merk: "Northern",
    kolom: "cat",
    veld: null,
    beschrijft: "commercieel",
    normalisator: null,
    alleenGeintegreerdeLed: false,
    bewijs:
      "Categorielabel van het verkoopblad (Lighting/Furniture/…-indeling), geen armatuurspec.",
  },
  {
    merk: "Northern",
    kolom: "fitting",
    veld: null,
    beschrijft: "lichtbron",
    normalisator: null,
    alleenGeintegreerdeLed: false,
    bewijs:
      "E27 (144×) · Integrated LED (67×) · G9 (37×) · GU10 (27×) · null (26×) · E14 (7×) · " +
      "'E27, E14' (1×) op blad Lighting. Beschrijft de lichtbron; wordt NIET overgezet maar is " +
      "wél de voorwaarde-kolom voor alleenGeintegreerdeLed op watt/kelvin/lumen/dimbaar — " +
      "zelfde rol als Serien's Leuchtmittel. Ons schema heeft hiervoor lightSource/lampFoot; " +
      "aparte klus.",
  },

  // ── Muuto — de tegenhanger, letterlijk nagekeken in de bron ────────────────
  // 100 % gevuld en over het verkeerde ding. Deze drie regels zijn de vastlegging van val 2.
  {
    merk: "Muuto",
    kolom: "BULB SPECIFICATION - KELVIN",
    veld: null,
    beschrijft: "lichtbron",
    normalisator: null,
    bewijs:
      "Kolomnaam zegt het zelf: de specificatie van de LAMP, niet van het armatuur. De tabel " +
      "heeft ook `BULB INCLUDED`, `CHANGEABLE BULB` en `BULB RECCOMENDADTION - LAMP BASE` " +
      "(sic) — het is een lamp-aanbeveling. Nooit naar products.kelvin.",
    alleenGeintegreerdeLed: false,
  },
  {
    merk: "Muuto",
    kolom: "BULB SPECIFICATION - WATT",
    veld: null,
    beschrijft: "lichtbron",
    normalisator: null,
    bewijs: "Zie `BULB SPECIFICATION - KELVIN`: vermogen van de aanbevolen lamp.",
    alleenGeintegreerdeLed: false,
  },
  {
    merk: "Muuto",
    kolom: "BULB SPECIFICATION - LUMEN",
    veld: null,
    beschrijft: "lichtbron",
    normalisator: null,
    bewijs: "Zie `BULB SPECIFICATION - KELVIN`: lichtstroom van de aanbevolen lamp.",
    alleenGeintegreerdeLed: false,
  },
];

// De ingangen die daadwerkelijk een voorstel mogen opleveren, voor één merk. Fail-closed: een
// kolom die niet in de tabel staat, komt hier nooit uit.
export function overzetbareKolommen(merk: string): KolomToewijzing[] {
  return SUPPLIER_COLUMNS.filter(
    (k) => k.merk === merk && k.beschrijft === "armatuur" && k.veld !== null,
  );
}

// Alles wat we van dit merk gezien hebben, inclusief het afgewezene — voor het runrapport, zodat
// de uitdraai laat zien welke kolommen beoordeeld zijn en met welk oordeel.
export function beoordeeldeKolommen(merk: string): KolomToewijzing[] {
  return SUPPLIER_COLUMNS.filter((k) => k.merk === merk);
}
