// Tekstrelevantie-weging voor de kandidatenordening (docs/goal-tekstrelevantie.md).
//
// Het probleem dat dit oplost: `matchCount` telde elk producttekst-token even zwaar, en over
// een beschrijving van 50–130 tokens meet dat woordenrijkdom, geen relevantie. Een product met
// veel generieke spec-woorden in zijn naam (`INS 100 1171 CRI90 HIGH LUMEN DALI …`) won van het
// product dat de typeaanduiding droeg (`SASSO PRO 100 FL …`).
//
// De ingreep is puur positioneel en leunt op één feit over de boekregel: `splitBrandType`
// (lib/pdf/armaturenboek.ts) snijdt het merk er al af, dus de producttekst BEGINT met de
// typeaanduiding (`SASSO PRO 100 …`) en eindigt in spec-proza en opmerkingen. Vroege tokens
// identificeren het armatuur; late tokens zijn ruis. Het gewicht loopt daarom monotoon af.
//
// Bewust GEEN idf/zeldzaamheidsweging: gemeten (docs/probleem-tekstrelevantie.md) maakte dat het
// slechter, want zeldzaam ≠ onderscheidend — `Gefacetteerde`, `SDCM`, `112x106mm` en `104` zijn
// zeldzaam én betekenisloos. Positie is de betrouwbare proxy voor "identificeert dit het type".

// Gewicht van het token op positie `index` (0-based). Token 0 (de typeaanduiding) weegt 1,0 en
// domineert; de staart van de beschrijving zakt richting nul. `1/(1 + index/2)`: 1,0 · 0,67 ·
// 0,50 · 0,40 · 0,33 … — genoeg spreiding dat de eerste twee, drie identificerende tokens samen
// elk generiek-token-rijk product buiten de familie verslaan, zonder dat late tokens niets meer
// tellen (ze blijven een zwak positief signaal).
export function tokenWeight(index: number): number {
  return 1 / (1 + index / 2);
}
