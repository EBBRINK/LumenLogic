// CLI om productnamen deterministisch te parsen (fase 2 van /prijslijst).
//
// Gebruik:
//   bun run scripts/parse-namen.ts namen.ndjson > parsed.ndjson
//
// Invoer:  NDJSON, één object per regel, met minimaal { "naam": "..." }.
//          Overige velden (bv. "nr") reizen ongewijzigd mee naar de uitvoer.
// Uitvoer: NDJSON met daarnaast { "parsed": {veld: waarde, ...}, "verdenkingen": [...] }.
//          Een veld ontbreekt in `parsed` als de naam het niet aantoonbaar draagt —
//          ontbrekend ≠ fout; de parser gokt bewust nooit.
//
// Verdenkingen met een soort uit ONDERDRUKKENDE_VERDENKINGEN (bv. buiten-bereik,
// product-is-onderdeel, tunable-white-bereik) betekenen: dit voorstel NIET overnemen.
// Zet zulke rijen op het tabblad "controleren" in plaats van in de datakolom.
//
// NIET-onderdrukkende soorten zijn er ook, en die betekenen iets anders: de waarde is bruikbaar
// én de rij hoort óók op "controleren". Dat zijn `accessoire-context`, `meerdere-protocollen`
// en `onderdeel-in-naam` — die laatste omdat onderdelen hun eigen specs mogen dragen, ze moeten
// alleen zichtbaar zijn. Neem ze over in de datakolom, maar laat de rij niet onzichtbaar blijven.
//
// De parserversie gaat naar STDERR (niet naar stdout), zodat het rapport hem kan overnemen
// zonder dat de NDJSON-uitvoer vervuild raakt. Citeer dat label in het rapport in plaats van
// een versienummer uit je hoofd — de skill draagt een eigen kopie met eigen patches.
import { readFileSync } from "node:fs";
import { FIELDS, PARSERVERSIE, parseProductName } from "./parser";
import { verdenkingen } from "./verdenking";

// Kopie van lib/repo/enrichment.ts (ONDERDRUKKENDE_VERDENKINGEN, stand 9786dc5): soorten
// waarvan het project gemeten heeft dat het voorstel dan onbetrouwbaar is. Bereiken en
// tunable white worden nooit platgeslagen; een muntworp (meerdere-waarden) is geen meting.
const ONDERDRUKKENDE_VERDENKINGEN = new Set([
  "bereik",
  "tunable-white",
  "meerdere-waarden",
  "buiten-bereik",
  "kantelhoek",
  "afgekapt",
  "onbekende-klasse",
  "product-is-onderdeel",
  // Skill-lokaal erbij op 11 aug 2026: een wattage dat vastgeplakt aan een woord staat is
  // `Componi75W` (modelnaam) óf `F13W` (een echte T5-buis van 13 W) — dezelfde vorm, tegengestelde
  // betekenis. Dat is geen parseervraag maar een productvraag, en de skill schrijft voor dat je
  // die niet zelf beslecht: liever leeg dan een gok, dus de waarde gaat naar "controleren".
  "vastgeplakt-wattage",
  // Skill-lokaal erbij op 12 aug 2026: `44+15 W` / `4000+1100 lm` zijn twee lichtmotoren en het
  // totaal staat er niet. De parser gaf stil de tweede waarde af — een factor drie te laag.
  "deelwaarden",
  // Skill-lokaal erbij op 12 aug 2026: de graden van een koppelstuk of bocht (`L-joint 90°`,
  // `120°/90° connector`) zijn de hoek van dát stuk. Zeven merken draaiden die waarde met de
  // hand terug; aantoonbaar fout, dus weg in plaats van alleen zichtbaar.
  "geometriehoek",
]);

const pad = process.argv[2];
if (!pad) {
  console.error("gebruik: bun run scripts/parse-namen.ts <namen.ndjson>");
  process.exit(1);
}
console.error(`parserversie: ${PARSERVERSIE}`);

// Een stukke regel breekt de rest van het bestand NIET af. Zonder deze wacht stopte het script
// halverwege met een SyntaxError en bleef er een half `parsed.ndjson` achter — stil verlies, en
// dat is in dit werk de doodzonde. Nu gaat de rij naar stderr met zijn regelnummer en loopt de
// run door; aan het eind staat het totaal, zodat een telling nooit ongemerkt te laag uitvalt.
let regelnr = 0;
let overgeslagen = 0;
for (const regel of readFileSync(pad, "utf8").split("\n")) {
  regelnr++;
  if (!regel.trim()) continue;
  let rij: Record<string, unknown> & { naam: string };
  try {
    rij = JSON.parse(regel) as Record<string, unknown> & { naam: string };
  } catch {
    overgeslagen++;
    console.error(`regel ${regelnr}: geen geldige JSON, overgeslagen — ${regel.slice(0, 80)}`);
    continue;
  }
  if (typeof rij.naam !== "string") {
    overgeslagen++;
    console.error(`regel ${regelnr}: geen veld "naam", overgeslagen`);
    continue;
  }
  const specs = parseProductName(rij.naam);
  const vlaggen = verdenkingen(rij.naam, specs);

  const parsed: Record<string, unknown> = {};
  for (const veld of FIELDS) {
    const v = specs[veld];
    if (v === undefined) continue;
    // Een onderdrukkende verdenking op dit veld = niet afgeven, alleen melden.
    const blok = vlaggen.find(
      (x) => x.veld === veld && ONDERDRUKKENDE_VERDENKINGEN.has(x.soort),
    );
    if (blok) continue;
    parsed[veld] = v;
  }
  console.log(
    JSON.stringify({
      ...rij,
      parsed,
      verdenkingen: vlaggen.map((x) => `${x.veld}:${x.soort}`),
    }),
  );
}

if (overgeslagen > 0) {
  console.error(`LET OP: ${overgeslagen} regel(s) overgeslagen — meld dit aantal in het rapport.`);
}
