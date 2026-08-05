# Invoervalidatie — de conventie

Bron: reviewzwerm 2.5a, bevinding **A10**. Kort samengevat: er stond géén
validatiebibliotheek in `package.json` en alle 68 exported server actions vertrouwden
rauwe `FormData`. De review had eerst twee losse gevallen gemeld — een enum-crash (C3) en
negatieve prijzen (C4) — en trok die zelf terug als framingsfout:

> Het patroon is niet "twee actions missen een check", het is "er is geen validatielaag, en
> de gevallen die we vonden zijn de twee waar het toevallig opvalt". Elk nieuw formulierveld
> erft dit.

De bibliotheek is **zod**. De gedeelde laag staat in [`lib/validation.ts`](../lib/validation.ts);
dat bestand is de normatieve tekst, dit document legt uit waaróm.

## De drie regels

**1. Elke server action begint met een schema-parse.**
Geen `String(formData.get(…))` en geen `as`-cast die rechtstreeks een repo-functie of een
db-kolom in gaat. Eén `parseForm(schema, formData)` bovenaan, daarna werk je met een
getypeerd object.

**2. Ná de parse vertrouwt de repo-laag zijn invoer.**
Repo-functies krijgen getypeerde argumenten, geen `FormData`, en herhalen de vormcontrole
niet. Dat is het hele punt van een grens: hij ligt op één plek.

> **Uitzondering — domeinregels.** Een invariant die **geld of een klantdocument** raakt
> hoort óók in de repo. `setDayPrice` weigert daarom zelf een negatieve prijs (C4): dat is
> geen vormcontrole maar een eigenschap van de data, en die moet gelden ongeacht welk
> formulier er toevallig langskwam. De UI-grens (`type=number min=0`) telt niet mee — die
> is er voor de gebruiker, niet voor het systeem.

**3. Ongeldige invoer is nooit een 500.**
Het antwoord is stil negeren (revalidate en klaar), een `{ error }`-terugmelding, of
`notFound()`. Nooit een cast die Postgres laat klappen: `flagReviewAction` gaf op een
onbekende `kind` een `invalid input value for enum review_kind` (22P02), en dat is geen
antwoord op slechte invoer. Daarom geeft `parseForm` een `{ ok, data | error }`-union terug
in plaats van te throwen — een throw zou juist de 500 opleveren die we wegnemen.

## De volgorde

```
requireSession()   ← eerst de poort
parseForm(…)       ← dan pas de invoer
repo-aanroep       ← die vertrouwt wat hij krijgt
```

De sessiepoort staat **vóór** de parse. Een beller die niet binnen mag hoort niet te weten
of zijn invoer goed was — anders is de foutmelding zelf een informatielek. Zie
`app/products/[id]/actions.ts` voor die volgorde in het klein.

## Bouwstenen

Uit `lib/validation.ts`:

| Bouwsteen | Waarvoor |
| --- | --- |
| `zUuid` | Elke id die een uuid-kolom in gaat. Leunt op `isUuid` uit `lib/uuid.ts`, zodat er één definitie van "is dit een id" bestaat — bewust niet `z.uuid()`. |
| `zEnumFrom(values)` | Elke kolom die in Postgres een enum is. Dit is de bouwsteen die C3 structureel oplost. |
| `zPrice` | Geld. Nooit negatief, nooit NaN/Infinity, en begrensd op wat `numeric(12,2)` aankan. |
| `zBoundedInt(min, max)` | Pagina's, tegels, aantallen — alles met een bovengrens. |
| `zOptionalText` / `zOptionalNumber` | Leeg veld → `null`. Nederlandse komma toegestaan bij getallen. |
| `parseForm(schema, formData)` | De aanroep bovenaan de action. |

## Bovengrenzen zijn invoervalidatie

Een ontbrekende bovengrens is hetzelfde probleem als een ontbrekende typecheck: de
gebruiker bepaalt hoeveel werk de server doet. `addSpecCsvAction` draaide een matcher per
CSV-regel zonder cap (B6), en `page`/`tile` werden nergens tegen de werkelijke omvang van
de OCR-run getoetst (C10). Zet de grens expliciet, met een constante die een naam heeft —
het precedent stond er al in `app/data/brand-relations/actions.ts` (`BULK_MAX = 100`).

## Wat nog niet om is

De conventie is ingevoerd en toegepast op de plekken die de reviewzwerm noemde. De overige
actions in `app/projects/actions.ts` en elders gebruiken nog de `String(...)`/`intOrNull`-
helpers. Die zijn niet onveilig geworden door dit document, maar ze zijn ook niet gedekt:
**een action die je aanraakt, zet je om.** Nieuwe actions beginnen meteen met een schema.
