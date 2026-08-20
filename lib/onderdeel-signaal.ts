// "Voert dit merk losse drivers en accessoires?" — het signaal achter de driver-waarschuwing.
//
// AANLEIDING. Brink heeft een project verkocht en daarbij de plastic kits vergeten. Bij het
// merk komt zoiets alsnog boven: "je hebt dit ook nodig en je hebt deze driver erbij nodig."
// In een prijslijst staat zo'n driver of honingraatfilter als LOSSE regel, zonder enige
// relatie tot het armatuur waar hij bij hoort. Die relatie bestaat nergens in onze data en
// ook niet in de bron — zie docs/probleem-vervallen-producten.md.
//
// WAT DIT DUS NIET IS. Geen koppeling armatuur → driver, geen gok over wélke driver. Een
// driver is niet op wattage te kiezen (er zijn verschillende types), dus automatisch kiezen
// is sowieso geen optie. Dit bestand levert één merk-breed feit: dit merk vóért losse
// onderdelen, dus vraag na of er iets bij hoort.
//
// WAAROM DE REGEX UIT verdenking.ts KOMT EN NIET UIT EEN NIEUWE LIJST. `ONDERDEEL_START` is
// verankerd aan het begin van de naam en is daarop gemeten: 453 producten die werkelijk een
// los onderdeel zijn, tegenover 3.700 valse positieven voor de niet-verankerde variant
// (gewone armaturen die netjes melden dat hun driver is meegeleverd). Een tweede woordenlijst
// hier zou onmiddellijk uit de pas gaan lopen met die meting. Eén bron.
//
// ⚠️ POSTGRES SPREEKT GEEN JAVASCRIPT-REGEX. In Postgres' ARE is `\b` géén woordgrens maar
// het backspace-teken (`\y` is de woordgrens). Eén letterlijke `regex.source` in een `~*`
// zou dus stilzwijgend iets anders matchen dan de TypeScript-kant. Vandaar de vertaling
// hieronder én de test die beide kanten op dezelfde namenlijst naast elkaar legt.
import { ONDERDEEL_START } from "@/lib/enrichment/verdenking";

/**
 * Een merk telt als "voert losse onderdelen" vanaf dit aantal treffers.
 *
 * Drie, niet één: een enkele treffer kan een parse-artefact zijn (een armatuurnaam die
 * toevallig met "TRANS…" begint), en daar wil je geen waarschuwing aan ophangen. De merken
 * die er in de meting van 30 jul werkelijk uitspringen liggen er ruim boven — Wever & Ducré
 * 197, Flos Architectural 110, Lombardo 82, TossB 38, Marset 21.
 */
export const ONDERDEEL_DREMPEL = 3;

/** Is dít product zelf een los onderdeel? Dan is de vraag "hoort hier een driver bij?" al beantwoord. */
export function isLosOnderdeel(naam: string | null | undefined): boolean {
  return ONDERDEEL_START.test(naam ?? "");
}

/**
 * Dezelfde uitdrukking, in de vorm die Postgres' `~*` begrijpt. Afgeleid van de ene bron,
 * niet naast de bron geschreven — lib/onderdeel-signaal.test.ts bewijst dat beide kanten op
 * dezelfde namen hetzelfde antwoord geven.
 */
export function onderdeelPatroonSql(): string {
  return ONDERDEEL_START.source.replaceAll("\\b", "\\y");
}
