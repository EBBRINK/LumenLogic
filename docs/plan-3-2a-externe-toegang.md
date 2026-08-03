# 3.2a — Externe toegang: route-allowlist + org-scoping (ontwerp)

Geschreven door de bouwsessie van 3.2a op 3 aug 2026, vóór de eerste regel code. De briefing
(`docs/sprint3-2a-briefing.md`) zegt bewust niet hóé; dit document is dat antwoord, mét de
redenen — zodat de volgende lezer ziet welke keuzes bewust zijn en welke open staan.

## 1. Twee muren, twee mechanismen

| | vraag | mechanisme |
|---|---|---|
| **Routes** | mag dit account deze URL überhaupt openen? | allowlist-tabel + `bewaakRoute()` per route |
| **Rijen** | welke projecten ziet het daarbinnen? | verplichte `DossierScope`-parameter op de vier leesdeuren |

Ze zijn los van elkaar allebei lek: een route-muur zonder rij-scoping laat `/projects/<uuid van
een ander>` staan, en rij-scoping zonder route-muur laat `/data` en `/analytics` open.

## 2. Waarom géén `middleware.ts`

Het lag voor de hand (er is er geen, dus "vul het gat"). Drie redenen om het niet te doen:

1. **Deze codebase heeft zelf gemeten dat een bovenliggende laag niet gezaghebbend is.**
   `app/projects/[id]/layout.tsx:32-40` legt uit dat een layout parallel rendert met zijn
   pagina, dus de `redirect()` van de layout stopt de queries van de pagina niet. Dat argument
   geldt één-op-één voor middleware: het is dezelfde belofte ("de laag erboven dekt het af").
2. **Middleware draait op de edge**, zonder de databaseverbinding waar het lidmaatschap in
   staat. Een sessiecookie zegt wíé je bent, niet in welke organisatie je zit — precies het
   onderscheid dat G39 maakt (identiteit uit de sessie, rechten vers uit de database).
3. **Deny-by-default werkt beter met een tabel dan met een matcher.** Een nieuwe route is een
   ontbrekende sleutel (weigering + rode test), niet een pad dat toevallig niet door een
   regex wordt geraakt.

Het sprintplan wees dezelfde kant op: "per-route server-side (in `lib/session.ts`-laag of per
`page.tsx`), niet via middleware".

## 3. De allowlist

`lib/route-toegang.ts` draagt één literal tabel `ROUTE_NIVEAUS`, met een regel per route in
`app/`. Vier niveaus:

- `open` — zonder sessie: `/login`, `/activate`, `/api/auth/[...all]`
- `iedereen` — elk ingelogd account: projecten, catalogus, eigen instellingen
- `org_admin` — org_admin in de eigen organisatie, of intern
- `intern` — alleen leden van een organisatie met `type = 'intern'`

Drie dingen maken hem deny-by-default in plaats van "goed bedoeld":

1. `type Route = keyof typeof ROUTE_NIVEAUS`. Een route die niet in de tabel staat is geen
   toegestane waarde meer — **een typefout, niet een stille doorgang.** Dit is dezelfde vorm
   als `lib/repo/prijszicht.ts`: het verkeerde antwoord compileert niet.
2. `niveauVoor()` geeft `null` voor een onbekend pad, en `null` betekent weigeren.
3. `lib/route-toegang.test.ts` leidt uit élk `page.tsx`/`route.ts` in `app/` de route af en
   eist dat het bestand precies díé route bewaakt. Een nieuwe route die niemand bewust heeft
   toegelaten maakt die test rood. Zelfde bewaker-vorm als `lib/repo/authz-deuren.test.ts`.

Geweigerd = `notFound()`, niet een foutmelding: wie er niet bij mag hoort ook niet te weten
dát de route bestaat (OWASP A01, en dezelfde lijn als de neutrale `MSG_DENIED` in `authz.ts`).
Elke weigering gaat als `route_denied` de events-tabel in (ijzeren regel 5).

## 4. Drie routes waar de eis en de werkelijkheid schuurden

- **`/admin/*` → `intern`.** De acceptatie-eis noemt `/admin` letterlijk bij de geweigerde
  routes. G36 kent wél een externe org_admin die PIN's mag uitgeven, maar dat scherm is
  vandaag onbereikbaar voor externen en dat is de veilige kant. De org_admin-tak in
  `lib/repo/authz.ts` blijft ongemoeid; alleen de deur staat dicht. **Terugdraaien is één
  regel in de tabel** — dat hoort bij 3.2c (onboarding op één scherm, G41).
- **`/settings` → `iedereen`, mét blokken op intern.** Externen weigeren op `/settings` zou
  betekenen dat ze hun eigen wachtwoord niet kunnen wijzigen — en dat is precies wat 3.1
  vorige week heeft opgeleverd. De eis somt de geweigerde routes op (`/data`, `/admin`,
  Merken, `/analytics`) en `/settings` staat er niet bij. De interne blokken (toegelaten
  adressen, LLM-budget, XIS-koppeling) renderen alleen voor intern: "intern? toon".
- **`/settings/organization` → `org_admin`, én rij-gescoped.** De pagina toonde álle
  organisaties met álle leden aan iedereen met een sessie. Een niet-interne beheerder ziet nu
  alleen zijn eigen organisatie(s) — via `describeIssueScope()`, dezelfde bron die de
  server-actions gebruiken.

## 5. Rij-scoping: één verplichte parameter, vier deuren

Gemeten: de hele `/projects/[id]/*`-boom begint bij `getDossier(db, id)` en doet `notFound()`
als die leeg is. Elke onderliggende pagina toetst daarnaast al zijn eigen sleutel
(`run.dossierId !== id`, `specLine.dossierId !== dossier.id`, `proposal.dossierId !== id`).
De boom is dus al gescoped zódra de wortel dat is.

Er zijn precies vier leesdeuren op `project_dossiers`:

| deur | bestand |
|---|---|
| `listDossiers` | `lib/repo/dossiers.ts:22` |
| `getDossier` | `lib/repo/dossiers.ts:67` |
| `listDossiersFiltered` | `lib/repo/project-status.ts:196` |
| `getRow` (schrijfpad status/fase) | `lib/repo/project-status.ts:79` |

Alle vier krijgen een **verplichte** `scope: DossierScope`. Geen default, geen optionele
parameter: wie hem vergeet krijgt geen stille "alles", maar een compilerfout. Dat is de vraag
die de briefing uit RLS leent — *kan iemand die morgen een nieuwe query schrijft de scoping
overslaan?* — beantwoord met "niet zonder het te merken".

`getEstimateData()` leunt op `getDossier()` en geeft de scope door; `lib/ai/vangnet.ts:707`
leest alleen de fase van een dossier waarvan de aanroeper de toegang al bewezen heeft, en
staat daarom in de uitzonderingslijst van de bewaker (met die reden erbij).

`lib/repo/dossier-scope.test.ts` scant `.from(projectDossiers)` in `lib/`, `app/` en
`components/` en meldt elke vijfde deur.

### De scope zelf

```ts
type DossierScope = { kind: "alles" } | { kind: "orgs"; orgIds: string[] }
```

`alles` alleen voor intern. `orgs` met een lege lijst betekent letterlijk nul rijen — niet
"geen filter". Dat is ijzeren regel 4 op de databaselaag: `orgIds: []` levert `false`, geen
weggelaten `WHERE`.

**`org_id IS NULL` telt als intern.** De 13 bestaande dossiers zijn door migratie 0019 aan
`brink-licht` gekoppeld, maar `createDossier()` zette tot nu toe géén `org_id` — een nieuw
project was dus stuurloos. Twee reparaties: `createDossier()` zet voortaan de organisatie van
de maker, en een dossier zónder organisatie is alleen voor intern zichtbaar.

## 6. `saveBrandingAction` (de bekende schuld)

Zelfde vorm als G39: autoriseren en schrijven in één aanroep. `setOrgBranding()` komt in de
schrijflaag (`lib/repo/orgs.ts`), `setBrandingAsActor()` in de autorisatielaag
(`lib/repo/authz.ts`) naast `changeMembershipAsActor()`. De action houdt alleen nog het
formulier vast. `BEKENDE_SCHULD` in `authz-deuren.test.ts` gaat leeg, en `setOrgBranding`
gaat in `VERBODEN_NAMEN` — dat schrijft dat bestand zelf voor voor nieuwe schrijffuncties.

Meegenomen omdat het dezelfde deur is: `createOrgAction` stond ook achter alleen
`requireSession()`. Een organisatie aanmaken wordt intern-only (G42 maakt er in 3.2c een
bewuste type-keuze van).

## 7. Wat hier NIET in zit

- **Rate limiting.** De briefing laat het vrij "als het de allowlist niet vertroebelt". Het
  vertroebelt hem: het is een andere vraag (hoe váák) op een andere as (per IP/account, niet
  per organisatie). Blijft open.
- **3.2b.** De prijsprojectie wordt niet aangeraakt. `/projects/[id]/quote` verandert alleen
  van *wie de route mag openen*, niet van *welke bedragen er staan*.
- **3.2c.** Geen onboarding-scherm, geen org-aanmaakflow, geen type-keuze.
- **Echte RLS in Postgres.** Als denkmodel geleend, niet als implementatie — dat raakt
  migraties, pooling en de importscripts, en de briefing zegt uitdrukkelijk dat het niet hoeft.
