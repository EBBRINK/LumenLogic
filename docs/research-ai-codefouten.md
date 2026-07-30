# Research: waar AI-geschreven code in dit project systematisch misgaat

**Gemeten tegen** `origin/main` @ `a1985a6` ("Briefing 3.1"), 30 juli 2026.
**Meetmethode:** statisch (grep/AST-achtige tellingen over 321 TS/TSX-bestanden) + dynamisch
(read-only `psql` en `EXPLAIN (ANALYZE, BUFFERS)` op de productie-Neon, plus timings via `bun run`
tegen de echte database). Er is niets gewijzigd, gefixt of geschreven buiten dit document.
**Waarschuwing over houdbaarheid:** een parallelle sessie werkt in `components/`, `app/projects/`,
`app/data/` en `lib/repo/`. Regelnummers hieronder gelden voor `a1985a6`; bij twijfel eerst
`git log -L` op de genoemde regel.

Dit document is het voorwerk voor **sprint 2.5 (besluit G25)**. Deel 1 is bedoeld als afvinkraster
voor de reviewzwerm: elk item heeft een code (`TRG-*`, `SEC-*`, `KST-*`), een herkenningspatroon en
een concreet grep-commando. Deel 2 is wat er van dat raster in déze codebase daadwerkelijk aanslaat.

---

## Samenvatting in vijf regels

1. **Autorisatie is in dit project alleen authenticatie.** 65 van de 66 server actions checken
   "ben je ingelogd"; **geen enkele** checkt "is dit object van jou" of "mag jouw rol dit". Rollen
   bestaan als data en sturen alleen de landingspagina. Vandaag onschadelijk (0 orgs, 3 gebruikers),
   in week 3 de grootste bug van het project.
2. **Eén action is helemaal onbeschermd**: `requestPriceAction` schrijft naar de database zonder
   enige sessie-eis.
3. **`getAllBrandCompleteness` is met afstand de duurste query**: 8.803 ms koud / 1.320 ms warm,
   tegen 161 ms voor al het andere op diezelfde pagina.
4. **Nul foutgrenzen, nul Suspense, nul `loading.tsx`** in 38 pagina's. Eén kapotte rij = witte 500.
5. **Nul inputvalidatie**: geen zod, geen schema, geen `safeParse` in de hele codebase. Alle 66
   actions vertrouwen rauwe `FormData`.

Wat verrassend góed is en de zwerm dus kan overslaan: geen SQL-injectie, geen `NEXT_PUBLIC_`-lek,
geen open redirect, geen CSRF-gat, geen `use client` te hoog in de boom, één (1) `as any` in de hele
niet-test-codebase, en een LLM-kostenlaag met reservering, per-run-plafond, maandplafond en timeouts
die beter is dan wat je in dit soort projecten normaal aantreft. Zie [§2.4](#24-negatieve-bevindingen).

---

# Deel 1 — De checklist

Per item: **wat het is**, **waaraan je het herkent**, **hoe je erop grept**. Bedoeld om af te vinken.
De status-kolom is mijn meting op `a1985a6` — de zwerm hoeft die niet te herhalen, wel te
controleren of hij nog klopt na de sprint-2.4-wijzigingen.

## 1.1 Traag

| ID | Failure mode | Status hier |
|---|---|---|
| TRG-01 | N+1: query per rij in een lus | **RAAK** (5×) |
| TRG-02 | Sequentiële `await` waar `Promise.all` hoort | **RAAK** (15 pagina's) |
| TRG-03 | Ontbrekende index op een FK/filterkolom | **RAAK** (21 FK's) |
| TRG-04 | `SELECT *` / over-fetching | **RAAK, laag risico** (70×) |
| TRG-05 | Hele tabel laden zonder paginering | **RAAK, latent** |
| TRG-06 | Ontbrekende caching-/`revalidate`-strategie | **RAAK, bewust?** |
| TRG-07 | `"use client"` te hoog in de boom | schoon |
| TRG-08 | Te grote clientbundle | niet gemeten |
| TRG-09 | Aggregatie over de hele tabel per paginaweergave | **RAAK** (de duurste) |

### TRG-01 — N+1: een query per rij in een lus
**Wat:** een lijst ophalen en dan per element nóg een query doen. AI-modellen produceren dit
structureel omdat de lus-vorm leesbaarder oogt dan een join, en Drizzle's syntax lijkt genoeg op
gewoon JavaScript dat het niet als query voelt ([Drizzle-docs][drizzle-perf]).
**Herkennen:** `for (const x of ...)` of `.map(async ...)` met een `await db.` / `await get*()`
erbinnen. Ook de "onzichtbare" variant: een repo-functie in de lus die zélf query't.
**Greppen:**
```bash
grep -rn -A6 "for (const\|for (let\|\.map(async" lib app --include="*.ts" --include="*.tsx" | grep -v "\.test\." | grep -E "await (db|get|list|find|run|count)"
```
**Nuance bij het beoordelen:** `.map(async)` binnen één `Promise.all` is N queries maar wél
parallel — dat is een mildere variant dan een `for`-lus. Beoordeel ze niet gelijk.

### TRG-02 — Sequentiële `await`s waar `Promise.all` hoort
**Wat:** onafhankelijke fetches na elkaar in plaats van naast elkaar. In een RSC is dit een
server-side waterval die één-op-één in TTFB doorwerkt.
**Herkennen:** drie of meer `const x = await ...` op top-level van een `page.tsx` zonder dat de
tweede de eerste nodig heeft.
**Greppen:**
```bash
for f in $(find app -name "page.tsx"); do n=$(grep -c "^  const .* = await " "$f"); p=$(grep -c "Promise.all" "$f"); [ "$n" -ge 3 ] && echo "$n awaits / $p Promise.all — $f"; done
```
**Vals-positief:** `await params` en `await searchParams` (Next 16) tellen niet mee — die zijn
gratis. En een `await requireSession()` vóór de rest is bewust serieel.

### TRG-03 — Ontbrekende index op een FK- of filterkolom
**Wat:** Postgres legt **geen** index aan op de *refererende* kant van een foreign key. Drizzle's
`.references()` dus ook niet. Elke `where(eq(t.fkKolom, x))` wordt daarmee een seq scan.
**Herkennen:** kolom die in `where`/`join` voorkomt maar niet in `pg_indexes`.
**Greppen (statisch):**
```bash
grep -n "index(\|uniqueIndex(" db/schema.ts
grep -h "CREATE INDEX\|CREATE UNIQUE INDEX" db/migrations/*.sql
```
**Meten (levend, betrouwbaarder — `schema.ts` en de DB lopen hier uiteen, zie SEC-07):**
```bash
psql "$DATABASE_URL" -c "SELECT tablename, indexname FROM pg_indexes WHERE schemaname='public' ORDER BY 1,2;"
```

### TRG-04 — `SELECT *` / over-fetching
**Wat:** `db.select()` zonder kolomlijst haalt élke kolom op. Op brede tabellen kost dat bandbreedte
en verhindert het index-only scans; erger is dat het per ongeluk interne velden naar een client
component kan doorlaten (zie SEC-05).
**Greppen:**
```bash
grep -rn "\.select()" lib app db --include="*.ts" | grep -v "\.test\."
```

### TRG-05 — Hele tabel laden zonder paginering
**Wat:** `listX(db)` zonder `limit`. Werkt prima bij 13 rijen, valt om bij 130.000.
**Greppen:** vind list-functies en kijk of er een `.limit(` in dezelfde functie staat.
```bash
grep -rn "export async function list\|export async function getAll" lib/repo/*.ts | grep -v "\.test\."
```
**Beoordelingsregel:** koppel elke lijst aan de gróéirichting van zijn tabel. Een lijst over
`brands` (436, stabiel) is geen bevinding; een lijst over `events` (groeit per zoekactie — ijzeren
regel 5) is er wél een.

### TRG-06 — Ontbrekende caching-/`revalidate`-strategie
**Wat:** geen `revalidate`, geen `unstable_cache`, geen `"use cache"`. Elke render doet elke query
opnieuw. Let op de subtiliteit: zodra een pagina `headers()` aanroept (wat `requireSession()` doet)
is hij sowieso dynamisch — caching moet dan op *dataniveau*, niet op routeniveau.
**Greppen:**
```bash
grep -rn "export const revalidate\|export const dynamic\|unstable_cache\|revalidateTag\|\"use cache\"" app lib
```

### TRG-07 — `"use client"` te hoog in de boom
**Wat:** een hele pagina of layout als client component; alle RSC-winst weg, alle data door de
bundle.
**Greppen:**
```bash
for f in $(grep -rl '"use client"' app components); do echo "$(wc -l < $f) $f"; done | sort -rn
```
**Beoordelingsregel:** `"use client"` in `app/**/page.tsx` of `layout.tsx` = altijd bekijken.
In `components/**` = normaal, mits het bestand geen data ophaalt.

### TRG-09 — Aggregatie over de hele tabel per paginaweergave
**Wat:** een scorecard/dashboard dat live `count(*) FILTER (...)` over een grote tabel doet bij
élke weergave, in plaats van een materialized view of een periodieke job.
**Herkennen:** `count(*) filter` of `sql\`count(` in een repo-functie die vanaf een `page.tsx` wordt
aangeroepen; extra alarm bij een **gecorreleerde** subquery (`EXISTS (... WHERE x = buitentabel.id)`)
— die draait één keer per rij van de buitentabel.
**Greppen:**
```bash
grep -rn "count(\*) filter\|EXISTS (" lib/repo/*.ts | grep -v "\.test\."
```
**Meten:** `EXPLAIN (ANALYZE, BUFFERS)` en kijk naar `loops=` onder `SubPlan`. Meer dan ~1.000 loops
is per definitie een probleem.

## 1.2 Onveilig

| ID | Failure mode | Status hier |
|---|---|---|
| SEC-01 | **IDOR: geen objectniveau-autorisatie** | **RAAK — systemisch** |
| SEC-02 | Server action zonder auth | **RAAK** (1×) |
| SEC-03 | Server action zonder inputvalidatie | **RAAK — 63/63** |
| SEC-04 | Rolcheck bestaat als UI, niet als poort | **RAAK — systemisch** |
| SEC-05 | Te brede props naar een client component | **RAAK, laag risico** |
| SEC-06 | Secrets in de clientbundle (`NEXT_PUBLIC_`) | schoon |
| SEC-07 | Schema-drift: code ≠ migratie ≠ database | **RAAK** (3 soorten) |
| SEC-08 | Raw SQL zonder parameterbinding | schoon (expliciet geborgd) |
| SEC-09 | Rate limiting op auth-endpoints | **deels — zie tekst** |
| SEC-10 | Onveilige redirect | schoon |
| SEC-11 | CSRF bij server actions | schoon (Next-ingebouwd) |

### SEC-01 — IDOR: wél ingelogd checken, níét of het object van jou is
**Wat:** dit is de belangrijkste. Het onderzoek is hier eenduidig: naarmate een AI-gegenereerde
applicatie complexer wordt, verschuift het dominante gat van injectie naar autorisatie —
autorisatiefouten waren goed voor 28% van de geverifieerde bevindingen in grotere gegenereerde
applicaties, tegen 11% in kleine ([CSA][csa]). De achterliggende reden is mechanisch: het model
bouwt het endpoint dat de rij teruggeeft, maar zelden de check dat de aanroeper hem mag hebben
([ZeroPath][zeropath]). Next.js noemt het patroon zelf expliciet in zijn auditparagraaf: *"Does the
action check ownership of the resource (authorization, not just authentication)?"* ([Next.js
data-security guide][nextsec]).
**Herkennen:** een action of repo-functie die een ID uit `FormData`/`params` haalt en dat ID direct
in een `where(eq(t.id, ...))` stopt, zonder een tweede predicaat dat de aanroeper aan het object
bindt.
**Greppen — twee sweeps:**
```bash
# 1. actions die een ID uit de client lezen
grep -rn "formData.get(\"\(.*Id\)\")" app --include="*.ts" | grep -v "\.test\."
# 2. repo-functies waarvan de where ALLEEN op id filtert
grep -rn -A3 "\.from(" lib/repo/*.ts | grep -v "\.test\." | grep "\.where(eq(" | grep -v "orgId\|userId\|ownerId\|actor"
```
**Afvinkregel voor de zwerm:** een functie is pas goed als de `where` *óf* een eigenaarspredicaat
bevat, *óf* de aanroeper bewijsbaar al gecontroleerd heeft dat het bovenliggende object van de
gebruiker is. "De UI toont die knop toch niet" telt niet — de action is een publiek POST-endpoint.

### SEC-02 — Server action zonder auth
**Wat:** elke geëxporteerde `async function` in een `"use server"`-bestand is een publiek
HTTP-endpoint. Next.js' eigen documentatie: *"even if a Server Action or utility function is not
imported elsewhere in your code, it can still be called externally"*, en een auth-check op
paginaniveau strekt zich **niet** uit tot de actions op die pagina ([Next.js][nextsec]). De
`ActionId`-versluiering is een drempel, geen slot — er is een advisory geweest over het lekken van
juist die interne endpoint-identifiers ([GHSA-955p-x3mx-jcvp][ghsa]).
**Greppen:**
```bash
for f in $(grep -rl '"use server"' app lib); do
  echo "── $f"; awk '/^export async function/{print "   "NR": "$0}' "$f"
  echo "   guards: requireSession=$(grep -c requireSession $f)"
done
```
**Afvinkregel:** het aantal `requireSession()`-aanroepen moet ≥ het aantal `export async function`
zijn. Is het lager, dan zit er minstens één ongewapende action in.

### SEC-03 — Server action zonder inputvalidatie
**Wat:** `FormData` is volledig door de client te bepalen. Zonder schema kun je elk veld elke
waarde geven, ook velden die het formulier niet toont.
**Greppen:**
```bash
grep -rln "safeParse\|z.object\|\.parse(" $(grep -rl '"use server"' app lib)
```
(Leeg resultaat = geen enkele action valideert.)

### SEC-04 — Rolcheck bestaat als UI, niet als poort
**Wat:** rollen worden opgeslagen en gebruikt om te bepalen wát je te zien krijgt, maar nooit om te
bepalen wát je mag doen. Klassieke AI-uitkomst: het model implementeert de rol als *presentatie*.
**Greppen:**
```bash
grep -rn "roles\|Role\|isAdmin\|org_admin" app lib --include="*.ts" --include="*.tsx" | grep -v "\.test\."
```
**Afvinkregel:** komt een rolwaarde voor in een `if` die tot een `throw`/`redirect`/`403` leidt?
Zo nee, dan is de rol decoratie.

### SEC-05 — Te brede props naar een client component
**Wat:** een volledige DB-rij als prop naar een `"use client"`-component. Alles erin belandt in de
RSC-payload in de browser, ook kolommen die de UI niet gebruikt — voor dit project bijvoorbeeld
inkoopprijzen of marges (ijzeren regel 1 en 2). Next.js noemt dit in zijn auditlijst als *"Are the
Component props expecting private data? Are the type signatures overly broad?"* ([Next.js][nextsec]).
**Greppen:**
```bash
# client components die een heel record-type als prop accepteren
grep -rn -B2 -A8 '"use client"' components app --include="*.tsx" | grep -E "props|: *\{ *\w+: *(typeof|InferSelect)"
```

### SEC-06 — Secrets in de clientbundle
**Wat:** `NEXT_PUBLIC_`-variabelen worden bij build letterlijk in de JS-bundle geplakt. Een key daar
is permanent publiek voor elke gecachete build.
**Greppen:**
```bash
grep -rn "NEXT_PUBLIC" app lib components next.config.ts
for f in $(grep -rl '"use client"' app components lib); do grep -Hn "process.env" "$f"; done
```

### SEC-07 — Schema-drift: `schema.ts` ≠ migratie ≠ database
**Wat:** Drizzle's `schema.ts` is de *typebron*, de migraties zijn de *waarheid*. Loopt dat uiteen,
dan liegen de types over wat de database afdwingt. AI-sessies produceren dit doordat ze schema en
migratie in aparte beurten schrijven.
**Greppen/meten:**
```bash
psql "$DATABASE_URL" -c "\d+ <tabel>"      # echte constraints & indexen
grep -n "references(" db/schema.ts          # gedeclareerde FK's
grep -n "REFERENCES" db/migrations/*.sql    # afgedwongen FK's
```
**Afvinkregel:** drie lijsten moeten dekkend zijn — FK's in de DB, `.references()` in `schema.ts`,
en `index()` in `schema.ts` versus `pg_indexes`.

### SEC-09 — Rate limiting op auth-endpoints
**Wat:** Better Auth zet rate limiting standaard aan in productie en uit in development
([Better Auth][ba-rl]). Twee kanttekeningen die je moet controleren in plaats van aannemen: de
default-store is *in-memory*, wat op een serverless platform per lambda-instantie resettet, en er is
een gerapporteerd geval geweest waarin rate limiting op magic-link-flows niet aansloeg (inmiddels
gesloten, [issue #3264][ba-3264]).
**Greppen:**
```bash
grep -n "rateLimit\|storage\|secondaryStorage" lib/auth.ts
```

### SEC-10 — Onveilige redirect
**Greppen:**
```bash
grep -rn "redirect(" app lib --include="*.ts" --include="*.tsx" | grep -v 'redirect("' | grep -v "redirect('"
```
**Afvinkregel:** een redirect is veilig zolang het pad begint met een **letterlijk** `/segment/` en
de variabele daarna staat. `redirect(userInput)` of `redirect(\`${base}...\`)` waarbij `base` uit de
request komt, is een gat.

### SEC-11 — CSRF bij server actions
Next.js dwingt POST af, vergelijkt `Origin` tegen `Host`/`X-Forwarded-Host` en breekt bij mismatch af
([Next.js][nextsec]). Handmatige CSRF-tokens zijn dus **niet** nodig. Alleen relevant als er een
reverse proxy op een ander domein voorkomt — dan hoort `serverActions.allowedOrigins` gezet te zijn.
Zet dit item op "n.v.t." zodra je hebt vastgesteld dat er geen proxy is; laat de zwerm er geen tijd
in steken.

## 1.3 Duur / onbetrouwbaar

| ID | Failure mode | Status hier |
|---|---|---|
| KST-01 | LLM-call zonder budgetplafond of timeout | schoon (voorbeeldig) |
| KST-02 | Geen foutgrens: één kapotte rij sloopt de pagina | **RAAK — 0 van 38** |
| KST-03 | Meerstapsschrijf zonder transactie | **RAAK — architectonisch** |
| KST-04 | Retry/dubbelklik zonder idempotentie | **RAAK** |
| KST-05 | Stil weggeslikte fout | **RAAK** (klein) |
| KST-06 | Onbegrensde groeitabel zonder retentie | **RAAK, latent** |

### KST-01 — LLM-call zonder plafond of timeout
**Wat:** een `fetch` naar een model zonder `max_tokens`, zonder timeout, zonder uitgavenregistratie.
Eén lus die vastloopt = een rekening.
**Greppen:**
```bash
grep -rn "max_tokens\|timeout\|AbortSignal\|maxRetries" lib/ai/*.ts
grep -rn "budget\|spend\|cost" lib/ai/*.ts lib/repo/settings.ts
```
**Afvinkregel — vier eisen, alle vier nodig:** (1) `max_tokens` per call, (2) een harde timeout,
(3) een plafond dat *vóór* de call wordt getoetst, (4) verbruik dat wordt weggeschreven zodat eis 3
iets te toetsen heeft. Bonus: een *reservering* vóór de call, zodat een timeout niet gratis is.

### KST-02 — Geen foutgrens
**Wat:** zonder `error.tsx` levert één throw in één rij een volledige 500 op. Zonder `<Suspense>`
wacht de hele pagina op de traagste query. Beide zijn puur toevoeg-werk dat AI-sessies overslaan
omdat de happy path werkt.
**Greppen:**
```bash
find app -name "error.tsx" -o -name "global-error.tsx" -o -name "loading.tsx"
grep -rn "<Suspense" app components
```

### KST-03 — Meerstapsschrijf zonder transactie
**Wat:** insert → insert → update zonder `db.transaction()`. Faalt stap 2, dan blijft stap 1 staan.
**Let op de driver:** de `neon-http`-driver **ondersteunt geen transacties**; `db.transaction()`
gooit daar. Tests op PGlite slagen wel. Dat is een valkuil waar je op moet letten voordat je dit als
"gewoon toevoegen" afdoet — het vraagt een driverwissel (`neon-serverless`/WebSocket-pool).
**Greppen:**
```bash
grep -rn "\.transaction(" lib app db --include="*.ts" | grep -v "\.test\."
grep -rn -A12 "await db.insert" lib/repo/*.ts | grep -c "await db\.\(insert\|update\|delete\)"
```

### KST-04 — Retry/dubbelklik zonder idempotentie
**Wat:** een action zonder dedupe-sleutel; dubbelklik of retry maakt twee records.
**Greppen:**
```bash
grep -rn "onConflict\|idempotenc\|dedupe\|disabled={pending}\|useFormStatus" app lib components | grep -v "\.test\."
```
**Afvinkregel:** elke action die *aanmaakt* (geen update) heeft óf een `onConflictDoNothing/Update`,
óf een natuurlijke unieke sleutel, óf een UI die de knop tijdens de submit uitschakelt.

### KST-05 — Stil weggeslikte fout
**Wat:** `catch {}` of `catch { /* comment */ }`. De gebruiker ziet succes, er is niets gebeurd.
Verzwarend als de `catch` breder is dan de fout die hij bedoelt op te vangen.
**Greppen:**
```bash
grep -rn -A2 "} catch" app lib components --include="*.ts" --include="*.tsx" | grep -v "\.test\."
```

### KST-06 — Onbegrensde groeitabel
**Wat:** een log-/event-tabel zonder retentie, zonder index en zonder partitionering, waar het
product functioneel van afhangt.
**Meten:**
```bash
psql "$DATABASE_URL" -c "SELECT relname, reltuples::bigint, pg_size_pretty(pg_total_relation_size(oid)) FROM pg_class WHERE relkind='r' AND relnamespace='public'::regnamespace ORDER BY pg_total_relation_size(oid) DESC LIMIT 15;"
```

---

# Deel 2 — Bevindingen in deze codebase

Gerangschikt op **impact × moeite**. "Impact" is wat het nu of aantoonbaar binnenkort kost;
"moeite" is mijn inschatting van het herstelwerk.

## 2.1 Hoge impact

### B-01 · Geen enkele objectniveau-autorisatie in de hele applicatie · SEC-01/SEC-04
**Impact: hoog (week 3) · Moeite: groot**

Dit is de bevinding die de rest overschaduwt.

`lib/session.ts:10-14` is de enige poort die de applicatie kent:

```ts
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
```

Er is geen `requireRole`, geen `requireOrgAccess`, geen `assertOwnsDossier`. En er is nergens een
tweede poort die dat compenseert:

- **Elke repo-lees- en schrijffunctie filtert uitsluitend op primaire sleutel.**
  `lib/repo/dossiers.ts:21` — `listDossiers(db)` heeft **helemaal geen `where`**.
  `lib/repo/dossiers.ts:66-71` — `getDossier(db, id)` filtert alleen `eq(projectDossiers.id, id)`.
  `lib/repo/dossiers.ts:263-264` — `deleteSpecLine(db, specLineId)` verwijdert op ID, punt.
  Gemeten: van de **275** `.where(`-clausules in `lib/repo/*.ts` bevat er **1** een
  `orgId`/`userId`/`ownerId` — en dat is `lib/repo/orgs.ts:103`, dat een *membership* opzoekt, geen
  autorisatie afdwingt.
- **`orgId` bestaat, maar wordt door geen enkel leespad gebruikt.** De kolom staat er
  (`db/schema.ts:457`), er is een setter (`lib/repo/orgs.ts:113-117`, aangeroepen vanuit
  `app/projects/actions.ts:85`) — en verder niets. De enige plek waar `org_id` in een filter
  voorkomt is `lib/repo/analytics-tiles.ts:159/165/334`, en die parameter is per commentaar
  (`lib/repo/analytics-tiles.ts:16-18`) *"klaar voor week 3"*, niet in gebruik.
- **De rolpoort is gebouwd maar nergens aangesloten.** Dit is het scherpste detail van de hele
  bevinding. [lib/repo/orgs.ts:135-149](lib/repo/orgs.ts:135) bevat een correcte
  `hasRole(db, email, role)` — precies de primitieve die je nodig hebt — en die functie wordt
  **nergens aangeroepen**. `grep -rn "hasRole" app lib components` levert exact één treffer: de
  definitie zelf. De enige rolgebruiker die er wél is,
  [`defaultLandingForRoles`](lib/repo/orgs.ts:123), wordt aangeroepen vanuit
  [components/org/org-members.tsx:59](components/org/org-members.tsx:59) — om een **tekstlabel** te
  renderen. Er is in de hele codebase geen `if` op een rol die tot een weigering leidt.

  Dat maakt de rolpoort goedkoop te repareren: het ontbrekende stuk is niet de logica, alleen de
  aanroep.
- **De admin-acties zijn dus niet admin-only.** `app/admin/actions.ts:13`, `:23`, `:35` en
  `app/admin/brands/actions.ts:135/164/199/220` — waaronder `deleteBrandAction` — vragen alleen
  `requireSession()`. Elke ingelogde gebruiker kan merkuploads goedkeuren, afwijzen en merken
  verwijderen.
- **Membership is zelfbediening.** `app/settings/organization/actions.ts:45-58`: `addMemberAction`
  leest `orgId` en `email` rechtstreeks uit `FormData` en roept `addMembership` aan zonder te
  controleren of de aanroeper lid — laat staan `org_admin` — van die org is. Dat is letterlijk
  "voeg mezelf toe aan willekeurige organisatie X". Idem `removeMemberAction` (`:61-68`) en
  `saveBrandingAction` (`:73-87`, die zelfs rechtstreeks `db.update(organizations)` doet).

**Wat het nú kost:** niets aantoonbaars. Gemeten op productie: `0` organisaties, `0` memberships,
`13` dossiers waarvan `0` met een `org_id`, `3` gebruikers — en alle drie zijn Brink-intern via de
allowlist (`lib/auth.ts:21`). De applicatie is vandaag effectief single-tenant.

**Wat het in week 3 kost:** op de dag dat de eerste externe org een account krijgt, ziet die klant
in `/projects` álle dossiers van álle klanten én van Brink zelf, want `listDossiers` heeft geen
`where`. Dat is geen randgeval maar het eerste scherm na inloggen.

**Hoe ik het zou verhelpen:** één Data Access Layer zoals Next.js die voorschrijft
([Next.js][nextsec]) — `import "server-only"`, een gecachete `getCurrentUser()`, en repo-functies
die de scope als *verplicht* argument nemen in plaats van optioneel. Concreet als drie stappen:
1. `lib/session.ts` uitbreiden met `requireOrgScope()` die `{ userId, email, orgIds, roles }`
   teruggeeft — en die weigert in plaats van redirect als er geen scope is.
2. De signatuur van elke `lib/repo/*`-lees/schrijffunctie wijzigen van `(db, id)` naar
   `(db, scope, id)`, zodat de compiler elke aanroepsite aanwijst die nog niet gescoped is. Dat is
   het grote werk (±60 functies), maar het is *mechanisch* en TypeScript vindt ze allemaal.
3. Een testbestand dat per action bewijst dat een sessie zonder toegang een `Forbidden` krijgt —
   niet een lege lijst, want dat is niet te onderscheiden van "er is niets".

Stap 1 en de rolpoort op `app/admin/**` — die alleen nog aangesloten hoeft te worden op de
bestaande `hasRole` — zijn los te doen en zijn de goedkoopste risicoreductie.

---

### B-02 · `requestPriceAction` schrijft naar de database zonder enige sessie · SEC-02
**Impact: hoog · Moeite: klein**

Gemeten per functie (niet per bestand): van de **66** geëxporteerde server actions in `app/` roepen
er **65** `requireSession()` aan. `app/products/[id]/actions.ts:9-22`
is de enige uitzondering:

```ts
export async function requestPriceAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "").trim() || null;
  const brandId = String(formData.get("brandId") ?? "").trim() || null;
  if (!productId) return;
  const session = await getSession();          // ← gelezen, niet afgedwongen
  await createLead(db, { productId, brandId, userEmail: session?.user?.email ?? null });
  redirect(`/products/${productId}?pricerequest=sent`);
}
```

`getSession()` (`lib/session.ts:6`) redirect niet — hij geeft `null` terug en de action loopt door.
`userEmail` wordt dan `null` en er wordt alsnog een lead aangemaakt.

Dit is een schrijvend, publiek POST-endpoint zonder authenticatie, zonder rate limiting en zonder
validatie van `productId`/`brandId` (elke string gaat erin; `leads.product_id` heeft bovendien geen
index, zie B-04). Wie de action-ID heeft — en die staat in de clientbundle van de productpagina —
kan de `leads`-tabel onbeperkt volschrijven. Dat is meteen ook een gegevenskwaliteitsprobleem: leads
zijn commercieel opvolgingsmateriaal voor Brink.

**Hoe ik het zou verhelpen:** `getSession()` → `requireSession()`, plus een `onConflictDoNothing` op
(`product_id`, `user_email`) zodat dubbelklikken geen dubbele lead maakt. Als het gate-formulier
bewust ook voor uitgelogde bezoekers moet werken (dat zou een productbesluit zijn, geen bug), dan
hoort er rate limiting en een unieke sleutel omheen. Dat verschil is de moeite van het navragen
waard vóór iemand het "fixt" — ik heb in `docs/` geen besluit gevonden dat dit endpoint publiek
verklaart.

---

### B-03 · `getAllBrandCompleteness`: 8.803 ms koud, 1.320 ms warm · TRG-09
**Impact: hoog · Moeite: middel** — *bekende bevinding, hierbij bevestigd en gepreciseerd*

Gemeten via `bun run` tegen productie:

| functie op `/data/brand-relations` | koud (1e call) | warm (mediaan van 3) |
|---|---|---|
| **`getAllBrandCompleteness`** | **8.803 ms** | **1.320 ms** |
| `listBrandRelations` | 893 ms | 161 ms |

Beide draaien in één `Promise.all` ([app/data/brand-relations/page.tsx:25-28](app/data/brand-relations/page.tsx:25)),
dus de paginalatentie ís deze functie. Neon suspendeert bij inactiviteit, dus koud is voor een
pagina die je een paar keer per dag opent de realistische meting, niet de uitschieter.

Wat de query doet ([lib/repo/brand-relations.ts:262-272](lib/repo/brand-relations.ts:262)): één
`GROUP BY brand_id` over `products` (**211.310 rijen, 116 MB**) met — gemeten, niet geschat —
**71 `count(*) FILTER (...)`-expressies per groep**, plus de prijstegel als **gecorreleerde**
`EXISTS`-subquery ([:203-206](lib/repo/brand-relations.ts:203)). Resultaat: 33 merken.

De `EXPLAIN (ANALYZE, BUFFERS)` wijst de kostenpost aan:

```
->  Index Scan using products_brand_idx on products  (actual rows=211317 loops=1)
SubPlan 1
  ->  Nested Loop  (actual rows=1 loops=211317)      ← 211.317 keer
        Buffers: shared hit=1711154                  ← 1,7 miljoen buffers
Execution Time: 886.660 ms
```

De gecorreleerde subquery alleen al is 887 ms en 1,7 M buffer hits. Ter vergelijking: dezelfde
`GROUP BY` zónder aggregaten is 36 ms, en met een handvol `count(*) FILTER`-expressies 57 ms. De
filters zijn dus goedkoop; de **per-rij-subquery** is de helft van de warme tijd, en de
211k-rij-scan met 71 aggregaten de andere helft.

**Hoe ik het zou verhelpen** (oplopend in moeite, elk afzonderlijk zinvol):
1. De gecorreleerde `EXISTS` vervangen door een geaggregeerde join —
   `LEFT JOIN (SELECT DISTINCT product_id FROM prices) p ON p.product_id = products.id` — één scan
   in plaats van 211.317 lookups. Kleinste ingreep, grootste enkele winst.
2. De hele scorecard in een **materialized view** met een refresh op het importpad. Het project
   heeft die vorm al (`mv_brand_considerations`, migratie `0008`), dus het patroon is bekend en de
   `REFRESH` past bij de bestaande importstap.
3. De pagina in een `<Suspense>` zetten zodat de merkenlijst (161 ms) rendert terwijl de scorecard
   nog laadt. Lost de traagheid niet op, maakt hem wel onzichtbaar — en KST-02 zegt dat er tóch
   Suspense-grenzen moeten komen.

**Kanttekening bij de bekende formulering:** het waren **71** count-expressies op `a1985a6`, niet 67
(er staan 4 eigen velden in `custom_fields`; de catalogus is dus meegegroeid). En het is technisch
geen "scan van de hele tabel" maar een index-scan op `products_brand_idx` — het probleem is niet het
scanpad maar de subquery-loops.

---

### B-04 · 21 van de 29 foreign keys hebben geen index; `events` en `spec_lines` hebben er nul · TRG-03
**Impact: hoog (groeiend) · Moeite: klein**

Gemeten tegen `pg_indexes` op productie. Drie hete tabellen hebben **uitsluitend hun primary key**:

```
events               → events_pkey            (id)          ← verder niets
spec_lines           → spec_lines_pkey        (id)          ← verder niets
project_dossiers     → project_dossiers_pkey  (id)          ← verder niets
quote_lines          → quote_lines_pkey       (id)          ← verder niets
```

Wat daarop gefilterd wordt zonder index:

| tabel.kolom | wie filtert erop | groeit met |
|---|---|---|
| `spec_lines.dossier_id` | `getSpecLines` ([lib/repo/dossiers.ts:130](lib/repo/dossiers.ts:130)), `linkQuantities` ([:215](lib/repo/dossiers.ts:215)) — elke projectpagina | aantal regels per project |
| `events.entity_id` | `analytics-tiles.ts:159` (in een `EXISTS` per event) | **elke zoekactie, match en offerte** (ijzeren regel 5) |
| `events.action` | `countEventsByAction` ([lib/repo/events.ts:35-39](lib/repo/events.ts:35)), alle analytics-tegels | idem |
| `events.created_at` | `recentEvents` ([lib/repo/events.ts:26](lib/repo/events.ts:26)) — `ORDER BY` zonder index | idem |
| `project_dossiers.org_id` | nog niemand — **week 3 gaat hier op filteren** | aantal klanten |
| `quote_lines.quote_id` | `getQuote` ([lib/repo/dossiers.ts:478](lib/repo/dossiers.ts:478)) | offerteregels |

De volledige lijst FK's zonder index: `ai_suggestions.product_id`,
`armaturenboek_versions.dossier_id`, `brand_aliases.brand_id`, `brand_uploads.brand_id`,
`enrichment_items.product_id`, `enrichment_runs.brand_id`, `import_runs.dossier_id`,
`leads.{brand_id,dossier_id,org_id,product_id}`, `llm_usage.import_run_id`,
`price_tiers.price_list_id`, `product_datasheets.product_id`, `spec_line_candidates.product_id`,
`substitution_proposals.{alternative_product_id,dossier_id,reference_product_id,spec_line_id}`,
`xis_exports.{dossier_id,quote_id}`.

**Wat het nú kost:** vrijwel niets. `events` = 1.380 rijen, `spec_lines` = 204. Postgres doet een seq
scan over 1.380 rijen sneller dan een index-lookup. **Dit is expliciet géén bevinding-om-nu-te-fixen
op grond van huidige latentie.** De reden dat hij hoog staat is de asymmetrie: een `CREATE INDEX
CONCURRENTLY` kost nu nul risico en tien minuten; over een jaar, met `events` als het fundament
onder het merk-analytics-verdienmodel, is `analytics-tiles.ts:159` (een `EXISTS` op `events` per
event) een tabelscan in een lus.

**Hoe ik het zou verhelpen:** de vijf uit de tabel hierboven nu aanleggen — `events(entity_id)`,
`events(action, created_at)`, `spec_lines(dossier_id)`, `project_dossiers(org_id)`,
`quote_lines(quote_id)` — in een migratie, en de rest laten wachten tot hun tabel groeit. En bij
`org_id` niet vergeten dat B-01 die kolom pas echt in gebruik neemt.

---

## 2.2 Middelhoge impact

### B-05 · Geen enkele foutgrens, Suspense-grens of loading-state in 38 pagina's · KST-02
**Impact: middel · Moeite: klein**

Gemeten: `find app -name "error.tsx" -o -name "global-error.tsx" -o -name "loading.tsx"` → **leeg**.
`grep -rn "<Suspense" app components` → **0 treffers**. Bij 38 `page.tsx`-bestanden.

Twee gevolgen:
1. **Eén throw = de hele pagina weg.** `getSpecLines` haalt 204 regels op met JSON-velden
   (`deviations`, `custom_values`); één rij met onverwachte inhoud die verderop een `.map` doet
   struikelen, en de gebruiker krijgt Next' kale foutpagina zonder navigatie terug. Voor een
   calculator midden in een offerte is dat verlies van werk.
2. **Elke pagina wacht op zijn traagste query.** Zonder Suspense is `/data/brand-relations` 8,8 s wit
   scherm (B-03), terwijl de merkenlijst er na 161 ms is.

**Hoe ik het zou verhelpen:** één `app/error.tsx` en één `app/global-error.tsx` als vangnet, plus
gerichte `error.tsx` in `app/projects/[id]/` en `app/data/` — dat zijn de segmenten met de meeste
afgeleide data. Daarna `<Suspense>` rond de zware blokken (B-03, B-06). Dit is puur toevoegwerk,
geen herstructurering, en het is de goedkoopste post in dit hele document.

### B-06 · N+1 in `work-prep`: één query van 412 ms per gematchte regel, serieel · TRG-01
**Impact: middel · Moeite: klein**

`app/projects/[id]/work-prep/page.tsx:55-62`:

```ts
for (const l of matched) {
  const referenceProductId = l.matchedProductId as string;
  const { alternatives } = await getEquivalentAlternatives(db, { ... });   // ← per regel
```

Een `for`-lus met een `await` erin, in de render van een RSC. `getEquivalentAlternatives` kost
**412 ms warm** (mediaan van 5, gemeten tegen productie). De regels zijn onderling onafhankelijk —
er is geen reden voor serieel.

Een werkvoorbereidingslijst van 30 gematchte regels is daarmee ~12 s, van 50 regels ~20 s, en met de
koude 595 ms per call loopt dat naar ~30 s. Vercel's functie-timeout maakt dat een 504, geen trage
pagina.

**Hoe ik het zou verhelpen:** `Promise.all(matched.map(...))` is een tweeregelige wijziging die dit
naar ~412 ms brengt ongeacht het aantal regels (tot de connectiepool-grens). Structureel beter is
één `getEquivalentAlternativesForMany(db, productIds)` met een `IN`-clausule.

Dezelfde vorm, mildere variant, staat op twee plekken in
`app/projects/[id]/review/page.tsx` (regels 104-116 en 122-131): daar zit de `map(async)` wél in een
`Promise.all`, dus parallel — nog steeds N queries, maar niet N × latentie. Prioriteit lager.

### B-07 · Sequentiële `await`-watervallen in 15 van de 38 pagina's · TRG-02
**Impact: middel · Moeite: klein**

Pagina's met drie of meer top-level `await`s zonder `Promise.all`:

| pagina | awaits | `Promise.all` |
|---|---|---|
| `app/projects/[id]/review/page.tsx` | 10 | 3 |
| `app/data/brand-relations/[brandId]/page.tsx` | 5 | 0 |
| `app/projects/[id]/line/[lineId]/page.tsx` | 5 | 2 |
| `app/projects/[id]/luminaire-schedule/versions/page.tsx` | 5 | 1 |
| `app/products/[id]/page.tsx` | 4 | 0 |
| `app/projects/[id]/page.tsx` | 4 | 0 |
| [app/brand/dashboard/page.tsx](app/brand/dashboard/page.tsx) | 4 | 0 |
| `app/projects/[id]/work-prep/page.tsx` | 4 | 0 |
| + 7 pagina's met 3 awaits | | |

Voorbeeld (`app/projects/[id]/page.tsx:34-40`): `getDossier` en
`getSpecLines` staan na elkaar terwijl `getSpecLines` alleen `id` nodig heeft, niet het resultaat van
`getDossier`. De `notFound()`-guard ertussen is de reden dat het serieel staat — die is te behouden
door beide parallel te starten en de guard na de `Promise.all` te doen.

**Hoe ik het zou verhelpen:** per pagina nagaan welke `await`s echt van elkaar afhangen. Wees hier
niet dogmatisch: bij queries van 20-40 ms is het verschil verwaarloosbaar en niet de review-tijd
waard. De moeite loont op `review/page.tsx` (10 awaits) en op pagina's die B-03 of B-06 aanroepen.
Dit item is voor de zwerm vooral nuttig als *meetopdracht*, niet als blinde herschrijving.

### B-08 · Nul inputvalidatie op 63 publieke endpoints · SEC-03
**Impact: middel · Moeite: middel**

Gemeten: `safeParse`, `z.object` en `.parse(` komen **nul keer** voor in de 16 `"use server"`-bestanden
(en nergens anders in `app/` of `lib/`). Er staat geen validatiebibliotheek in `package.json`. Alle
66 geëxporteerde actions lezen rauwe `FormData`.

Wat er in plaats daarvan is — en dat is beter dan niets — zijn ad-hoc coercers boven in
[app/projects/actions.ts:53-70](app/projects/actions.ts:53): `intOrNull`, `numOrNull`, `strOrNull`,
`asXisPhase`. `asXisPhase` doet zelfs een allowlist-check. Maar het patroon is per-veld en per-bestand,
dus het is *vergeetbaar*, en het valideert vorm zonder ooit een fout terug te geven: een ongeldige
waarde wordt stil `null`.

Concrete gevolgen die ik kan aanwijzen:
- **Geen lengtegrens.** `addSpecLineAction` ([app/projects/actions.ts:90-118](app/projects/actions.ts:90))
  accepteert een `fixtureCode` van willekeurige lengte. De enige grens in het project is de
  4 MB-bodylimit (`next.config.ts:11`) en een `PAGES_TEXT_CAP` van 5 MB
  ([app/projects/actions.ts:150](app/projects/actions.ts:150)) op één specifiek pad.
- **Geen UUID-vorm-check.** `dossierId` gaat als willekeurige string naar Drizzle. Drizzle bindt
  netjes (geen injectie), maar Postgres gooit op een ongeldige uuid-cast — en dankzij B-05 is dat een
  500 in plaats van een nette melding.
- **Ongeldige waarden worden stil genegeerd.** `asXisPhase` valt bij onbekende invoer terug op
  `"start"` in plaats van te weigeren. Voor een fase-aware applicatie waar "tender" bepaalt of
  alternatieven getoond worden (ijzeren regel 4) is een stille terugval naar een andere fase geen
  triviale keuze.

**Hoe ik het zou verhelpen:** één schema per action, gedeeld met de DAL uit B-01 — dat zijn twee
kanten van dezelfde wijziging en het is efficiënter ze samen te doen dan apart. Een `zod`-schema per
action, `safeParse`, en bij falen een `{ error }` via het bestaande `callAction()`-mechanisme
(`lib/next-action-result.ts`), dat al een kanaal voor foutmeldingen heeft.

### B-09 · Geen transacties, driver-bepaald · KST-03
**Impact: middel · Moeite: groot**

`db/client.ts:12` gebruikt `drizzle(neon(...))` — de **HTTP**-driver van Neon. Die ondersteunt geen
transacties. Dat is bekend en op vier plaatsen expliciet gedocumenteerd:
[lib/repo/template-return.ts:13](lib/repo/template-return.ts:13),
[lib/repo/custom-fields.ts:10](lib/repo/custom-fields.ts:10),
[lib/repo/price-archive.ts:109](lib/repo/price-archive.ts:109),
[lib/repo/ocr.ts:215-219](lib/repo/ocr.ts:215) — met de scherpe waarneming dat tests op PGlite
*wél* slagen en de productie dus stilletjes anders is.

Dit is dus geen AI-slip; het is een bewuste, goed vastgelegde beperking. Ik meld het toch, om twee
redenen:

1. **De consequentie is niet gemitigeerd.** Meerstapsschrijfacties draaien zonder rollback én
   zonder compenserende logica. `recordPdfImport` ([lib/repo/imports.ts:105-140](lib/repo/imports.ts:105))
   doet: insert `import_runs` → `addSpecLines` (insert N) → per regel `runMatcher` (delete + N
   inserts + N events) → insert event. Faalt de matcher halverwege, dan staat er een import-run met
   deels gematchte regels en geen enkel spoor dat het onvolledig is. Precies het scenario dat B-05
   tot een 500 maakt en de gebruiker doet herproberen — waarna B-10 toeslaat.
2. **De uitweg is bekend en niet genomen.** `@neondatabase/serverless` levert naast `neon()` ook een
   WebSocket-`Pool` die `db.transaction()` wél ondersteunt. De afweging (koude verbindingstijd
   versus atomiciteit) is een echt besluit, geen oversight — maar ik kan het besluit *om het niet te
   doen* nergens in `docs/` terugvinden. Alleen de constatering dat het nu niet kan.

**Hoe ik het zou verhelpen:** niet met een driverwissel als eerste stap. Eerst de
schrijfvolgordes zó maken dat een halve uitvoering herkenbaar is — bijvoorbeeld `import_runs.status`
pas op `voltooid` zetten ná de laatste matcher, zodat een afgebroken run als afgebroken leesbaar is.
Dat is klein en haalt de scherpste kant eraf. De driverwissel is een apart, groter besluit dat
hoort bij het moment dat er meerdere gelijktijdige gebruikers zijn.

### B-10 · Aanmaak-acties zonder idempotentie · KST-04
**Impact: middel · Moeite: klein**

Geen enkele aanmaak-action heeft een dedupe-sleutel of een submit-lock. Dubbelklik, of een retry na
de 500 uit B-05, levert twee records:

- `createDossierAction` ([app/projects/actions.ts:72-87](app/projects/actions.ts:72)) — twee
  projecten met dezelfde naam.
- `createOrgAction` ([app/settings/organization/actions.ts:25-41](app/settings/organization/actions.ts:25))
  — twee organisaties; de `slug` wordt uit de naam afgeleid en heeft geen uniciteitseis.
- `requestPriceAction` (`app/products/[id]/actions.ts:9`) — zie B-02.
- `addSpecLineAction` ([app/projects/actions.ts:90](app/projects/actions.ts:90)) — twee identieke
  spec-regels, die vervolgens allebei de matcher draaien.

Positieve uitzonderingen die laten zien dat het patroon wél bekend is: `addMembership` gebruikt
`onConflictDoUpdate` ([lib/repo/orgs.ts:82](lib/repo/orgs.ts:82)), `runMatcher` is expliciet
idempotent gemaakt door eerst de oude kandidaten te verwijderen
([lib/repo/matching.ts:44-45, 61-63](lib/repo/matching.ts:44)), en `generateQuote` verwijdert de
bestaande offerte voor hij een nieuwe maakt ([lib/repo/dossiers.ts:387-394](lib/repo/dossiers.ts:387)).

**Hoe ik het zou verhelpen:** `useFormStatus`-gebaseerde knop-disable in de formulieren (dekt de
dubbelklik, kost bijna niets), plus een unieke index waar een natuurlijke sleutel bestaat
(`organizations.slug` is de duidelijkste).

---

## 2.3 Lagere impact

### B-11 · `runMatcher` schrijft 2 queries per kandidaat, serieel · TRG-01
[lib/repo/matching.ts:70-87](lib/repo/matching.ts:70): een `for`-lus die per kandidaat een `insert`
in `spec_line_candidates` én een `logEvent` doet — beide `await`, dus serieel. Bij 443 kandidaten
over 204 regels is dat gemiddeld ~2 per regel, dus nu goedkoop. Maar deze functie wordt in een
*tweede* lus aangeroepen: `recordPdfImport` ([lib/repo/imports.ts:128-130](lib/repo/imports.ts:128)),
de leesroute-variant ([:222-224](lib/repo/imports.ts:222)), `addSpecCsvAction`
([app/projects/actions.ts:128](app/projects/actions.ts:128)) en de verrijking
([lib/repo/enrichment.ts:659](lib/repo/enrichment.ts:659), [:704](lib/repo/enrichment.ts:704)).
Een import van 200 regels is dus 200 × (1 select + 1 delete + 2·k inserts) volledig serieel over
HTTP. Dat is de reden dat een boek-import lang duurt.
**Fix:** één `insert().values([...])` met de hele array in plaats van de lus (Drizzle ondersteunt
dat), en `logEvent` batchen. Dat haalt 2k round-trips terug naar 2.

### B-12 · `SELECT *` op 70 plaatsen · TRG-04
70 keer `db.select()` zonder kolomlijst. De meeste zijn onschuldig (kleine tabellen, alle kolommen
nodig). Twee zijn het bekijken waard:
- [lib/repo/enrichment.ts:443-448](lib/repo/enrichment.ts:443) — `SELECT *` op `products` (116 MB,
  brede rij) **binnen een `for`-lus** over `byProduct`. Dus N volledige productrijen, één query per
  stuk. Dat is TRG-01 en TRG-04 in dezelfde vier regels.
- [lib/repo/enrichment.ts:418-421](lib/repo/enrichment.ts:418) — `SELECT *` op `enrichment_items`
  zonder `limit`, gefilterd op `run_id`. De tabel is 17.411 rijen; één run kan er een flink deel van
  zijn en die gaan allemaal het geheugen in.

**Fix:** kolomlijst waar de tabel breed is, en `enrichment.ts:443` uit de lus halen met één
`inArray(products.id, ids)`. De overige ~68 laten staan — over-fetching op een tabel van 400 rijen
is geen probleem en het opschonen ervan kost meer review dan het oplevert.

### B-13 · Stil weggeslikte fouten in twee server actions · KST-05
[app/projects/actions.ts:651-655](app/projects/actions.ts:651) (`useAiSuggestionAction`) en
[:701-705](app/projects/actions.ts:701) (`setStatusAction`) vangen álles met een kale `catch {}`. In
beide gevallen staat er een correcte toelichting bij welke fout bedoeld is — maar de `catch` is
breder dan die bedoeling. `setStatusAction` bedoelt "archiveren zonder reden"; hij vangt óók een
DB-storing, een ongeldige `dossierId` en elke toekomstige fout in `setStatus`. De gebruiker ziet
een geslaagde `revalidatePath` en een ongewijzigd project, zonder melding.
**Fix:** op de fouttype filteren (`if (!(e instanceof ArchiveReasonRequired)) throw e`) en de
verwachte fout als bericht teruggeven via `callAction()`. Elders in het project is dat kanaal er al.

### B-14 · `no_match_reason` wordt nergens weggeschreven · bevestigd
Bevestigd op productie: `SELECT count(no_match_reason) FROM spec_lines` → **0** van 204. De kolom
bestaat (`spec_lines.no_match_reason text`), het schema belooft hem, `grep -rn "noMatchReason" lib
app` levert geen enkele `set`/`insert`. Dat is dus geen meetfout maar dode belofte. Ook de bijhorende
cijfers kloppen exact: **204** regels, **3** met een gekoppeld product, **96** blauw, **42** groen
(en aanvullend: 38 rood, 13 open, 7 geel).

### B-15 · `db/schema.ts:457` declareert `orgId` zonder `.references()` · bevestigd · SEC-07
Bevestigd. `db/schema.ts:457` is `orgId: uuid("org_id"),` — kaal. De migratie heeft de constraint
wél: `db/migrations/0005_h2_h3.sql:35` — `ADD COLUMN org_id uuid REFERENCES organizations(id)`.
De database dwingt dus af wat de types niet weten.

Dit is niet de enige drift van deze soort. Breder gemeten: `db/schema.ts` declareert **11** indexen,
terwijl de migraties er **27** aanleggen (o.a. `products_name_trgm_idx`, `prices_product_idx`,
`spec_line_candidates_line_idx`). Wie index-dekking beoordeelt op `schema.ts` — wat een AI-sessie
zonder DB-toegang doet — trekt dus stelselmatig de verkeerde conclusie. Dat is precies waarom
TRG-03 hierboven zegt: **meet tegen `pg_indexes`, niet tegen `schema.ts`.**
**Fix:** `.references(() => organizations.id)` toevoegen op regel 457 en een
`bunx drizzle-kit generate` draaien om te zien of er méér drift is. Dat is een diagnose die niemand
nog gedaan heeft.

### B-16 · `button.tsx` focus-indicator haalt WCAG 2.4.13 (AAA) niet · bevestigd
Bevestigd op `a1985a6`. [components/ui/button.tsx:13](components/ui/button.tsx:13):
`focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/10`. De enige rand met
voldoende contrast is de 1px `border-ring`; de 3px-halo staat op 10% dekking en telt niet mee als
focus-indicator. WCAG 2.4.13 vraagt een omtrek van ten minste 2 CSS-pixels met ≥3:1 contrast.
Merk op: dit staat níét in de O8-O13-lijst van bewuste besluiten, dus het is een echte bevinding.

### B-17 · Drie testbestanden flaky onder belasting · bevestigd, genuanceerd
`bun vitest run lib/brand-message.test.ts lib/repo/admin.test.ts lib/custom-fields.test.ts` →
**3 passed (3), 28 tests passed, 8,37 s**. In isolatie is er niets mis. Dat bevestigt de diagnose
"suite-conditie, geen los testprobleem": de flakiness ontstaat pas onder gelijktijdige belasting van
de volledige suite (gedeelde PGlite-instantie of poolverzadiging). Het onderzoek hoort dus naar
`vitest.config.ts` (`poolOptions`, `fileParallelism`, `maxConcurrency`) en naar `db/test-db.ts`, niet
naar de drie testbestanden.

### B-18 · Geen retentie of paginering op `events` · TRG-05/KST-06
`events` is 1.380 rijen / 440 kB en groeit per zoekactie, match en offerte (ijzeren regel 5 —
bewust, en het fase-2-verdienmodel hangt eraan). `recentEvents` heeft een `limit` (goed,
[lib/repo/events.ts:26](lib/repo/events.ts:26)), maar `countEventsByAction`
([:35-39](lib/repo/events.ts:35)) doet een volledige `GROUP BY` over de tabel, en de analytics-tegels
doen gecorreleerde `EXISTS`-subqueries op `events` ([lib/repo/analytics-tiles.ts:154-160](lib/repo/analytics-tiles.ts:154)) —
hetzelfde patroon dat in B-03 887 ms kost op 211k rijen. `getAnalyticsTiles` is nu 281 ms warm; dat
schaalt lineair mee met de tabel.
**Fix:** de indexen uit B-04, en een besluit over retentie of aggregatie (een dagelijkse rollup-tabel)
vóórdat `events` de miljoen passeert. Niet urgent, wel iets om nu te besluiten in plaats van later te
ontdekken.

---

## 2.4 Negatieve bevindingen

Even belangrijk voor de zwerm: dit is gemeten en **schoon**. Niet opnieuw onderzoeken.

| Item | Meting | Oordeel |
|---|---|---|
| **SQL-injectie** | 9 × `sql.raw` op 7 regels; alle 9 gecontroleerd | **Schoon, en expliciet geborgd.** [lib/repo/brand-relations.ts:192-195](lib/repo/brand-relations.ts:192) valideert de kolomnaam met `/^[a-z0-9_]+$/` en gooit anders; de eigen-veld-tak gebruikt bewust een **gebonden parameter** in plaats van `sql.raw` — met een toelichting van 12 regels waarom ([:170-183](lib/repo/brand-relations.ts:170)). De overige `sql.raw`-gevallen (`lib/matching/engine.ts:374/378/474/537`) interpoleren berekende getallen, geen invoer. Dit is beter gedaan dan in de meeste met de hand geschreven code. |
| **`NEXT_PUBLIC_`-lek** | 0 treffers in `app/`, `lib/`, `components/`, `next.config.ts` | Schoon. Geen enkele client component leest `process.env`. |
| **Open redirect** | 19 `redirect()`-aanroepen met variabele | Schoon. Alle 19 hebben een letterlijk padvoorvoegsel (`/projects/`, `/products/`, `/data/`); geen enkele redirect naar een door de client bepaalde basis. |
| **CSRF** | — | **Niet van toepassing.** Next.js dwingt POST af en vergelijkt `Origin` tegen `Host` ([Next.js][nextsec]). Geen proxy op een ander domein in `next.config.ts`, dus `allowedOrigins` is niet nodig. |
| **`"use client"` te hoog** | 24 client components | Schoon. 21 zitten in `components/**` als bladeren; de 3 in `app/` zijn `app/login/page.tsx` (53 regels), `app/analytics/page.tsx` (35 regels) en `app/projects/[id]/luminaire-schedule/print-button.tsx` (18 regels) — allemaal dunne wrappers. De RSC-discipline in dit project is goed. |
| **Ongewapende pagina's** | 38 `page.tsx` | Schoon. Slechts 3 zonder guard, alle 3 terecht: `app/page.tsx` (alleen een `redirect`), `app/login/page.tsx`, `app/api/auth/[...all]/route.ts`. Er is géén middleware, dus elke pagina bewaakt zichzelf — dat is meer werk maar wel de robuustere vorm, en het is consequent volgehouden. |
| **Type-ontsnappingen** | 1 in de hele niet-test-codebase | Schoon. Eén `as any`/`@ts-ignore` in 321 bestanden is uitzonderlijk goed. |
| **LLM-kosten en betrouwbaarheid** | zie hieronder | **Voorbeeldig.** |

**Over de LLM-laag (KST-01):** alle vier de eisen uit het raster zijn ingevuld, plus de bonus.
`max_tokens` per call ([lib/ai/ocr.ts:397](lib/ai/ocr.ts:397), [lib/ai/vangnet.ts:747](lib/ai/vangnet.ts:747)),
harde timeout via de SDK (`CALL_TIMEOUT_MS`, [lib/ai/ocr.ts:119](lib/ai/ocr.ts:119)),
`maxRetries: 1` met toelichting waarom ([lib/ai/vangnet.ts:112](lib/ai/vangnet.ts:112)), een
plafond dat vóór elke call getoetst wordt (`checkOcrBudget`, [lib/ai/ocr.ts:518-547](lib/ai/ocr.ts:518)):
**€1 per run** (`OCR_MAX_EUR_PER_RUN`, [lib/ai/ocr.ts:59](lib/ai/ocr.ts:59)) plus een maandplafond
uit `app_settings` (gemeten: `llm_budget_eur = 10`). En het reserveringspatroon — de kosten worden
*vooraf* geboekt zodat een timeout niet gratis is ([lib/ai/ocr.ts:35](lib/ai/ocr.ts:35)).
Verbruik op productie: **372 calls, €2,40 totaal, €0,16 duurste call.** Elke afkapping, timeout en
fout wordt als apart event gelogd.

Eén klein aandachtspunt, geen bevinding: `llm_usage.import_run_id` heeft geen index (B-04) terwijl
`checkOcrBudget` er per AI-call een `sum()` op filtert. Bij 369 rijen irrelevant; noteer het bij de
indexmigratie.

---

# Deel 3 — Wat ik niet heb kunnen meten

1. **De echte kosten van B-06 (`work-prep` N+1) onder realistische belasting.** Er zijn op productie
   maar **3** spec-regels met een gekoppeld product (B-14), verdeeld over 13 dossiers waarvan er geen
   één meer dan 0 gematchte regels heeft in de top-3 grootste. Ik kon de lus dus niet met N > 1
   draaien. De 412 ms is een gemeten *enkele* call; de vermenigvuldiging (30 regels → ~12 s) is
   rekenkundig, niet gemeten. Zodra de matcher wél koppelt, is dit opnieuw te meten.
2. **Bundlegrootte (TRG-08).** Vergt een `bun run build` met bundle-analyse. Niet gedaan: een build
   raakt `.next/` en `tsconfig.tsbuildinfo` en de opdracht was niets te wijzigen. De signalen zijn
   gunstig (geen client-side data fetching, geen zware clientbibliotheken in `package.json`), maar
   dat is een indruk, geen meting.
3. **Of de rate limiting van Better Auth op deze Vercel-deploy daadwerkelijk werkt (SEC-09).**
   `lib/auth.ts` configureert geen `rateLimit` en geen `secondaryStorage`, dus het draait op de
   defaults. Die staan in productie aan ([Better Auth][ba-rl]), maar de standaard-store is in-memory
   en resettet per lambda-instantie. Om dit te weten moet je de login-endpoint daadwerkelijk
   herhaald aanroepen op de deploy — dat is een actieve test tegen productie en viel buiten de
   opdracht. Wel relevant: de allowlist-poort in [lib/auth.ts:21](lib/auth.ts:21) beperkt de schade
   sterk, want een niet-toegelaten adres krijgt sowieso nooit een link.
4. **Of B-01 leidt tot een échte cross-tenant-lek.** Niet reproduceerbaar: er zijn 0 organisaties en
   0 memberships op productie. De bevinding is een code-analyse (`listDossiers` heeft geen `where`),
   geen waargenomen lek. Het is niet mogelijk hem te bewijzen zonder testdata met twee orgs aan te
   maken — en dat is een schrijfactie op productie die ik niet heb gedaan.
5. **De precieze oorzaak van B-17 (flaky tests).** Ik heb bevestigd dat de drie bestanden in isolatie
   slagen. De volledige suite draaien om de flakiness te reproduceren duurt lang en is per definitie
   niet-deterministisch; de oorzaak lokaliseren vergt een gerichte sessie op `vitest.config.ts` en
   `db/test-db.ts`.
6. **Koud-versus-warm bij B-03.** De 8.803 ms is één koude meting, de 1.320 ms een mediaan van drie
   warme. Ik heb geen manier gevonden om Neon betrouwbaar terug naar koud te dwingen zonder de
   compute te suspenden, dus er is geen mediaan voor de koude toestand. Beide getallen zijn echt;
   welke de gebruiker vaker ziet hangt af van hoe vaak `/data/brand-relations` bezocht wordt.

---

## Bronnen

- [Next.js — How to think about data security][nextsec] — de auditparagraaf onderaan is de beste
  bestaande checklist voor deze stack; SEC-01/02/03/05/11 volgen hem.
- [Cloud Security Alliance — AI codegen vulnerability debt][csa] — de verschuiving van injectie naar
  autorisatie naarmate gegenereerde applicaties complexer worden (28% vs 11%).
- [ZeroPath — Authorization bugs are having their SQL injection moment][zeropath] — waarom het model
  het endpoint bouwt maar de eigenaarscheck niet.
- [GHSA-955p-x3mx-jcvp][ghsa] — onbedoelde onthulling van interne server-function-endpoints; reden
  om action-ID-versluiering niet als beveiliging te tellen.
- [Drizzle ORM — Query performance][drizzle-perf] — waarom N+1 in Drizzle makkelijker ontstaat dan in
  ORM's met een expliciete relatie-API.
- [Better Auth — Rate limit][ba-rl] · [issue #3264][ba-3264] — defaults, store-gedrag, magic-link-geval.
- [Next.js — Environment variables][nextenv] — `NEXT_PUBLIC_`-inlining bij build.
- [OWASP — IDOR prevention cheat sheet][owasp-idor].

[nextsec]: https://nextjs.org/docs/app/guides/data-security
[nextenv]: https://nextjs.org/docs/pages/guides/environment-variables
[csa]: https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-codegen-vulnerability-debt-20260406-csa/
[zeropath]: https://zeropath.com/blog/idor-crisis-2025
[ghsa]: https://github.com/vercel/next.js/security/advisories/GHSA-955p-x3mx-jcvp
[drizzle-perf]: https://orm.drizzle.team/docs/perf-queries
[ba-rl]: https://better-auth.com/docs/concepts/rate-limit
[ba-3264]: https://github.com/better-auth/better-auth/issues/3264
[owasp-idor]: https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html
