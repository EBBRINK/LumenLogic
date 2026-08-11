// Deterministische rijsegment-verrijking voor de AI-tekstleesroute (gat B,
// live-check 20 jul, dossier ae0eead9).
//
// Probleem: het model kapt `ruwe_tekst` inconsistent af — de vier XAL-regels
// stopten vóór de spec-sectie ("...SASSO PRO 100 112x106mm (ØxH)" zonder de
// "IP20 / - LED 2810 lm ... 27 W ... 3000K CRI ≥ 90"-staart), waardoor
// parseProductName niets te parsen had en alle req_*-velden null bleven.
// Terwijl de server de VOLLEDIGE paginatekst gewoon heeft (LeesroutePagina.text
// / rawMarkdown), en parseProductName op het volledige rijsegment empirisch
// perfect parseert (Lr301 → 27W/3000K/CRI90/IP20/39°/2810lm/DALI, incl.
// komma-notatie "13,1 W").
//
// Oplossing: de door het MODEL geleverde armatuurcodes zijn de segmentatie-
// ankers (het model lost O2 op — codes zijn niet met een regex te vangen), en
// de deterministische kant snijdt daarmee het échte rijsegment uit de
// paginatekst en leest de specs dáár uit — geen verzin-risico, zelfde
// laagafspraak als masterplan-besluit 8 (LLM leest codes, de deterministische
// pipeline leest cijfers). De merge met wat het model wél leverde is gratis:
// parseProductName is eerste-match-wint per veld, dus het segment wordt
// ACHTERAAN de parse-input geplakt (regelToSpecLine) — modeltekst wint,
// segment vult alleen lege velden bij.
//
// Bewust géén nieuwe code-detectieregex (O2-vangrail): de detectie blijft bij
// het model; hier staat alleen een buurteken-toets op modelgeleverde codes.
//
// PUUR — geen imports behalve de parser, geen DB, geen I/O. Draait in de
// repo-laag (recordLeesrouteImport), het meetscript en het backfill-script.
import { parseProductName } from "@/lib/enrichment/parser";

// Telt hoeveel spec-velden een parse over deze tekst oplevert — de maat voor
// "welk voorkomen van een code is het tabelvoorkomen mét specs" (een kaal
// plattegrond-label parseert naar 0 velden).
function parseRijkdom(tekst: string): number {
  const specs = parseProductName(tekst);
  return Object.values(specs).filter((v) => v != null).length;
}

const ALNUM = /[a-z0-9]/i;

// Alle voorkomens van `code` in `tekst`, met buurteken-toets: het teken vóór
// het voorkomen mag geen letter/cijfer zijn (anders matchen we midden in een
// woord); het teken erná liefst óók niet, maar die rechtergrens is PREFERENT,
// niet verplicht — een gelijmde code ("L017of", unpdf-artefact) heeft alleen
// een linkergrens en moet tóch gevonden worden. Levert eerst de voorkomens
// mét beide grenzen, dan (alleen als die er niet zijn) de links-begrensde.
function vindVoorkomens(tekst: string, code: string): number[] {
  const strikt: number[] = [];
  const losRechts: number[] = [];
  let i = tekst.indexOf(code);
  while (i !== -1) {
    const voor = i === 0 ? "" : tekst[i - 1];
    const na = tekst[i + code.length] ?? "";
    if (!ALNUM.test(voor)) {
      if (!ALNUM.test(na)) strikt.push(i);
      else losRechts.push(i);
    }
    i = tekst.indexOf(code, i + 1);
  }
  return strikt.length ? strikt : losRechts;
}

// code → beste rijsegment uit de paginatekst. Ankers = álle voorkomens van
// álle door het model geleverde codes; een segment loopt van het voorkomen van
// de code tot het eerstvolgende anker (of het einde van de pagina). Bij
// meerdere voorkomens van dezelfde code wint het voorkomen waarvan het segment
// de RIJKSTE parse oplevert (het tabelvoorkomen met specs boven het kale
// plattegrond-label); tie → eerste voorkomen.
//
// Suffix-randgeval (Lr001 vs Lr001B): een positie waar een LANGERE ankercode
// uit dezelfde set op exact dezelfde index staat, telt niet als voorkomen van
// de kortere — anders zou Lr001 het Lr001B-segment aanzuigen.
//
// Gemiste tussencode → het segment loopt door in de volgende rij. Geaccepteerd
// en gedempt: het segment begint op de júiste code (eerste-match-wint pakt de
// juiste specs eerst), de modeltekst staat in de parse-input nog dáárvoor, en
// elke leesroute-regel draagt de verplichte B7-review. Zelfde opslok-gedrag
// als parseTocText altijd al had, alleen nu met AI-gevonden ankers.
//
// ⚠️ CODE VOORAAN OF ACHTERAAN — zie `codeStaatVooraan` hieronder. Alles in de
// alinea's hierboven gaat uit van een armaturenboek: de code opent de rij, dus
// "van de code tot het volgende anker" ís de rij. In een offerteaanvraag staat
// de code juist ACHTERAAN (kolommen omschrijving · artikelnummer · aantal) en
// dan levert diezelfde snede de staart van de eigen rij plus de omschrijving
// van de vólgende — met alle specs van een ander product erin.
//
// Gemeten (docs/probleem-artikelnummer-matching.md, meting 3): de Delta Light-
// driverregel kreeg zo `IP50` van een Trizo21-regel twee blokken lager en
// `2700K` van de regel erboven. Het segment luidde letterlijk:
//   "21012 0298 14\nTrizo21\nOmschrijving Artikelnummer Aantal\nWand opbouw
//    Trizo21 BOULO W in MATT Glass LED9W 2700K IP50 (voor betonnen wand) "
//
// Waarom niet simpelweg "een segment stopt bij een newline": gemeten over de
// vier echte armaturenboek-runs verliezen dan 108 van 108 segmenten ál hun
// specvelden. Die PDF's breken één rij over veel tekstregels (kolomlayout die
// bij extractie platvalt), dus een regelgrens is daar geen rijgrens. Bij een
// offerteaanvraag is hij dat wél. Vandaar de layout-toets in plaats van een
// vaste regel: staat de code vooraan, dan blijft alles byte-identiek aan
// vandaag.
export function vindRijSegmenten(
  paginaTekst: string,
  codes: string[],
): Map<string, string> {
  const unieke = [...new Set(codes.filter((c) => c.length > 0))];
  // Per code de geldige voorkomens (na de suffix-uitsluiting hieronder).
  const voorkomens = new Map<string, number[]>();
  for (const code of unieke) {
    voorkomens.set(code, vindVoorkomens(paginaTekst, code));
  }
  // Suffix-uitsluiting: index bezet door een langere code → weg bij de kortere.
  for (const code of unieke) {
    const langere = unieke.filter(
      (c) => c !== code && c.length > code.length && c.startsWith(code),
    );
    if (!langere.length) continue;
    const bezet = new Set(langere.flatMap((c) => voorkomens.get(c) ?? []));
    voorkomens.set(
      code,
      (voorkomens.get(code) ?? []).filter((i) => !bezet.has(i)),
    );
  }
  // Alle ankerposities (gesorteerd) voor de rechtergrens van elk segment.
  const ankers = [...voorkomens.values()].flat().sort((a, b) => a - b);
  const vooraan = codeStaatVooraan(paginaTekst, ankers);

  const segmenten = new Map<string, string>();
  for (const code of unieke) {
    const posities = voorkomens.get(code) ?? [];
    if (!posities.length) continue;
    let beste: { segment: string; rijkdom: number } | null = null;
    for (const pos of posities) {
      const segment = vooraan
        ? paginaTekst.slice(pos, ankers.find((a) => a > pos) ?? paginaTekst.length)
        : regelRond(paginaTekst, pos);
      const rijkdom = parseRijkdom(segment);
      if (!beste || rijkdom > beste.rijkdom) beste = { segment, rijkdom };
    }
    if (beste) segmenten.set(code, beste.segment);
  }
  return segmenten;
}

// Opent de code de rij, of sluit hij hem af? Beslist per pagina, over álle
// ankers samen — één code zegt niets, de layout van de pagina wel.
//
// "Vooraan" = tussen het begin van de tekstregel en het anker staat niets dan
// witruimte. Bij gelijk spel wint vooraan: dat is het gedrag van vandaag, en de
// bewijslast ligt bij de afwijking. Zonder ankers idem — dan valt er niets te
// snijden en verandert de uitkomst toch niet.
function codeStaatVooraan(tekst: string, ankers: number[]): boolean {
  if (ankers.length === 0) return true;
  let vooraan = 0;
  for (const pos of ankers) {
    const regelStart = tekst.lastIndexOf("\n", pos - 1) + 1;
    if (tekst.slice(regelStart, pos).trim().length === 0) vooraan++;
  }
  return vooraan * 2 >= ankers.length;
}

// De hele tekstregel waarop `pos` valt. In een code-achteraan-layout is één
// tekstregel precies één rij — dat is gemeten op de offerteaanvraag-fixture,
// waar alle 19 rijen elk op hun eigen regel staan. We nemen de HELE regel en
// niet alleen het stuk vóór de code: de omschrijving staat ervoor, maar een
// aanvraag mag er best iets achter zetten, en alles op deze regel hoort per
// definitie bij dit ene product.
function regelRond(tekst: string, pos: number): string {
  const start = tekst.lastIndexOf("\n", pos - 1) + 1;
  const eind = tekst.indexOf("\n", pos);
  return tekst.slice(start, eind === -1 ? tekst.length : eind);
}

// Dun hulpje voor de aanroepers (recordLeesrouteImport, meetscript, backfill):
// verrijk een lijst modelregels met het rijsegment van hun pagina. Structureel
// paginatype — geen import uit lib/ai (laagafspraak: dit is de deterministische
// kant).
export function verrijkRegelsMetSegment<
  T extends { armatuurcode: string; pagina: number },
>(
  regels: T[],
  paginas: Array<{ pageNumber: number; text: string }>,
): (T & { segmentTekst?: string })[] {
  const perPagina = new Map<number, T[]>();
  for (const r of regels) {
    perPagina.set(r.pagina, [...(perPagina.get(r.pagina) ?? []), r]);
  }
  const segmentPerRegel = new Map<T, string>();
  for (const [pagina, groep] of perPagina) {
    const tekst = paginas.find((p) => p.pageNumber === pagina)?.text;
    if (!tekst) continue;
    const segmenten = vindRijSegmenten(
      tekst,
      groep.map((r) => r.armatuurcode),
    );
    for (const r of groep) {
      const seg = segmenten.get(r.armatuurcode);
      if (seg) segmentPerRegel.set(r, seg);
    }
  }
  return regels.map((r) => {
    const seg = segmentPerRegel.get(r);
    return seg ? { ...r, segmentTekst: seg } : { ...r };
  });
}
