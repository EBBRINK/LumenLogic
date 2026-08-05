// REGRESSIETEST OP HET INSTRUMENT — geen database nodig.
//
// De les bovenaan HANDOVER.md: na elke ingreep in het meetgereedschap één bekende meting
// herhalen en bevestigen dat de uitkomst onveranderd is. Dit bestand IS die meting. Elke regel
// hieronder is een geval dat op 30 juli 2026 gemeten en vastgelegd is; verandert er een, dan is
// er iets aan de parser of de verdenking veranderd zonder dat iemand dat bedoelde.
//
//   bun scripts/toets-instrument.ts
import { parseProductName } from "@/lib/enrichment/parser";
import { verdenkingen } from "@/lib/enrichment/verdenking";

type Geval = { naam: string; veld?: "maxWattage" | "kelvin" | "cri"; waarde?: unknown; verdenking?: string; waarom: string };

const GEVALLEN: Geval[] = [
  { naam: "SIRRO SPOT INSET 1.0 W max. 12W GU10", veld: "maxWattage", waarde: 12,
    waarom: "de typecode '1.0 W' is geen wattage; de span-regel neemt de volgende kandidaat" },
  { naam: "SIRRO SPOT INSET 1.1 B ROUND incl. driver 4W", veld: "maxWattage", waarde: undefined,
    waarom: "'incl. driver 4W' is het vermogen van de driver, niet van het armatuur" },
  { naam: "TIBO Wall indoor - 8W+4W LED 2700K - Dim Triac wall white", veld: "maxWattage", waarde: 8,
    waarom: "meerkanaals: de parser leest het eerste kanaal — bekende onderschatting, geen leesfout" },
  { naam: "STRIP 24V 44W/m 3000K", veld: "maxWattage", waarde: undefined,
    waarom: "vermogen per meter is geen armatuurvermogen" },
  { naam: "KAP 80 W-W RND GOLD DW LED ARRAY C95 13W", veld: "maxWattage", waarde: 13,
    waarom: "'80 W-W' is warm-white, geen 80 watt" },
  { naam: "Rocks IP65 2254W 41800lm", verdenking: "buiten-bereik",
    waarom: "boven 999 W bestaat in deze catalogus geen echt armatuur; het zwaarste is 850 W" },
  { naam: "Driver Delta 3 155 W On/Off", verdenking: "product-is-onderdeel",
    waarom: "het product IS de driver" },
  { naam: "DALI PUSH DIM NON DIM 3000K 10W", veld: "maxWattage", waarde: 10,
    waarom: "NON DIM mag de wattage-lezing niet raken" },
];

function toon(v: unknown) {
  return v === undefined || v === null ? "—" : String(v);
}

let fout = 0;
console.log("bekende meting — parser en verdenking\n");
for (const g of GEVALLEN) {
  const p = parseProductName(g.naam);
  const soorten = verdenkingen(g.naam, p).map((x) => x.soort);
  let goed = true;
  let gemeten = "";
  if (g.veld) {
    const w = (p as Record<string, unknown>)[g.veld];
    gemeten = `${g.veld}=${toon(w)}`;
    goed = g.waarde === undefined ? w == null : w === g.waarde;
  } else if (g.verdenking) {
    gemeten = `verdenkingen=[${soorten.join(",") || "geen"}]`;
    goed = soorten.includes(g.verdenking);
  }
  if (!goed) fout++;
  console.log(`${goed ? "✓" : "✗"} ${g.naam.slice(0, 58).padEnd(58)} ${gemeten}`);
  if (!goed) console.log(`     verwacht: ${g.veld ? `${g.veld}=${toon(g.waarde)}` : g.verdenking} — ${g.waarom}`);
}
console.log(
  fout === 0
    ? `\n✓ ${GEVALLEN.length}/${GEVALLEN.length} onveranderd`
    : `\n✗ ${fout} van de ${GEVALLEN.length} gevallen wijkt af — het instrument is veranderd`,
);
process.exit(fout === 0 ? 0 : 1);
