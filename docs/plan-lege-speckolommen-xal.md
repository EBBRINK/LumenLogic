# Plan: XAL's spec-kolommen vullen uit de productnamen

> Fase 2, 29 jul 2026. Volgt op `docs/probleem-lege-speckolommen-xal.md`. Twee plan-agents met
> tegengestelde uitgangsposities (A: bouw niets, de pijplijn bestaat al · B: repareer eerst de
> poort) hebben gespard; hun cijfers zijn onafhankelijk nagemeten vóór ze in dit plan landen.
> Twee claims van A zijn exact bevestigd (`scripts/xal-cri-tokens.ts`), één claim van B is
> bevestigd én scherper gebleken dan hij schatte (de publish-duur).

## Wat het sparren heeft opgelost

**A's positie "bouw niets" is onhoudbaar gebleken — niet door B's argument, maar door twee
metingen.** Er moet hoe dan ook code komen:

1. **De publish duurt ~62 minuten** (13.407 producten × 2 round-trips × 139 ms). Dat past in geen
enkele server-action-timeout. Publiceren moet vanaf een script.
2. **Op het pad waarlangs de run start staat geen branch-poort.** `startEnrichmentRun` en
`publishRun` zijn uitsluitend bereikbaar via server-actions ([app/data/actions.ts](app/data/actions.ts)),
die de kale client uit `db/client.ts` gebruiken. Onze fail-closed guard draait alleen in
meetscripts. Via de UI zou de run tegen `.env.local` draaien — **productie**. A noemde dit zelf
het zwaarste argument tegen zijn eigen positie, en het klopt.

Zodra vaststaat dat er een gepoord script komt, wordt het onderscheid tussen de twee plannen
klein: een veldfilter erbij is vier regels.

**B's positie "repareer eerst de poort" is grotendeels overbodig gebleken voor déze run** — niet
omdat de poort deugt, maar omdat het veldfilter zijn belangrijkste reparatie gratis meeneemt.
`cri` staat bij XAL op nul gevulde kolommen, dus álle 13.407 CRI-voorstellen landen sowieso en de
steekproef gaat vanzelf voor 100 % over data die publiceert. B's R1 (filteren vóór het samplen)
blijft juist, maar is pas nodig bij de dimbaarheidsrun en bij andere merken.

## De beslissingen

### 1. Alleen CRI — niet CRI + dimbaarheid

De doorslag geeft de controlegroep. In de **verse parse** — de populatie die de nameting meet —
vraagt `tno` nul keer CRI en wél 15× dimbaarheid: vullen we alleen CRI, dan **moet tno per
constructie exact stilstaan**. Dat is een falsifieerbare voorspelling die niets kost en die de
hele meetketen toetst.

Nagemeten op de **opgeslagen** regels is het beeld anders en het argument sterker: tno heeft daar
20 regels die **allemaal** dimbaarheid vragen (niet 15), en 2 met een CRI-eis (`Lr001`, rood;
`Lr302`, open). Die twee verschijnen niet in de nameting — de verse parse leest er geen CRI-eis
op — maar `Lr302` is open en kan bij de hermatch bewegen. **Vooraf benoemd, zodat we die beweging
straks niet als regressie lezen.** Zou dimbaarheid meegaan, dan raakt het alle 20 tno-regels en
is er geen controlegroep meer over.

A's tegenargument (alleen-CRI vereist een codewijziging in precies de functie die het bewijs
leverde) verliest zijn kracht nu er sowieso een script komt. Zijn tweede punt weegt wel: de extra
data is 3.449 × generiek `DIM`, `judgeDimmable` kent geen rood, en tegen een DALI-vraag levert
`DIM` slechts +0,075 rangverschuiving. Dimbaarheid is dus goedkoop en veilig — maar het is niet
wég, het is uitgesteld tot run 2, die met het veldfilter nog één dag kost.

### 2. Géén groepsverwerping bij 'fout' — B's voorstel sneuvelt op data

B wilde dat een 'fout'-oordeel de hele `field|nameShape`-groep verwerpt. Nagemeten: **104 van de
676 CRI-naamvormen dragen meer dan één CRI-waarde** — 3.009 items, **22,4 %** van het CRI-volume.
`nameShape` maakt van elk cijfer een `#`, dus juist het getal dat je beoordeelt verdwijnt uit de
sleutel:

```
120× [80, 90]  ins move it pro spot line # me cri# dali #w led #k #-#v
 96× [80, 90]  enviva spotline # wf cri# d/i susp # cable #w led #k #ma/max #vdc excl
```

Je kunt met die sleutel niet zeggen "CRI80 is hier fout" — je veegt `CRI90` mee weg. B's
asymmetrie-argument (onterecht wegvegen is verliesloos, de kolom blijft `NULL`) klopt, maar een
poort die 22 % van het volume onbedoeld raakt is geen poort, het is ruis.

**In plaats daarvan, en strenger:** één 'fout' op een landende steekproefrij ⇒ `rejectRun`, de
hele run weg, terug naar analyse. Nul regels code, en gerechtvaardigd omdat we een foutratio van
~0 verwachten (zie hieronder). Eén fout betekent dat ons foutmodel niet klopt, en dan is
doorpublicaren met een uitzondering het verkeerde antwoord.

### 3. De steekproef blijft — maar het echte bewijs voor CRI is de tokenanalyse

Hier moet ik mijn eigen probleemdoc corrigeren. Ik schreef dat de parser "onafhankelijk
gevalideerd is op 73.804 producten". Dat klopt, maar het **dekt CRI niet**: die validatie werkt
alleen waar de kolom al gevuld is, en `cri` staat bij XAL op nul. Nul onafhankelijke toetsen op
precies het veld dat 13.407 waarden levert. A vond dit gat in mijn redenering en heeft gelijk.

Wat CRI wél dicht: alle 13.407 voorstellen komen uit **vijf letterlijke tokens** — `CRI90`
(9.143), `CRI80` (2.028), `CRI97` (1.296), `CRI95` (924), `CRI98` (16). Geen `Ra`, geen `≥`, geen
spaties, geen waarde buiten 80–98. De valse-positief-ruimte is bij inspectie leeg. Dáárom
verwachten we nul fouten in de steekproef, en dáárom is één fout een stopsignaal.

### 4. Geen `revertRun` bouwen — wel een bewezen ongedaan-recept

Kolommen terugzetten is één UPDATE per veld (`set cri = null where tier2_source->>'cri' =
'parsed-from-name'`), verliesloos omdat `publishRun` nooit overschrijft. Wat níét vanzelf
terugkomt is de hermatch: `REMATCHABLE` is alleen blauw/open, dus regels die dóór de publish
groen/geel werden, blijven staan.

Gemeten hoe groot dat probleem is: **4**. Er zijn 109 blauwe/open spec-regels in totaal, waarvan
4 XAL — allemaal status `open`. Het onomkeerbare deel van deze operatie is dus vier regels, geen
duizenden. Een `revertRun`-feature bouwen voor vier regels is niet in verhouding; het recept
uitschrijven en op de branch één keer uitvoeren wél.

## Wat er gebouwd wordt

| # | wat | omvang | test |
|---|---|---|---|
| B1 | Veldfilter: `startEnrichmentRun(db, brandId, actor, fields = FIELDS)` | ~4 regels in [enrichment.ts:203](lib/repo/enrichment.ts:203) | `fields: ["cri"]` levert uitsluitend cri-items; default-gedrag ongewijzigd |
| B2 | `scripts/verrijk-xal.ts` — guard + start + steekproef-uitdraai | ~60 regels, nieuw | guard-tests bestaan al; script draait read-only tot de start-stap |
| B3 | `scripts/publiceer-run.ts` — guard + `publishRun` met voortgang | ~40 regels, nieuw | idem |
| B4 | **Insert in blokken** in `createRun` (bij de eerste run aan het licht gekomen) | ~10 regels | `chunk()` puur getest + de gemeten grens vastgelegd |

**B4 was niet voorzien en is een echte bug.** `createRun` deed één bulk-insert van álle
voorstellen. Bij XAL zijn dat er 13.407 en dan faalt de query met `NeonDbError: Database request
failed`. Gemeten grens op de neon-HTTP-driver: **1.000 rijen gaat goed, 5.000 niet** — en 5.000
rijen zijn 35.000 bindparameters, ruim onder de Postgres-limiet van 65.535. Het knelpunt is dus de
payload van de HTTP-request, niet het aantal parameters.

Let op wat dit betekent: **deze pijplijn is nooit op een groot merk gedraaid.** De bestaande
XAL-run in de database is de optiekcode-run met 3.989 items; `&Tradition` had er 5. Alles boven de
duizend viel buiten het bereik van wat ooit getest is. De eerste poging liet bovendien een lege
run met status `steekproef` achter (de run-rij wordt vóór de items ingevoegd) — opgeruimd met
`wijs-af`.

Alle drie raken de bestaande pijplijnlogica niet, op de vier regels van B1 na. Geen wijziging aan
`publishRun`, `pickSampleIndices` of de matcher.

## Uitvoering op de branch

| # | stap | meting | ga door / stop |
|---|---|---|---|
| S0 | `xal-inventarisatie.ts` opnieuw | reproduceert de 29-jul-tabel | afwijking ⇒ **stop**, branch gedrift |
| S1 | B1 bouwen + test | `bun vitest run lib/repo/enrichment.test.ts` | rood ⇒ **stop** |
| S2 | nulmeting tweemaal draaien | twee JSON's identiek | verschil ⇒ **stop**, instrument niet deterministisch |
| S3 | run starten via B2 | items = 13.407, steekproef = 100, alle 100 op lege kolom | afwijking ⇒ **stop** |
| S4 | Timo beoordeelt 100 rijen, met de tokentabel ernaast | aantal 'fout' | ≥1 fout ⇒ `rejectRun` + **stop** |
| S5 | publiceren via B3 (~62 min) | `applied` = 13.407 | afwijking >1 % ⇒ **stop**, verklaren |
| S6 | nameting, identiek commando als S2 | **tno exact gelijk** (15/20, open:11 blauw:2 groen:1 geel:1); raadhuis rang≤50 blijft 4/4, top-1 ≥2/4 | tno beweegt ⇒ **stop**. Rangdaling van de juiste kandidaat ⇒ **stop** |
| S7 | ongedaan-proef: UPDATE naar NULL + hermatch + nameting | nulmeting hersteld op alles behalve de 4 open XAL-regels | — |
| S8 | rapport aan Timo | — | daarna pas een aparte, expliciete go voor productie |

Verwachte uitkomsten bij S6, zodat we ze niet achteraf goedpraten: `raadhuis open:12` daalt,
`rood` mag stijgen, en **Lr302 hoort rood te worden** (vraagt CRI≥92, XAL levert 90) — dat is
*eerlijker geworden*, geen regressie.

## Open vraag voor Timo

De 100 steekproefrijen beoordelen kan op twee manieren, en dat is een echte keuze:

- **In de UI** (`/data/enrichment`), met de dev-server op de branch-string. Comfortabel, maar de
  app heeft geen guard: vergeet je de env, dan kijk je naar productie. Vereist een interlock —
  eerst via de gepoorde verbinding controleren dat de run-rij op de branch bestaat.
- **In de terminal**, via een uitdraai + verdict-script met de guard. Geen enkel ongepoord pad,
  maar 100 rijen beoordelen in een tabel in plaats van in een scherm.
