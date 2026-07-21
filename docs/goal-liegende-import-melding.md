# Goal: de UI moet slagen van falen kunnen onderscheiden

Fase 2 van `/goal liegende-import-melding`. Probleem en bewijs staan in
`docs/probleem-liegende-import-melding.md`. Dit document legt de gekozen aanpak
en de meetlat vast. Twee ontwerpers hebben onafhankelijk een aanpak gemaakt en
elkaar daarna bevraagd; hieronder staat wat die ronde heeft opgeleverd, inclusief
wat er is ingetrokken.

## 0. Drie runtime-feiten waar alles op rust

Alle drie geverifieerd in `node_modules/next` (16.2.10), niet aangenomen.

**F1 — een redirectende action rejectet, en de reducer navigeert daarna zelf.**
`server-action-reducer.js:215-234` doet `reject(redirectError)` en valt daarna
door naar de navigatie. De rejection opeten breekt de navigatie dus **niet**.

**F2 — rethrowen levert hier niets op.** De error draagt `handled = true`, en een
rejection uit een async event handler bereikt sowieso nooit een React error
boundary (die vangen alleen render/lifecycle). `unstable_rethrow` zou hier alleen
een `unhandledrejection` opleveren. Het Next-advies "rethrow internal errors"
geldt voor render/RSC-context, niet voor een `onSubmit`.

**F3 — `NEXT_REDIRECT` is géén synoniem voor succes.** `lib/session.ts:11-13`:
elke action begint met `await requireSession()`, die `redirect("/login")` doet.
Een verlopen sessie — realistisch tijdens een OCR-run van honderden pagina's —
laat de action legitiem rejecten met `NEXT_REDIRECT;push;/login;307;`, terwijl er
**niets** is geïmporteerd (`requireSession()` staat vóór elke schrijfactie).

F3 is de scherpste vondst van de sparronde. Een naïeve `isRedirectError`-check in
de catch zou "Your import is complete" tonen aan iemand die zojuist is uitgelogd
— dezelfde leugen als de bug, precies omgekeerd. F3 bewijst óók dat het
`NEXT_REDIRECT`-kanaal niet weg te refactoren is: het draagt permanent zowel
"20 regels geïmporteerd" als "je bent uitgelogd".

## 1. Gekozen aanpak: classificeer op BESTEMMING, default = falen

De kernvraag was "hoe weet deze UI het verschil tussen slagen en falen". Het
antwoord is niet "is dit een redirect" maar **"waarheen redirect hij, en is dat
de bestemming die ik verwachtte"**.

Nieuw bestand `lib/next-action-result.ts` — puur, geen React, geen `"use client"`,
buiten de browser-harness unit-testbaar:

```ts
export type ActionOutcome<T> =
  | { kind: "arrived"; href: string }    // redirect naar de VERWACHTE route  → succes
  | { kind: "signedOut"; href: string }  // redirect naar /login              → sessie weg
  | { kind: "divertedTo"; href: string } // redirect ergens anders heen       → GEEN succes
  | { kind: "value"; value: T }          // de action antwoordde ({error} of void)
  | { kind: "failed"; error: unknown };  // netwerk, 500, notFound(), crash

export async function callAction<T>(
  run: () => Promise<T>,
  expect: { path: string },
): Promise<ActionOutcome<T>>
```

Vier regels die de aanpak dragen:

1. **Alleen een exacte padmatch met de verwachte route is succes** (`arrived`).
   Een whitelist, geen blacklist.
2. **Onbekende bestemming = falen.** De asymmetrie uit de vangrail is het hele
   argument: een ten onrechte gemelde mislukking kost een blik in de events-log;
   een ten onrechte gemelde slaging is het defect dat we repareren, en op het
   OCR-pad kost het geld.
3. **`NEXT_HTTP_ERROR_FALLBACK` is een fout, geen navigatie.** `notFound()`,
   `forbidden()` en `unauthorized()` uit een action moeten zichtbaar blijven.
   Dit is de reden dat `unstable_rethrow` níét als herkenner wordt gebruikt: die
   veegt redirect en access-fallback op één hoop (`is-next-router-error.js`).
   `unstable_rethrow` komt in de productiecode helemaal niet voor.
4. **Digest parsen zoals Next het zelf doet.** Niet `digest.split(";")[2]` — een
   href mag puntkomma's bevatten. Next' eigen `isRedirectError` doet
   `parts.slice(2, -2).join(";")`, en dat nemen we over, inclusief de validatie
   van `type` (`push`/`replace`) en de statuscode.

`callAction` bestaat naast het predicaat omdat de oorspronkelijke fout was dat
iemand `catch {}` schreef. Een `switch` op `kind` met `const _: never = outcome`
in de default compileert niet als je een tak vergeet. Dat is een mechanisme, geen
comment.

### Wat er is ingetrokken, en waarom

**Het action-contract omgooien** (`redirect()` eruit, `{ok:true,…}` erin, client
doet `router.push`) is voorgesteld, serieus gewogen en door de voorsteller zelf
ingetrokken. De doorslaggevende argumenten:

- `revalidatePath` + `redirect` zijn serverside één transactieafsluiting en de
  URL is de drager daarvan; splitsen introduceert een nieuwe race in precies het
  gebied dat we repareren;
- twee van de vierentwintig actions zouden afwijken, en juist de twee met de
  ingewikkeldste flow;
- het is de grootste denkbare diff in `app/projects/actions.ts`, terwijl de
  vangrail daar expliciet vanaf blijft;
- **beslissend:** door F3 komt `NEXT_REDIRECT` óók mét dat contract nog binnen.
  Het contract heeft de classificator dus evengoed nodig. De classificator is de
  ondergrens bij élk contract; het contract is dat niet.

Onderschreven als richting voor later: als deze codebase ooit één gedeeld
actie-resultaatcontract krijgt, is dat de juiste vorm — dan voor alle 24, niet
voor twee. Gaat als open eind naar `HANDOVER.md`, niet in deze fix.

Residu dat we bewust accepteren: het proptype blijft
`Promise<{error: string} | void>` terwijl `void` in productie onbereikbaar is.
Dat krijgt een comment op de typedefinitie die zegt wat er werkelijk gebeurt.

## 2. Wat de kaart toont — vier toestanden, en niets kan elkaar tegenspreken

De drie losse `useState`s (`busy`/`done`/`error`) worden één discriminated union.
Daarmee is "groene banner náást rode regel" structureel onmogelijk in plaats van
per ongeluk juist:

```ts
type CardStatus =
  | { kind: "idle" }
  | { kind: "busy"; text: string }
  | { kind: "handoff"; text: string }   // uitkomst bekend én goed; navigatie loopt
  | { kind: "error"; text: string };
```

- **`handoff` houdt input én knop disabled.** Zonder dat vuurt een ongeduldige
  gebruiker een tweede — betaalde — OCR-run af terwijl de eerste al slaagde.
- **De OCR-afrondmelding wordt voor het eerst bereikbaar op de deploy**,
  inclusief `"OCR finished — N of M pages failed (see the events log)"`. Dat is
  de belangrijkste enkele winst van deze fix, belangrijker dan het weghalen van
  de rode leugen.
- **Meldingen per tak zijn waar, niet generiek:**
  - `signedOut` bij import: *nothing was saved* — aantoonbaar waar, want
    `requireSession()` staat vóór elke schrijfactie.
  - `signedOut` bij `finishOcrAction`: *the pages that were read are saved …
    choose the same PDF to resume — already-read pages cost nothing extra*.
    Bij OCR is dat verschil niet cosmetisch: opnieuw uploaden kost geld,
    opnieuw inloggen niet.
  - `divertedTo` / `failed`: de onderliggende oorzaak gaat mee de UI in, anders
    zijn netwerkfout, 500 en "unexpected response" niet te onderscheiden.
  - Nergens nog "please try again" op een pad waar dat schadelijke raad is.

### De kaart moet ook weer schoon worden

De redirect gaat naar dezelfde route, dus de kaart remount niet en `handoff` zou
er eeuwig blijven staan met een dode knop — een blijvende groene leugen in ruil
voor een blijvende rode. Oplossing in `app/projects/[id]/page.tsx`: geef de kaart
een `key` afgeleid van de **searchParams** (`key={run ?? "idle"}`). De navigatie
wijzigt de key, React remount de kaart, client-state schoon, knop vrij. Nul
hooks, nul extra state.

> ⚠️ Die key mag **uitsluitend** van searchParams afhangen. `revalidatePath`
> vuurt bij élke OCR-tegel (`actions.ts:407`), dus de projectpagina rendert
> tijdens een lopende run voortdurend opnieuw. Een key die van dáta afhangt
> (regelaantal, `pendingOcr`, `updatedAt`) remount de kaart **midden in de
> OCR-lus** en doodt een betaalde run. Dit krijgt een comment ter plekke: het is
> een geladen wapen naast een lange lus.

Wat de key niet kan: detecteren dat de navigatie *uitblijft*. Geen navigatie =
geen nieuwe key = geen wipe. Daarom blijft er een minimale anti-hang: staat
`handoff` langer dan 10 s, dan groeit de tekst aan met *"Still opening the
results — the import itself is done; reload the page if this stays."* Vier regels,
en het is het eerste dat mag sneuvelen als we snoeien. Zonder dat vangnet is een
misgrepen classificatie een stille hang, en dat is in strijd met de vangrail.

## 3. De faaltelling mag niet verdampen

`"2 of 31 pages failed"` staat in clientstate 200–2000 ms op het scherm en wordt
dan door de key-remount actief gewist. Dat is precies het feit waarop gehandeld
moet worden; ephemere clientstate is er de verkeerde bewaarplaats voor.

Twee routes overwogen:

- `&failed=N` in de redirect-URL van `finishOcrAction` + één zin in de banner.
  Duurzaam, maar raakt `app/projects/actions.ts` — de vangrail.
- **Gekozen:** de telling server-afleiden op de importrun-pagina
  `/projects/<id>/import/<run>`, die al bestaat, al vanuit de banner gelinkt
  wordt en read-only is. Per gefaalde tegel wordt al een event gelogd
  (`pdf-upload-card.tsx:209`). Server-afgeleid in plaats van client-beweerd,
  permanent, overleeft een refresh, en raakt geen enkele action.

**Te verifiëren vóór de bouw:** de `entityId` van het faal-event moet de run zijn,
anders is de telling niet per run te maken. Dat is een leesquery, geen wijziging.
Blijkt het niet te kunnen, dan gaat de duurzame telling **niet** stiekem terug
naar clientstate maar als benoemd open eind naar `HANDOVER.md` — met `&failed=N`
als voorstel dat expliciet aan Timo wordt voorgelegd, niet in een diff verstopt.

## 4. Bewijsvoering: de stub moet aantoonbaar echt zijn

De hele testschuld is één zin: **er bestaat geen stub die een geslaagde,
redirectende action nabootst zoals Next hem werkelijk aflevert.** De stubs doen
`async () => {}` — een nette resolve, het enige geval dat Next nooit produceert.

**De fixture wordt niet met de hand geschreven.** Geen zelfgetypte digest-string,
maar Next' eigen `redirect()` uit `next/navigation`, waarvan we de throw vangen:
dan is de fixture per constructie een echte Next-redirect-error. Geverifieerd dat
dit werkt: `digest = "NEXT_REDIRECT;push;/projects/d1?pdf=20&run=r1;307;"`,
`message = "NEXT_REDIRECT"`, en Next' eigen `isRedirectError` accepteert hem.

Daarbovenop een **anker-test** die de fixture aan Next' eigen oordeel vastpint,
plus een negatieve: een `notFound()`-error moet door onze classificator als
**falen** worden geclassificeerd. Drijft Next weg bij een upgrade, dan wordt deze
test rood — precies het signaal dat vorige keer ontbrak.

### Rood-eerst, aantoonbaar in de geschiedenis

Het sterkste enkele idee uit de sparronde. Elke push naar main deployt, dus main
mag geen moment rood zijn; daarom in twee commits:

1. **Commit 1** landt de nieuwe tests, waarbij de tests die het gat meten als
   `test.fails(...)` staan. Vitest laat die slagen zólang de assert faalt — main
   blijft groen, de deploy is veilig, en de commitboodschap citeert de faalregels.
   Slaagt zo'n test al vóór de fix, dan meet hij het gat niet en moet hij
   herschreven worden. Dat is de zelfcontrole.
2. **Commit 2** landt de fix en flipt `test.fails` → `test` in dezelfde diff.

Wie de geschiedenis leest ziet letterlijk: dit was rood, dit maakte het groen.

### De stubs

| # | stub | scenario | verwacht |
|---|---|---|---|
| 1 | `KaartMetRedirectendeImport` | `importAction` rejectet met de echte redirect-error naar `/projects/d1?pdf=20&run=r1&route=leesroute` | geen alert, géén "Import failed", handoff-tekst, formulier disabled |
| 2 | `KaartMetRedirectendeFinishOcr` | happy loop, `finishOcrAction` rejectet met redirect | "OCR finished — opening the results…", geen alert |
| 3 | `KaartMetOcrGefaaldePaginas` | 3 pagina's, 2× `{failed}`, finish rejectet met redirect | **"OCR finished — 2 of 3 pages failed"** — de regel die nog nooit op een scherm heeft gestaan |
| 4 | `KaartMetSessieRedirect` | `finishOcrAction` rejectet met redirect naar `/login` | sessie-melding; **nooit** "complete"/"finished"; geen verzonnen telling |
| 5 | `KaartMetOnverwachteBestemming` | redirect naar `/data/brands` | falen (default-deny), href in de melding |
| 6 | `KaartMetNetwerkfout` | `TypeError("Failed to fetch")` | zichtbare alert mét oorzaak — de negatieve controle |
| 7 | `KaartMetNotFound` | action gooit een `NEXT_HTTP_ERROR_FALLBACK`-error | zichtbare alert (géén stille navigatie) |
| 8 | `KaartMetCrashInLoop` | `ocrPageAction` gooit halverwege een gewone `Error` | zichtbare fout mét hoeveel pagina's al gedaan zijn |

Stub 6 is de negatieve controle en **mag niet op de nieuwe formulering
asserteren** — anders wordt hij ook rood en bewijst hij niets. Hij assert op
invarianten die vóór én na de fix gelden: er ís een `role="alert"`, hij is niet
leeg, en de kaart staat niet in een succestoestand. Groen vóór, groen ná.

### Vaste asserts per succes-test

1. positief: de eerlijke tekst staat er;
2. negatief, en dit ís de regressie: `not.toContain("Import failed")`;
3. geen alert in de kaart, via de `container` van `renderServer` — niet
   `page.getByRole("alert")`, want die is ambigu door Next' route-announcer (die
   les staat al in het testbestand op regel 303).

Plus één sampler-test (patroon staat al in het bestand, regel 343-353) die vanaf
de klik tot de handoff-tekst elke 25 ms `input.disabled` bemonstert en
`every(s => s.disabled)` assert. Een tweede betaalde OCR-run wordt daarmee
aantoonbaar onmogelijk in plaats van beweerd.

### Screenshots

Huisregel licht/donker × mobiel/desktop, in de bestaande `screens`-lus:

- `project-import-handoff` — de gerepareerde bug, naast de oude schermafdruk te
  leggen (4 PNG's);
- `project-import-error` — een échte fout in het rood. Er bestaat vandaag **geen
  enkele** screenshot met een `text-destructive`-alert erin; het contrast in dark
  mode is nooit bekeken (4 PNG's);
- `project-ocr-done-failures` — de faaltelling, één losse licht/desktop-shot naar
  het model van de bestaande `project-ocr-progress`-test.

De stubs rejecten maar navigeren niet (de testomgeving heeft geen router), dus de
toestand staat stil en de screenshots zijn stabiel — geen hangende promises nodig.

## 5. De meetlat

Fase 3 is af als élk punt hieronder aantoonbaar is.

| # | eis | bewijs |
|---|---|---|
| M1 | Een geslaagde import toont geen alert en nergens "Import failed" | stub 1 |
| M2 | `"N of M pages failed"` verschijnt voor het eerst | stub 3 |
| M3 | Verlopen sessie → sessie-melding, nooit "complete", geen verzonnen telling | stub 4 |
| M4 | Onbekende redirect-bestemming = falen (default-deny) | stub 5 |
| M5 | `notFound()`/`forbidden()` uit een action blijft zichtbaar | stub 7 |
| M6 | Netwerkfout / onverwacht antwoord blijft zichtbaar, mét oorzaak | stub 6 |
| M7 | Crash in `runOcrLoop` is zichtbaar i.p.v. generiek | stub 8 |
| M8 | Alle §6 A/B/C-fouten nog zichtbaar; **geen bestaande test gewijzigd** | bestaande suite ongewijzigd groen |
| M9 | Formulier blijft disabled tussen resolve en paint | sampler-test |
| M10 | Kaart-state reset na navigatie; key hangt alleen van searchParams af | key + comment |
| M11 | Fixture is per constructie een echte Next-redirect | anker-test |
| M12 | Rood-eerst zichtbaar in de geschiedenis | commit 1 → commit 2 |
| M13 | `bun vitest run` volledig groen, `tsc` schoon | draaien |

**M8 is de tripwire.** Alle §6 A/B/C-gevallen zijn al gedekt door de bestaande
zeven tests. Moet een bestaande assert worden afgezwakt om de suite groen te
krijgen, dan klopt de fix niet — en dat is precies de faalmodus die deze bug
heeft gemaakt.

Vangrail-bevestiging: `app/projects/actions.ts` wordt **niet** gewijzigd. De
wijzigingen zitten in `lib/next-action-result.ts` (nieuw),
`components/dossier/pdf-upload-card.tsx`, `app/projects/[id]/page.tsx` (één
`key`-attribuut), de teststubs en het testbestand — plus mogelijk de read-only
importrun-pagina voor §3.

## 6. Welk model bouwt fase 3

**Opus 4.8.** Beide ontwerpers kwamen daar samen uit; de één gaf zijn voorkeur
voor een lichter model expliciet op.

Het argument is niet de omvang — dat is enkele honderden regels en grotendeels
mechanisch — maar de aard van het risico. Deze bug bestaat doordat een test loog.
De karakteristieke faalmodus van een lichter model onder een weerbarstige
browser/RSC-harness is een assert afzwakken of een `waitFor` verlengen tot de
balk groen is. Dat reproduceert hier exact het defect dat we repareren, in
hetzelfde bestand, onzichtbaar van buiten. Daarbij is deze harness aantoonbaar
kribbig (hydratatie-wachtlus, DOM-sampler op 25 ms, tegelregistratie via `window`
omdat een module-export als client-referentie aankomt), en de subtiliteiten F1–F3
moet je vasthouden terwijl je iets anders doet. De inzet is asymmetrisch: wat
tokens tegenover een tweede stille leugen op een pad dat per run geld kost.
