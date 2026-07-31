// Eén plek die beslist wanneer twee merknamen "hetzelfde merk" zijn.
//
// ⚠️ VERGRENDELEN IS GELIJKHEID, ZOEKEN IS BEVATTEN — houd die twee uit elkaar.
//
// WAAROM DIT BESTAAT (reviewzwerm 2.5a, A14): ijzeren regel 4 zegt dat een dossier in
// tender-stand nooit een ánder merk voorgeschoteld krijgt. Die regel werd op drie lagen
// afgedwongen — de zoektool, product_detail en het renderfilter — en alle drie
// vergeleken op *bevat*:
//
//     like '%' || normBrand(gevraagd) || '%'      (lib/ai/vangnet.ts, zoektool)
//     normBrand(actual).includes(requested)       (lib/ai/vangnet.ts, product_detail)
//     normBrand(s.brandName).includes(requested)  (ai-suggestion-block.tsx, render)
//
// Drie lagen die elkaar zouden moeten opvangen dekten dus exact hetzelfde gat.
// Uitgevoerd bewijs: een catalogus met `Delta` én `Delta Light`, een dossier in tender,
// een regel met brandText "Delta" → het zoekresultaat bevatte producten van beide
// merken, `product_detail` op het andere merk gaf volledige details zonder weigering,
// en de opgeslagen suggestie passeerde ook het renderfilter
// ("deltalight".includes("delta") → true).
//
// Er is geen aanvaller voor nodig. `splitBrandType` levert een canonieke
// catalogusmerknaam, dus een gewoon bestek dat een moedermerk noemt (Thorn, Delta,
// Zumtobel) lekt de submerken (Thorn Lighting, Delta Light, Zumtobel Group) — precies
// het soort paren dat in een ERP-merkentabel staat.
//
// Het patroon was overgenomen uit lib/repo/products.ts#searchProducts. Daar is fuzzy
// zoeken de bedoeling en blijft `like` staan: dat is een zoekopdracht van een ingelogde
// gebruiker, geen fase-vergrendeling. Deze module is uitdrukkelijk NIET voor zoeken.

// Genormaliseerde merknaam: hoofdletters, spaties, streepjes en punten doen er niet toe
// ("LedsC4" ≡ "LEDS-C4" ≡ "leds c4"). Zelfde normalisatie als searchProducts, zodat een
// merk dat je in de catalogus vindt ook door de vergrendeling komt.
export function normBrand(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Mag een product van merk `actual` getoond worden als merk `requested` gevraagd is?
//
// Fail-closed op een leeg gevraagd merk: geen gevraagd merk betekent dat er niets
// vergrendeld kán worden, en dan is het antwoord in tender "nee" — niet "alles mag".
// Een leeg `actual` (merkloos product) haalt het daardoor ook nooit.
export function brandLockMatches(
  actual: string | null | undefined,
  requested: string | null | undefined,
): boolean {
  const a = normBrand(actual);
  const r = normBrand(requested);
  return r.length > 0 && a === r;
}
