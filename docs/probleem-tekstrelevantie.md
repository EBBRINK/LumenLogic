# Probleem: de tekstrelevantie-term deugt niet voor een beschrijving

> Vervangt stap 3, 4 en 5 van `docs/goal-variant-ranking.md` als één ontwerpvraag. Geschreven
> 20 jul 2026 na de intrekking in `dc961fd`. **Alle cijfers hieronder zijn gemeten via het
> echte codepad** (`parseSpecLinesFromPages` op het echte PDF → rang binnen de
> XAL-kandidatenset), niet via een nagebouwde query of handgetypte tekst. Dat onderscheid is
> in dit dossier al twee keer fataal geweest.

## Het probleem in één regel

`matchCount` — het aantal producttekst-tokens dat in de productnaam voorkomt — is de primaire
sorteersleutel, en over een beschrijving van 50–130 tokens meet dat niet relevantie maar
woordenrijkdom.

## De meting

| regel | tokens | rang van Jayden's artikel | `matchCount` |
|---|---|---|---|
| Lr301 | 134 | **2676** | 6 |
| Lr303 | 55 (al schoon) | **2023** | 5 |

De winnaar bij Lr303 is `INS 100 1171 CRI90 HIGH LUMEN DALI INCL.REFLECTOR 27,5W LED 3000K`
met `mc = 9`. Die scoort op `100`, `CRI`, `90`, `LED`, `3000K`, `27`, `reflector` — allemaal
generiek. Het juiste artikel `SASSO PRO 100 FL ADJ DALI 27W HO cob LED 3000K` scoort op
`SASSO`, `PRO`, `100`, `LED`, `27`, `3000K` — inclusief de twee tokens die er als enige toe
doen, en het verliest.

Tokenfrequentie binnen de XAL-catalogus (210.117 zichtbare producten, XAL-deel):

| token | komt voor in | |
|---|---|---|
| `LED` | 22.621 | ruis |
| `CRI` | 13.407 | ruis |
| `3000K` | 10.607 | ruis |
| `90` | 10.048 | ruis |
| `SASSO` | 4.846 | **onderscheidend** |
| `PRO` | 1.323 | **onderscheidend** |
| `reflector` | 286 | ruis (maar zeldzaam!) |
| `104` | 36 | ruis (lm/W-waarde, zeldzaam) |

## Wat al weerlegd is — niet opnieuw voorstellen

1. **Een spec-tiebreak ná `matchCount`** (het huidige stap 3-ontwerp: `tekstrelevantie →
   specScore → prefixBonus → similarity → naam`). Gemeten met de volledige termenstapel —
   kelvin-exact ±, watt-emmers, beam uit de optiekcode `FL`/`WF`, dim-term, continue
   wattafstand — komt Lr301 van 2676 op **2452** en Lr303 van 2023 op **2020**. Een tiebreak
   herordent alleen bínnen een gelijke `matchCount`; een verlies op de primaire sleutel haalt
   hij per definitie nooit in. Dit is geen afstelprobleem.
2. **Producttekst-hygiëne als rang-hefboom.** Lr303 is al schoon en staat op 2023. Opruimen
   blijft terecht (zie `docs/probleem-producttekst-hygiene.md`) maar lost dít niet op.
3. **Naïeve idf-weging** (`1 / ln(1 + df)` over alle tokens). Gemeten werd het slechter: de
   hoogste gewichten gaan naar `Gefacetteerde`, `SDCM`, `112x106mm`, `104` — zeldzaam en
   volstrekt betekenisloos — en er kwam een `PENDANT SHEET METAL CLIP` bovenaan.
   **Zeldzaam ≠ onderscheidend.**

## De eigenlijke ontwerpvraag

Eén invoer bracht het juiste artikel wél omhoog: de kále typeaanduiding `SASSO PRO 100`
(3 tokens) → rang **105**, en mét de spec-tiebreaks erachter → **4**. Daar telt alleen mee wat
het armatuur identificeert.

Dus: **hoe onderscheid je binnen een beschrijving de typeaanduiding van de spec-proza eromheen,
en hoe weeg je die zwaarder?** Ter oriëntatie — de boekregel is opgebouwd als
`<locatie> <montagewijze> <vorm> <FABRIKANT> <TYPEAANDUIDING> <afmeting> <specs…> <opmerking>`,
en `splitBrandType` (`lib/pdf/armaturenboek.ts`) snijdt vandaag alleen het merk eraf en levert
de **volledige** rest als "type".

## Randvoorwaarden

- **IJzeren regel 2**: geen prijs in enige sorteersleutel; `inv2`/`inv7b` groen.
- **IJzeren regel 3**: kandidaten uitsluitend uit `visible_products`.
- **Besluit 4**: geen-data is neutraal — nooit stil uitsluiten, alleen niet promoveren.
- **"Groen is groen"** (`872597b`): de `list`-toekenning (`engine.ts:460-461`) en
  `judgeCandidate` blijven onaangeraakt. De ranking bepaalt *wie* beoordeeld wordt, nooit *hoe*.
- **Geen LLM in de kandidatenstap** — de modulekop verbiedt het expliciet.
- Geen hard filteren op specs in de `WHERE` (CRI is 0 gevuld; dat vaagt de catalogus weg).
- Guard: zonder gevraagde specs moet de query **byte-identiek aan vandaag** blijven —
  `inv2`/`inv7b` draaien met `specs: {}`.
- Let op de `ORDER BY 0`-valkuil die eerder een crash gaf (constante-nul sorteertermen).

## Meetlat

- Lr301 en Lr303 leveren **verschillende** topkandidaten op. Vandaag zijn die twee regels voor
  de engine praktisch identiek; dat is de enige echte test.
- De equivalentieklasse (naam + prijs identiek) op **rang 1–2**. Niet "top-1 == Jayden's exacte
  artikelcode": `…37F` en `…38F` zijn identiek in naam, kelvin, wattage én prijs (€349).
- **Regressie-anker:** Lw001/Lw002 halen de lat al (hun top-3 is één equivalentieklasse,
  `STRETTA 600 …37H/38H/32H`) en mogen niet verslechteren.
- `provable` blijft **leeg** voor alle vier de regels — lumen en beam blijven onbekend. Er komt
  hier geen groen uit; buig de meting daar niet naartoe.
- Meten met `scripts/eval-testset.ts`, en de rang altijd als `rang@limit` noteren (hij is
  limietafhankelijk: Lw001 staat op 1 bij limit 50 en op 3 bij limit 300).
