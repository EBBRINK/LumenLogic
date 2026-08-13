# Probleem: template-upload zonder rij-cap wurgt zichzelf op catalogus-formaat bestanden

_Gemeten 11 aug 2026, lokaal, met `deltalight-branddata-2026-08-11.xlsx` (1,0 MB)._

## Wat er gebeurt

Brink uploadt een ingevulde brand-template op het merkrelatiescherm. De knop blijft
minutenlang op "Checking…" staan met de tekst "Reading the file and comparing it with what
we already know…". Er komt geen foutmelding en geen voorstelscherm — voor de gebruiker is
onduidelijk of er iets stuk is of dat wachten zin heeft.

## De metingen

- Het bestand bevat **18.670 rijen × 66 kolommen** (sheet1.xml uitgepakt: 10,5 MB). Dat is
  geen ingevulde template maar een complete merkcatalogus in template-vorm.
- De xlsx-parse zelf is onschuldig: exceljs `load()` + `eachRow()` over alle 18.670 rijen
  kost **0,4 s** (los gemeten met bun op dezelfde machine).
- De byte-cap (`MAX_TEMPLATE_UPLOAD_BYTES` = 3 MB, twee lagen, besluit 7 van
  `docs/plan-1-2-retourpad.md`) houdt dit bestand **niet** tegen: het is 1,0 MB. Er bestaat
  geen rij-cap — niet in `lib/excel-validate.ts`, niet in `uploadTemplateAction`.

## Waar de tijd wél zit (code-analyse, niet per stap gemeten)

1. **Staging-payload**: `uploadTemplateAction` (app/data/brand-relations/[brandId]/
   upload-actions.ts) bewaart de validator-snapshot van álle rijen als één jsonb-rij via
   `stageTemplateReturn` — tientallen MB's naar Neon over één insert.
2. **Voorstelscherm**: de redirect landt op `upload/[uploadId]/page.tsx`, dat bij elke
   render `diffTemplateRows` draait over alle 18.670 rijen tegen alle bestaande producten
   (`loadBestaandeProducten`) en het resultaat integraal rendert. In `lib/template-diff.ts`
   en `components/data/template-proposal.tsx` staat **geen enkele limiet of paginering**.
3. **De UI liegt over de fase**: `pending` van `useActionState` blijft `true` tot de
   redirect-bestemming klaar is. "Checking…" dekt dus ook het stagen én het bouwen van het
   voorstelscherm — de gebruiker denkt dat de format-check hangt terwijl de check al lang
   klaar is.

## Waarom dit meer is dan traagheid

- Zelfs als het voorstelscherm ooit landt, is het onbruikbaar: 18.670 beslis-rijen × 66
  velden aan checkboxes in één formulier trekt elke browser om, en "beslis veld voor veld"
  is op die schaal geen menselijke taak.
- Op Vercel geldt voor dit pad de default function-timeout (alleen `app/projects/[id]`
  zet `maxDuration = 300`); een productie-upload van dit formaat sterft daar vermoedelijk
  stil, mét een al geschreven staging-rij van tientallen MB's als restafval.
- Het retour-pad is ontworpen voor "een gevulde template is honderden KB" (letterlijk in
  `template-upload-limits.ts`) — de aanname klopt, alleen wordt hij nergens in rijen
  afgedwongen.

## Wat het probleem níét is

- Geen exceljs/parse-probleem (0,4 s).
- Geen byte-cap-probleem: de cap doet wat hij belooft, hij meet alleen de verkeerde maat
  voor dit scenario (xlsx comprimeert tekst ~10×).

## Open vragen voor het plan

1. Is een bestand van 18.670 rijen een **afwijzing** (te groot, vraag het merk om een
   delta) of een **te ondersteunen geval** (grote merken bestaan; paginering + bulk-acties)?
2. Waar hoort de rij-cap: in de validator (format-oordeel) of ernaast (transportgrens,
   zoals de byte-cap)? De validator kent het rijental als eerste.
3. Wat doet de voortgangs-UI: eerlijk maken ("Checking…" ≠ "voorstel bouwen"), of wordt
   het pad zo snel dat het niet meer hoeft?
