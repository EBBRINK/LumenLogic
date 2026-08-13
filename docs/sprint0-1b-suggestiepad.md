# Sprint 0.1b — zichtbaar maken wát het model antwoordde

> **Status: klaar om uit te voeren, nog niet uitgevoerd.** Opgesteld 2026-07-16 door de
> sprintmaster-sessie, op basis van navraag bij de 0.1-sessie. Dit document is de volledige
> briefing. Bron van waarheid voor de eindstand blijft `HANDOVER.md`; het plan staat in de
> vault (het sprintplan dat Timo buiten deze repo beheert), technische aanvulling in
> `docs/lumenlogic-sprintplan-augustus.md`.
>
> Voorganger: `docs/sprint0-1-ai-vangnet-live.md` (0.1 — vangnet live, hoofddoel gehaald).

## Waarom dit item bestaat

Sprint 0.1 haalde zijn hoofddoel: het vangnet draait aantoonbaar live in productie, binnen
budget. Eén criterium bleef staan — het sprintplan eist letterlijk *"verschijnen AI-suggesties
in review"*, en dat is **niet waargenomen**: het vangnet controleerde 7 regels en gaf
**0 suggesties**.

De eerste verklaring ("de catalogus voert het gevraagde merk niet, dus de merkvergrendeling
blokkeert alles") is door de 0.1-sessie **weerlegd**. En daarmee verschuift het probleem: we
weten niet of het model niets vond, of dat onze parser het antwoord heeft opgegeten.

## Doel

Vaststellen wát het model antwoordde, en op basis daarvan het suggestiepad aantoonbaar maken
of aantoonbaar uitsluiten.

**Acceptatiecriteria**
1. *Given* een tijdelijke log van `finalText`, *when* een hermatch draait op project
   `49c6340e`, *then* is zichtbaar of het model suggesties gaf en de parser ze at, óf dat het
   echt niets vond.
2. *Given* die uitkomst, *then* is de parser gefixt (gulzige regex + stille `catch`), met test.
3. *Given* de fix, *then* staat er **één echte `ai_suggestions`-rij op
   `/projects/[id]/review` in productie** — óf is bewezen dat "niets" hier het juiste
   antwoord was, met de reden erbij.
4. De tijdelijke log is er ná de meting **weer uit**.

**Definition of Done** staat in `docs/lumenlogic-sprintplan-augustus.md` en geldt onverkort
(tests, tsc, push, deploy, handmatig geverifieerd in de live app, HANDOVER bij, events gelogd).

## Besluiten van Timo (2026-07-16)

- **Tijdelijk loggen, daarna weg.** Geen permanente opslag van modelantwoorden, geen migratie.
- **Deze week** (de week loopt t/m vr 17 jul).
- **De regex-fix hoort bij 0.1b**, niet bij het hygiëne-item 2.5 in week 2.
- Werkwijze verplicht: **probleem uitschrijven → plan met 2 agents → fixen met 2 agents.**
  Nooit direct bouwen. **Stop vóór elke productie-deploy en vraag akkoord.**

## Geverifieerde stand (16 jul 2026)

| # | Feit | Bewijs |
|---|---|---|
| G1 | Het vangnet draaide live: `ai_vangnet_run`, `checked: 7, suggested: 0, discarded: 0, phase: tender` op dossier `49c6340e-83d8-45c7-84d9-64fe1f48cb88` ("ZZ-TEST 0.1 vangnet 16-07"), deploy-SHA `966191f`, 16 jul 08:56–08:58 UTC | live DB, onafhankelijk geverifieerd |
| G2 | **De merken zitten wél in de catalogus.** 5 van de 7 restregels kregen **8 treffers** terug = `SEARCH_LIMIT`, dus er waren er ≥8. Alleen Lp601 (XAL "PHANTOMDELUXE ZX9000") en Lr701 (Flos "ORIONNOVA") kwamen op 0 | 0.1-sessie, live DB |
| G3 | Verdeling: Lw102 (Axo Light, geel, 2 zoekacties, 8 treffers) · Lw103 (Axo Light, geel, 1, 8) · Ld202 (Kreon, rood, 3, 8) · Ld106 (XAL, geel, 2, 8) · Ld107 (XAL, rood, 3, 8) · Lp601 (XAL, rood, 1, 0) · Lr701 (Flos, rood, 2, 0) | idem |
| G4 | **Beurten-uitputting is uitgesloten.** 21 `llm_usage`-rijen = 14 zoekacties + 1 slotcall per regel (7). `MAX_TURNS_PER_LINE` (6) is nooit geraakt; alle 7 regels producéérden een slottekst | idem |
| G5 | `finalText` wordt geparsed en **weggegooid** — niet gelogd, niet opgeslagen, geen `console.log` in de hele AI-laag. De Vercel-logs bevatten er niets over | `lib/ai/vangnet.ts:679, 706, 747` |
| G6 | Budgetcap staat op **€10/maand**; maandverbruik €0,1641 (€0,1022 OCR + €0,0619 vangnet) | `app_settings`, `llm_usage` |
| G7 | `after()` werkt op Vercel — maxDuration-risico weerlegd. Géén `vercel.json` of `maxDuration`-export nodig | `HANDOVER.md`, 0.1 |

## Het probleem, uitgeschreven

`parseSuggestions` (`lib/ai/vangnet.ts:457-480`) geeft `[]` terug in **drie ononderscheidbare
gevallen**:

1. de regex vindt geen `{…"suggesties"…}` → `return []` (regel 461);
2. `JSON.parse` gooit → `return []` via de stille `catch` (regel 477);
3. de array is écht leeg → `[]`.

**`discarded: 0` bewijst dus niet dat het model leeg teruggaf.** `discarded` telt alléén
suggesties die een product-id noemden dat niet in de toolresultaten zat. Een parse-mislukking
levert nul suggesties op → nul discards. `suggested: 0, discarded: 0` is exact wat je ziet als
het model een prima antwoord gaf dat de parser miste.

### De regex is broos

```js
/\{[^{}]*"suggesties"[\s\S]*\}/
```

`[\s\S]*` is **gulzig tot de laatste `}` in de hele slottekst**. Schrijft het model na zijn
JSON nog proza met een accolade erin, dan overschiet de capture en gooit `JSON.parse` — stil.

Let ook op: het commentaar erboven zegt *"Laatste JSON-object met 'suggesties' uit de slottekst
vissen"*. Dat is **niet wat de code doet** — hij pakt de eerste passende `{` en rekt tot de
laatste `}`. Het commentaar liegt over zijn eigen functie.

### Wat we dus níét weten

Of de 5 regels mét 8 kandidaten een leeg antwoord kregen, of een goed antwoord dat wij hebben
opgegeten. **Dat verschil is het hele item.**

## Uitvoering

### Inloggen
Allowlist bevat **alleen** `timo@jouwainstein.com` en `e.brink@brinklicht.nl`. Er is geen
mailprovider; de magic link staat in de Vercel-logs:

```
vercel logs --environment production --since 15m --expand --no-branch
```

`--expand` is verplicht, anders blijft de `console.log` onder de POST-regel verborgen.
Link is 5 min geldig.

### Stap 1 — probleem + plan (2 agents), dan STOP
Werkwijze. Laat de plan-agents expliciet wegen **hoe** `finalText` zichtbaar wordt (tijdelijke
`console.log` volstaat — besluit Timo) én **hoe** de parser gefixt wordt. Opties voor de fix,
niet voorgekookt:
- niet-gulzige of accolade-balancerende match, meerdere kandidaten proberen (laatste → eerste);
- de stille `catch` een spoor laten achterlaten (event/teller) i.p.v. `[]`;
- **structureel**: de slotbeurt een *tool call* laten zijn (`submit_suggestions`) i.p.v. JSON
  in vrije tekst — dan verdwijnt het parseprobleem in plaats van dat het verzacht wordt.
  Grotere ingreep; laat de agents afwegen of dat binnen 0.1b past of een apart item wordt.

### Stap 2 — meten (~€0,05)
Tijdelijke log erin, deploy (**akkoord vragen**), hermatch op `49c6340e`. Er is **geen nieuw
project nodig** — dit is al valide voer (G2/G3).

Hermatch triggert het vangnet via `lib/repo/review.ts:285` of `app/projects/actions.ts:543`
(regel bewerken). Wacht ~90 s (`after()` draait ná de response), lees dan de logs.

**Scope alles op `dossier_id = 49c6340e-…`** — er draaien parallelle sessies die je meting
anders vervuilen.

| Waarneming in `finalText` | Conclusie |
|---|---|
| Geldige JSON met suggesties | ❌ **parser at het op** → fix de regex, dat is de bug |
| `{"suggesties": []}` netjes leeg | ✅ model vond echt niets → leg vast **waarom** (8 kandidaten, geen passende?) en sluit criterium 3 af met die onderbouwing |
| JSON + proza met accolade erachter | ❌ **precies het gulzige-regex-scenario** — bewezen |
| Proza zonder JSON | ⚠️ promptprobleem, geen parserprobleem — ander item |
| Leeg / geen tekst | ⚠️ onverwacht; `stop_reason` erbij pakken |

### Stap 3 — fixen (2 agents)
Regex + stille `catch`, **met test**. `bun vitest run` + `bunx tsc --noEmit`.

### Stap 4 — aantonen
Hermatch opnieuw. Doel: **één echte `ai_suggestions`-rij** in de DB én zichtbaar op
`/projects/49c6340e-…/review` in productie. Screenshots licht én donker — echt bekijken.

Blijkt "niets" het juiste antwoord (stap 2, rij 2): dan is criterium 3 afgesloten met
onderbouwing i.p.v. met een rij. Meld dat expliciet, verzin geen suggestie.

### Stap 5 — log eruit
De tijdelijke log verwijderen. Verifiëren dat hij weg is vóór de laatste deploy.

### Stap 6 — DoD + opruimen
`bun vitest run` groen, `bunx tsc --noEmit` schoon, gecommit + gepusht, gedeployed, HANDOVER
bij. **Daarna**: testproject `49c6340e` opruimen met `scripts/cleanup-testdata.ts` — het was
bewijsspoor voor 0.1 en mag weg zodra 0.1 is afgevinkt.

## Valkuilen

- **Niet doen: een `gegund`-project forceren** om cross-merk-suggesties te ontsluiten.
  `phase` is afgeleid (`derivePhase`, `lib/repo/project-status.ts:68`), één schrijver, geen
  toggle. Het zou de commerciële status van een project wijzigen én de meting vertroebelen —
  cross-merk is niet het knelpunt (G2).
- **8 treffers is het plafond** (`SEARCH_LIMIT`), gesorteerd op tokentreffers/similariteit. Het
  *juiste* product hoeft er niet bij te zitten. "Niets passends" kan legitiem zijn — maar dat
  moet je dan kunnen laten zien, niet aannemen.
- **`bun vitest run` groen bewijst niets voor dit item.** Geen enkele test raakt het
  `after()`-pad; de acceptatietest gebruikt een *gemockte* client — precies het verschil dat
  0.1b onderzoekt.
- **`llm_usage` kent geen omgevingskolom en dev = prod** (één Neon-DB). Een lokale `bun dev`-run
  telt mee tegen de productie-maandcap. Bij €10 onschuldig, maar weet het.
- **Ná 1 augustus** valt de €0,1022 uit de maandteller (`getLlmSpend` telt per kalendermaand).
- **B8-gating**: regels met een open OCR-review doen niet mee (`geenOpenOcrReview`). Bij
  `49c6340e` speelt dat niet (tekst-PDF, geen OCR), maar herken het signaal.
