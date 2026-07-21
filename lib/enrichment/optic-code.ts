// Gecureerde optiekcode → stralingshoek (XAL). GEEN afgeleide, GEEN parser: dit is een
// handmatig ingevoerde vertaaltabel en dat is precies waarom hij een eigen herkomst-label
// (`optic-code`) draagt in plaats van mee te liften op 'parsed-from-name'. Wie later kijkt
// moet kunnen zien: deze graden stonden NIET in de naam, ze komen uit een tabel die een mens
// heeft ingevuld.
//
// ⚠️ STOPGAP. De waarden zijn XAL's optiekklassen zoals ze in de armaturenboeken staan, maar
// ze zijn niet door XAL bevestigd. Ze horen door het 1.2-retourpad langs het merk bevestigd te
// worden; tot die tijd is dit een werkbare benadering, geen waarheid. Dat is ook waarom
// verrijking alleen LEGE beam_angle-kolommen vult (`fieldIsEmpty` in lib/repo/enrichment.ts):
// echte data wint altijd van deze tabel.
//
// ⚠️ Gemeten tegenspraak (20 jul, read-only op de live catalogus): van de XAL-rijen die al een
// beam_angle dragen staan ME (48×) én SP (48×) allebei op exact 30,00° — díé data onderscheidt
// ME dus niet van SP en oogt als een generieke default. Onze tabel zegt ME 25 en SP 15. We
// overschrijven die 96 rijen NIET; de tegenspraak blijft staan tot het retourpad hem beslecht.
// FL (2078 rijen) en WF (1911 rijen) hebben geen enkele gevulde beam_angle — daar is geen
// tegenspraak, alleen een gat.

export const OPTIC_SOURCE = "optic-code";

// De tabel zelf. Sleutel = de optiekcode zoals XAL hem als los token in de productnaam zet.
export const OPTIC_BEAM_ANGLES: Record<string, number> = {
  FL: 39, // flood
  WF: 57, // wide flood
  ME: 25, // medium
  SP: 15, // spot
};

// Welke codes we DAADWERKELIJK voorstellen (besluit Timo, 20 jul). ME en SP staan bewust
// NIET in deze lijst: zij zijn de twee codes waar de catalogus al data voor heeft, en die data
// (48× ME op 30,00° en 48× SP op óók 30,00°) spreekt onze tabelwaarden tegen én onderscheidt
// ME niet van SP. Zolang het 1.2-retourpad die tegenspraak niet beslecht, zouden we ~3.938
// rijen een onbevestigde waarde geven die haaks staat op het enige echte signaal dat we hebben.
// FL en WF hebben nul gevulde rijen — daar is geen tegenspraak, alleen een gat, en zij zijn
// precies wat Lr301 (FL) en Lr303 (WF) uit elkaar houdt.
// ME/SP toevoegen = één regel, zodra XAL de hoeken bevestigt.
export const CONFIRMED_CODES = ["FL", "WF"] as const;

// Herkenning kijkt naar ÁLLE vier de codes, ook de niet-bevestigde: een naam met zowel FL als
// ME is dubbelzinnig en moet zwijgen, ongeacht welke code we zouden publiceren.
const CODES = Object.keys(OPTIC_BEAM_ANGLES);

// Welke optiekcodes staan als LOS token in deze naam? Woordgrens op letters, zodat "FL" niet
// matcht in "FLEX" of "REFLECTOR" — een substring-match zou hier stilzwijgend honderden rijen
// een verkeerde hoek geven. Cijfers en leestekens gelden als grens ("BO 32 1L SP CRI90").
export function opticCodesIn(name: string): string[] {
  if (!name) return [];
  return CODES.filter((c) =>
    new RegExp(`(^|[^A-Za-z])${c}([^A-Za-z]|$)`).test(name),
  );
}

// De stralingshoek voor deze naam, of undefined als er niets te zeggen valt.
// Conservatief zoals de rest van de verrijking (ontbrekend ≠ fout):
//   • geen code          → undefined
//   • MEER dan één code  → undefined; welke zou gelden? Gemeten staat dit vandaag op 0 producten
//     binnen XAL, maar de dag dat het wél voorkomt moet het zwijgen, niet gokken.
//   • een niet-bevestigde code (ME/SP) → undefined; de waarde staat wél in de tabel als
//     vastgelegde kennis, maar wordt niet voorgesteld tot het retourpad hem bevestigt.
export function opticBeamAngle(name: string): number | undefined {
  const found = opticCodesIn(name);
  if (found.length !== 1) return undefined;
  const code = found[0];
  return (CONFIRMED_CODES as readonly string[]).includes(code)
    ? OPTIC_BEAM_ANGLES[code]
    : undefined;
}
