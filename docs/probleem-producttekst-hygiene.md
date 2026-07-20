# Probleem: de producttekst slokt de paginarand op

> Stap 2 van `docs/goal-variant-ranking.md` (zie de correctiesectie onderaan dat doc voor de
> herziene volgorde). Alle cijfers read-only gemeten op rev `55ad6f1` via het echte codepad
> (`extractPagesFromPdf` → `parseSpecLinesFromPages`), 20 jul 2026.

## Het probleem in één regel

`parseTocText` laat een record lopen van de ene armatuurcode tot de volgende. Waar er tussen
twee codes een paginagrens (of het documenteinde) zit, komt de complete paginarand in de
producttekst terecht — en die rand bepaalt daarna mee wie er als kandidaat gevonden wordt.

## Waarom dit een opruimstap is en géén rang-hefboom

> ⚠️ Een eerdere versie van dit doc claimde hier rangwinst (448 → 105). **Dat was fout** —
> gemeten met handgetypte invoer in plaats van het echte codepad. Hermeten klopt het niet.

`fetchCandidates` telt hoeveel producttekst-tokens in de productnaam voorkomen (`matchCount`)
en sorteert daarop als **primaire** sleutel. Elk rommeltoken dat toevallig in een productnaam
voorkomt, telt even zwaar als het typenummer. Dat klinkt alsof opruimen helpt — maar:

| regel | tokens | rang van Jayden's artikel |
|---|---|---|
| Lr301 (vervuild) | 134 | **2676** |
| Lr303 (**vandaag al schoon**) | 55 | **2023** |

**Lr303 draagt geen enkel randtoken en is even stuk.** De tokens waarop de verkeerde winnaar
scoort — `CRI` (13.407 XAL-producten), `LED` (22.621), `3000K` (10.607), `90`, `reflector` —
staan in Lr301's **eigen legitieme regeltekst**, niet in de paginarand. Opruimen haalt
`Referentie Locatie Montagewijze Vorm Fabricaat Blad Paauw` weg, en díe komen nauwelijks in
XAL-productnamen voor.

Doe deze stap dus omdat 134 tokens paginakop in een matcher niet thuishoort — niet omdat het
de rang redt. De rang-oorzaak ligt in de tekstrelevantie-term zelf; zie de correctiesectie van
`docs/goal-variant-ranking.md`.

## Twee verschillende bronnen (niet één)

| | wat er gebeurt | raadhuis | tno |
|---|---|---|---|
| **A. paginagrens** | record loopt door over `Blad N van 4` heen en pakt de volledige kop van de volgende pagina mee | Lr301: 134, Ls006: 134 | n.v.t. (1 pagina) |
| **B. documenteinde** | het laatste record loopt door tot EOF, want er komt geen code meer | Lw101: **638** | Lp101: **724** |
| mediaan gezonde regel | | 55 | 27 |
| records > 2× mediaan | | 3 van 31 | 3 van 15 |

Bron A is regelmatig: **elke** pagina van het Raadhuis-boek opent met exact hetzelfde
35-token blok (`Bijlage E01 - Armaturenlijst Betreft: Project: Projectnummer: RNL150.07291.00
… Referentie Locatie Montagewijze Vorm Fabricaat Type Armatuurafmetingen …`) en sluit met
`Blad N van 4`. Bron B kent die regelmaat niet en is met paginakop-detectie dus níét te
vangen — TNO is één pagina, daar bestaat "de volgende paginakop" niet eens.

## Wat een oplossing moet halen

- Lr301 `productText` **≤ 65 tokens** (nu 134) én `reqKelvin`/`reqWatt`/`reqBeamAngle` blijven
  gevuld. ⚠️ De oorspronkelijke lat uit het goal-doc (`< 25 tokens`) is **niet haalbaar** en is
  ingetrokken: Lr301's schone body is ~57 tokens en zijn tweelingregel Lr303 is er 55 en geldt
  als gezond. Onder de 25 komen betekent `IP20 · 27 W · 3000K · (39°) · 2810 lm` weggooien —
  precies de gevraagde specs die de matcher nodig heeft. Beide plan-agents kwamen hier
  onafhankelijk op uit.
- Lw101/Lp101 (bron B) meebehandeld, niet alleen bron A.
- De **gezonde** regels blijven ongemoeid: Lr303 (55 tokens) en Lw001/Lw002 (50/42) dragen
  hun volledige spec-tekst en die is nodig — `parseTocText` leest er `reqKelvin`/`reqWatt`/
  `reqBeamAngle` uit via `parseProductName`. Te agressief knippen kost gevraagde specs.
- Lw001/Lw002 staan al op de meetlat (equivalentieklasse op rang 1–3) en zijn regressie-anker:
  hun rang mag niet verslechteren.

## Vangrails

- **De segmentatie wordt niet herontworpen** en de AI-leesroute wordt niet geraakt
  (*Doet NIET* uit het goal-doc). Dit is een hygiënestap op de bestaande code→code-lus.
- `--assert-nulmeting` breekt hier by design — én staat **nu al rood** (het toetst het 16
  jul-ijkpunt: raadhuis `merk-fout 31` / `{blauw:30, paars:1}`, gemeten is `merk-bestaand 14`
  / `fout 0` / `{open:13, blauw:10, geel:5, rood:2, paars:1}`). Herijken in dezelfde commit,
  mét motivering — nooit stilzwijgend.
- Geen prijs in enige sorteersleutel (ijzeren regel 2); `inv2`/`inv7b` groen.
- De acceptatietest blijft het regressie-anker.
- KvK leest **0 regels** en blijft dat waarschijnlijk; dat is een eigen probleem (andere
  documentvorm) en valt buiten deze stap.
