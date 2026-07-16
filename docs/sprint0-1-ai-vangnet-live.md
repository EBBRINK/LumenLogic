# Sprint 0.1 — AI-vangnet live in productie

> **Status: klaar om uit te voeren, nog niet uitgevoerd.** Opgesteld 2026-07-16 na een
> verkenning + twee onafhankelijke plan-agents (Opus). Dit document is de volledige briefing;
> de `/goal`-prompt verwijst hiernaar. Bron van waarheid voor de eindstand blijft `HANDOVER.md`.

## Doel

Het AI-vangnet draait aantoonbaar live over de restregels bij import in productie, binnen budget.

**Acceptatiecriteria** (uit `docs/lumenlogic-sprintplan-augustus.md` §Sprint 0):
1. Test-armaturenboek importeren in productie → AI-suggesties op de restregels, géén
   `ai_vangnet_skipped_no_key`-event meer, wél vangnet-events met kosten in `llm_usage`.
2. Budgetstop testen met een tijdelijk lage cap → vangnet stopt met een budgetstop-event.

**Definition of Done** staat bovenaan het sprintplan en geldt onverkort (tests, tsc, push,
deploy, handmatig geverifieerd in de live app, HANDOVER bij, events gelogd).

## Besluiten van Timo (2026-07-16)

- **Budgetcap €10/maand**, permanent in productie (geldt voor vangnet + OCR samen).
- **Live test = volledige import** van `docs/examples/test-armaturenboek.pdf` (tekst-PDF,
  dus géén OCR-kosten) — niet alleen een goedkope hermatch.
- **Variant A**: Claude mag namens Timo inloggen op de live app en de browserstappen zelf doen.
- **Werkwijze verplicht**: probleem uitschrijven → plan met 2 agents → fixen met 2 agents.
  Nooit direct bouwen. Stop vóór elke productie-deploy en vraag akkoord.

## Geverifieerde stand (16 jul 2026, tegen `origin/main` ná fetch + de live Neon-DB)

| # | Feit | Bewijs |
|---|---|---|
| F1 | De vangnet-code is **live** (`origin/main`, via de 0.2-merge). Er is niets te bouwen aan het vangnet zelf. | `git cat-file -e origin/main:lib/ai/vangnet.ts` |
| F2 | Vangnet is aangesloten: `lib/repo/imports.ts:149` (PDF) en `:240` (CSV), `app/projects/actions.ts:543` (regel bewerken), `lib/repo/review.ts:285` (ná afgeronde OCR-review) | `git grep triggerVangnet origin/main` |
| F3 | `ANTHROPIC_API_KEY` staat als Vercel-env (Production) | `vercel env ls production` |
| F4 | Het vangnet heeft in productie **nooit gedraaid**: 0 events `ai_%`, 0 `ai_suggestions` | live DB |
| F5 | **Reden voor F4**: de enige import (15 jul 13:40) had `source='ocr'`, en het OCR-pad roept `triggerVangnet` **niet** aan — dat gebeurt alleen via `review.ts:285` ná een afgeronde OCR-review, en die zijn er niet | live DB + code |
| F6 | `app_settings` is **leeg** → geen `llm_budget_eur` → vangnet **én** OCR draaien nu **ongelimiteerd** | live DB + `vangnet.ts` `overBudget`, `ocr.ts` `checkOcrBudget` |
| F7 | `llm_usage`: 31 rijen, allemaal `purpose='ocr'`, **€0,1022**, alle van 15 jul 13:40–13:42 | live DB |
| F8 | **Die OCR-rijen komen uit een lokale `bun dev`-run, niet uit productie**: `lib/ai/ocr.ts` is aangemaakt om **13:44:15**, ná de rijen. De DB kan dev niet van prod onderscheiden (geen omgevingskolom). | `git log --diff-filter=A -- lib/ai/ocr.ts` |
| F9 | `docs/examples/test-armaturenboek.pdf` is een gegenereerde **tekst-PDF** (2,9 kB) → tekstlaag-pad, géén OCR-kosten | bestand + `scripts/gen-test-armaturenboek.ts` |
| F10 | Parallelle sessies deployen naar prod — leg de deploy-SHA vast bij de meting | `vercel ls --prod` |
| F11 | **Functielimiet = 300 s, Fluid compute staat AAN** (`defaultResourceConfig: {fluid: true, functionDefaultTimeout: 300, functionDefaultRegions: ["iad1"]}`). De vangnet-run (verwacht 30–60 s, eigen grens 120 s) past daar ruim in → het maxDuration-risico is grotendeels van tafel. | Vercel-API `v9/projects` |
| F12 | Het Vercel-account draait op het **Hobby-plan** (`billing.plan: hobby`). Zie "Los signaal" onderaan. | Vercel-API `v2/teams` |

## Valkuilen — elk hiervan heeft een eerdere sessie al fout gehad

1. **Doe altijd eerst `git fetch origin` en redeneer tegen `origin/main`, nooit tegen de
   lokale `main`.** Die liep 58 commits achter; deze sessie trapte er zelf in en concludeerde
   ten onrechte dat de vangnet-code nergens stond.
2. **Eén Neon-DB: dev = prod** (besluit B1). `db/migrate.ts` is **niet idempotent** —
   niet draaien, 0000–0009 staan er al op.
3. **De route is `/settings`, niet `/instellingen`** (i18n-slag). `HANDOVER.md:188` is stale.
4. **Een PDF-import heeft géén voorstelscherm.** `recordPdfImport` zet de run direct op
   `bevestigd` (`imports.ts:109`) en redirect naar de projectpagina. Alleen `imports.ts:149`
   vuurt; `imports.ts:240` is de CSV-flow (>10 geplakte regels).
5. **B8-gating** (`vangnet.ts`, `geenOpenOcrReview`): regels met een **open OCR-review**
   worden uitgesloten. Project `3e23a278` ("TEST PDF 15-09-2026") levert daardoor **0**
   vangnet-regels — niet als testvoer gebruiken. Wél vangnet-voer (live geverifieerd):
   "TEST PDF 09-07-2026 - 1" (7 regels), "PDF-import (demo)" (6), "TEST PDF 09-07-2026" (2).
6. **Budgetveld heeft `step="1"`** → `0,01` kan niet via de UI (browser weigert de submit).
   En **budget `0` betekent in de code "géén cap"** (`!(budget > 0)`), niet "niets uitgeven".
7. **Bewijs-event is `ai_vangnet_run`** — vuurt onvoorwaardelijk ná de regel-lus, óók bij
   `checked: 0`. Filter op **`action LIKE 'ai_%'`**, niet op `actor='ai:vangnet'`: de actor is
   het ingelogde e-mailadres (alleen `search` hardcodeert `ai:vangnet`).
8. **`llm_usage`-rijen zónder `ai_vangnet_run` = run afgekapt door maxDuration.** Er is geen
   `maxDuration`-export, geen `runtime`-export en geen `vercel.json` → Vercel-projectdefault.
   **Dit risico is inmiddels uitgezocht en grotendeels van tafel** (zie F11): de limiet is
   **300 s** met Fluid compute aan. Blijf het faalsignaal wél herkennen, maar verwacht het niet.
9. **`bun vitest run` groen bewijst níéts voor 0.1**: geen enkele test raakt `triggerVangnet`
   of het `after()`-pad (`vangnet.ts` zegt dat zelf in het commentaar). Het blijft een
   regressiecheck.
10. **Na 1 augustus** valt de €0,1022 uit de maandteller (`getLlmSpend` telt per kalendermaand)
    en werkt de goedkope budgetprobe van stap 2 niet meer zoals beschreven.

### Waarom `after()` géén stil faalpad is

`triggerVangnet` (`vangnet.ts`) doet `after()` uit `next/server` met een `try/catch`. In
Next 16.2.10 gooit `after()` **synchroon** als er geen request-scope of geen `waitUntil` is —
dan vangt de `catch` het op en draait het vangnet gewoon blokkerend in de response. Het vangnet
kan dus niet stilletjes verdwijnen doordat `after()` niet beschikbaar is. Het reële risico is
**maxDuration**, niet "after() doet niets".

## De drie fixes (stap 1)

| # | Bestand | Wat | Waarom |
|---|---|---|---|
| a | `components/settings/llm-budget-block.tsx` | `step="1"` → `step="0.01"` | Een euroveld hoort centen te accepteren; nodig voor de budgettest. |
| b | `lib/ai/vangnet.ts` (`overBudget`) + `lib/ai/ocr.ts` (`checkOcrBudget`) | Budget `0` = **echt plafond** i.p.v. "geen cap" | Fail-safe. In een budgetveld is "0 = ongelimiteerd" het tegenovergestelde van wat iemand bedoelt. Aparte commit. |
| c | `next.config.ts` | redirect `/dossiers` → `/projecten` **bestaat niet** (routes heten `/projects` na de i18n-slag) → fix naar `/projects` | Permanente 301 naar een 404, die browsers cachen. Schade stapelt zich op. Aparte commit. |

## Uitvoering

### Inloggen
Allowlist bevat **alleen** `timo@jouwainstein.com` en `e.brink@brinklicht.nl`. Log in als
`timo@jouwainstein.com`. Er is geen mailprovider; de magic link staat in de Vercel-logs:

```
vercel logs --environment production --since 15m --expand --no-branch
```

`--expand` is verplicht, anders blijft de `console.log` onder de POST-regel verborgen.

### Stap 1 — de drie fixes (met 2 agents), dan STOP
`bun vitest run` + `bunx tsc --noEmit`, commit, push. **Vraag akkoord vóór `vercel --prod`.**

### Stap 2 — gratis `after()`-probe (€0), vóór de import
Zet via `/settings` `llm_budget_eur = 0.01` (maandverbruik €0,1022 → over budget). Trigger het
vangnet goedkoop: sla één spec-regel op (`editSpecLineAction`) op een bestaand project. De
budgetpoort zit **vóór elke API-call én vóór `selectLines`**, dus dit kost niets.

Poll de events op `t=0` en `t=+60s`:

| Waarneming | Conclusie |
|---|---|
| `ai_vangnet_skipped_budget` verschijnt **ná** de response | ✅ `after()` vuurt op Vercel, key gevonden, **criterium 2 afgevinkt** |
| `ai_vangnet_skipped_budget` al bij `t=0` | ⚠️ het synchrone terugvalpad draait — werkt, maar anders dan ontworpen |
| `ai_vangnet_skipped_no_key` | ❌ de key is niet zichtbaar voor de runtime (F3 weerlegd) |
| **Niets**, terwijl de matcher-events van dezelfde request er wél staan | ❌ `after()` vuurt niet in productie → **0.1 niet gehaald**, stop en meld |

> **Time-box dit tot minuten:** zolang de cap op 0,01 staat, skipt **OCR óók stil** — en er
> draaien parallelle sessies. Zet de cap daarna direct op 10.

### Stap 3 — cap op 10
Via `/settings`. Verifieer de rij in `app_settings`.

### Stap 4 — de echte import (~€0,10)
Nieuw project **`ZZ-TEST 0.1 vangnet 16-07`**, fase **tender**. Upload
`docs/examples/test-armaturenboek.pdf`. Er komt géén voorstelscherm; je landt op de
projectpagina. Noteer het `dossier_id`. Wacht ~90 s (`after()` draait ná de response), herlaad.

Verifieer, **alles gescoped op dat `dossier_id`** (F10: parallelle sessies vervuilen anders je meting):
- `ai_vangnet_run` met `checked > 0` ← **het beslissende bewijs**
- `llm_usage` met `purpose='vangnet'`, kosten > 0
- `ai_suggestions` (mag 0 zijn — zie faalsignalen)
- géén `ai_vangnet_skipped_no_key`
- statussen **ongewijzigd** (het vangnet doet alleen suggesties, nooit beslissingen)
- `vercel logs`: functieduur >> responstijd, géén `FUNCTION_INVOCATION_TIMEOUT`
- screenshots van `/projects/<id>/review` in **licht én donker** — echt bekijken

**Faalsignalen uit elkaar houden:**
- `llm_usage`-rijen **zonder** `ai_vangnet_run` ⇒ afgekapt door maxDuration ⇒ 0.1 is alsnog
  een bouwklus (`export const maxDuration`).
- `ai_vangnet_run` met `checked: 0` ⇒ `selectLines` selecteerde niets (B8-gating?) — **niet**
  "after() stuk".
- `ai_vangnet_run` met `checked: 4, suggested: 0` ⇒ **geslaagd**, het vangnet vond niets.
  Legitiem: het model mag `{"suggesties":[]}` teruggeven.

### Stap 5 — DoD
`bun vitest run` groen, `bunx tsc --noEmit` schoon, gecommit + gepusht, gedeployed.
Geen migraties draaien. `HANDOVER.md` bijwerken met: **dossier-id, deploy-SHA, meetmoment,
gemeten kosten, de nieuwe budgetcap**, en **de correctie op F8** (de OCR-rijen kwamen uit een
lokale dev-run) — anders trapt de volgende sessie in dezelfde val.

Het open punt in `HANDOVER.md` ("`ANTHROPIC_API_KEY` ontbreekt nog") is achterhaald en moet
vervangen worden door de werkelijke stand.

## Ook vastleggen in HANDOVER — niet fixen, buiten scope

- **De OCR-budgetmelding liegt**: bij een maandcap-stop toont de UI hardcoded "het €1-boekbudget
  is op" (`app/projects/actions.ts:310-311` plet beide redenen tot één string +
  `components/dossier/pdf-upload-card.tsx:158-160`). Het event in de DB heeft de waarheid.
- **Een OCR-run die op budget stopt is terminaal**: `ocrStatus` gaat naar `gestopt` en
  hervatten kan alleen bij `bezig` — ook nadat de cap weer omhoog gaat.
- **Stale comments** in `vangnet.ts` (rond de tijdgrenzen) beweren nog dat de run "awaited in
  de import-respons" wordt; dat klopt niet meer sinds de `after()`-refactor.
- **`VANGNET_MAX_MS` (120 s) is dood beleid** onder `after()`: het platform-plafond ligt vrijwel
  zeker lager, dus de eigen tijdsgrens kan nooit vuren. Bovendien is het een zachte grens
  *tussen* regels — één regel kan theoretisch tot ~360 s duren.
- **`getLlmSpend` gebruikt lokale tijdzone** voor `startOfMonth` (op Vercel UTC) — latente bug
  in de eerste uren van een maand.
- **De maandcap is gedeeld** tussen OCR en vangnet, en OCR kan het vangnet wegdrukken.
  `getLlmSpendForPurpose` bestaat al voor een uitsplitsing.

## Los signaal — niet voor 0.1, wél voor sprint 4

Het Vercel-account staat op het **Hobby-plan** (`billing.plan: hobby`, geverifieerd via de API
op 16 jul 2026). Lumen Logic is commercieel werk voor Brink Licht, en Vercel's Hobby-plan is
bedoeld voor niet-commercieel gebruik. Dat raakt **sprint 4.1** (accounts migreren naar Brink):
de doelomgeving zal een betaald plan moeten zijn, en dat hoort in het migratiedraaiboek van de
spike (2.3) te staan — inclusief wat het kost en wie het afsluit. Geen actie voor 0.1;
puur zodat het niet pas op de laatste week ontdekt wordt.
