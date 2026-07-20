# Probleem: de juiste variant komt nooit in beeld

> Fase 1 van de werkwijze (probleem uitschrijven), 20 jul 2026. Alle cijfers hieronder zijn
> read-only geverifieerd tegen de live Neon-DB. Voorganger: `docs/probleem-import-leest-verkeerd.md`
> (import — opgelost) en de "groen is groen"-fixes `872597b` + `38ef337`.

## Het probleem in één regel

De specs worden gebruikt om kandidaten te **beoordelen**, maar niet om ze te **zoeken**.
Daardoor komt het juiste product nooit in de top-8 en wordt het nooit beoordeeld — terwijl
het gewoon in de catalogus ligt.

## Wat er nu gebeurt (Lr301, hard gemeten)

Het boek vraagt: **XAL SASSO PRO 100 · 3000K · CRI ≥ 90 · IP20 · 27 W · 39°**.
Die eisen staan sinds `38ef337` correct op de regel.

`fetchCandidates` (`lib/matching/engine.ts:195-251`) zoekt op **merk + woorden uit de
producttekst**, en rangschikt op `matchCount → prefixBonus → similarity → naam`. Specs komen
in die query niet voor. Resultaat:

| | |
|---|---|
| Producten in de resultaatset | **8.495** |
| Delen exact dezelfde topscore (`mc=3, prefix=1`) | **131** |
| Rang van het juiste artikel `L360048-2413537F` (3000K, 27W) | **106** |
| Wat de top-8 wél bevat | 8× **2700K** (14,5 W en 26,5 W) |
| Voldoen écht aan 3000K + 26-28 W | **8 van de 131** |

Alle 131 SASSO PRO 100-varianten scoren identiek op de naam-tokens; de tiebreak valt terug op
`similarity` (varieert een fractie met naamlengte) en dan het alfabet. De variantkeuze —
kleurtemperatuur, vermogen, stralingshoek, kleur — wordt dus door **toeval** bepaald.

Gevolg na de "groen is groen"-fix: het systeem beoordeelt die 2700K-varianten netjes en wijst
ze af op kelvin-exact → de regel wordt **rood**. Eerlijk, maar waardeloos: het juiste product
lag 98 plaatsen verderop.

Zelfde patroon bij Lw001/Lw002: de tokens "STRETTA" en "WALL" leveren **VITA WALL STANDARD
RAIL** (montagerails) op; de gevraagde STRETTA 600/900 staat er niet bij.

## De valkuil die elk plan moet overleven

**Hard filteren op de gevraagde specs levert nul resultaten.** De catalogus is grotendeels
leeg op precies de velden die het boek noemt:

| Veld | Gevuld in de hele catalogus (210.117 zichtbare producten) | In de 131 SASSO-varianten |
|---|---|---|
| `cri` | **0** (nul, over de hele catalogus) | 0 van 131 |
| `ip_value` | 3.357 (1,6 %) | 0 van 131 |
| `beam_angle` | 22.688 (11 %) | 0 van 131 |
| `lumen_output` | — | 0 van 131 |
| `kelvin` | 69.822 (33 %) | **118 van 131** |
| `max_wattage` | 48.845 (23 %) | **118 van 131** |

Van de vijf eisen die het boek voor Lr301 stelt zijn er dus maar **twee** überhaupt toetsbaar
in de data (kelvin, wattage). Een filter op CRI of IP zou de hele catalogus wegvagen.

Dit raakt **besluit 4** rechtstreeks: *geen-data = grijze vlag, nooit stilzwijgend uitsluiten.*
Een product zonder kelvin mag niet verdwijnen omdat het toevallig niet gevuld is — maar het
mag ook niet vóór een product komen dat aantoonbaar klopt.

## Wat expliciet GEEN oorzaak is

- **De top-8-limiet.** Het probleem is niet dat de lijst kort is, maar dat hij verkeerd
  gesorteerd is. Met limiet 50 staat het juiste artikel nog steeds niet bovenaan (rang 106).
- **De catalogus.** Het juiste product ligt er, met kloppende kelvin en wattage. Ook Jayden's
  drie andere artikelen (`L360048-2412537W`, `L360057-0132537H`, `L360057-0133537H`) zijn
  aanwezig met correcte specs.
- **De import.** Codes, merken en specs komen sinds `38ef337` correct binnen; geverifieerd op
  alle vier de testcases.
- **De beoordeling.** `judgeCandidate` + de tolerantietabel doen wat ze moeten doen — kelvin-exact
  ontmaskerde de 2700K-varianten correct.

## Vangrails — mag niet sneuvelen

- **IJzeren regel 2**: geld nooit in de ranking. `engine.ts:250` bevat geen prijs en dat blijft
  zo; de invariant-tests `inv2`/`inv7b` moeten groen blijven.
- **IJzeren regel 3**: kandidaten uitsluitend uit `visible_products`.
- **Besluit 4**: geen-data = grijze vlag. Ontbrekende specs mogen een product niet stil
  wegfilteren; de tweelijsten-presentatie (aantoonbaar / mogelijk-data-onvolledig, C-08) is
  precies hiervoor bedoeld.
- **"Groen is groen"** (`872597b`): een kandidaat zonder één getoetste eis mag nooit in lijst 1.
- **De statussen-semantiek** uit `docs/matching-regelset.md` wordt niet geherdefinieerd.
- De acceptatietest (`tests/acceptatie-aanvraag-estimate.test.ts`) blijft het regressie-anker.

## Wat een plan moet opleveren

Een aanpak waarbij de gevraagde specs meewegen in het **vinden** van kandidaten, niet alleen in
het beoordelen — zonder producten met ontbrekende data stil uit te sluiten, en zonder de
bestaande statussen-semantiek te breken. Meetbaar tegen de vier testcases
(`scripts/eval-testset.ts`), met als concrete lat: **staan Jayden's vier artikelen na de fix in
de kandidatenlijst, en op welke rang?**

Nulmeting om tegen af te zetten: alle vier staan nu **buiten de top-50** (Lr301 op 106).
