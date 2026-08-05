# Sprint 3.2a — Externe toegang: route-allowlist + org-scoping

**Voor de bouwsessie. Zelfvoorzienend: je hoeft deze chat niet te kennen.**
Geschreven door de sprintmaster van week 3 op 3 aug 2026, op verse metingen tegen
`origin/main` (`71dfa17`) en de productiedatabase.

---

## 1. Waar dit over gaat

Sinds 3 aug staat sprint 3.1 live: externen kunnen via een PIN een account activeren en een
wachtwoord zetten. Er is alleen nog geen enkele muur tússen organisaties. Een extern account
dat straks binnenkomt, kan vandaag `/data`, `/admin`, `/analytics` en de merkenschermen
opvragen, en via een directe URL de projecten van een ander bedrijf lezen.

3.2a bouwt die muur. Twee dingen tegelijk, want los van elkaar zijn ze allebei lek:
de **routes** die een extern account überhaupt mag bereiken, en de **rijen** die het binnen
die routes te zien krijgt.

## 2. Wanneer het af is (de acceptatie-eisen uit het sprintplan)

- *Given* een extern account, *when* het de app gebruikt, *then* zijn alléén projecten (eigen
  organisatie) en catalogus bereikbaar; alle andere routes worden **server-side** geweigerd,
  met tests per accounttype.
- *Given* de project-queries, *then* zijn lijst, detail, regels, review, estimate en importruns
  org-gescoped — een extern account kan geen enkel object van een andere org opvragen
  (**directe-URL-test**, niet alleen "de knop is weg").
- *Given* de rechten, *then* admin ≠ gewone gebruiker (instellingen en uitnodigen alleen admin).

## 3. De lat

Twee referenties, allebei bewust gekozen omdat ze een *houding* meebrengen, niet een recept.

**Hard (mechanisme): Postgres Row-Level Security als denkmodel — niet als implementatie.**
Wat RLS goed doet en een `if` in een component niet: de regel zit vast aan de *data*, niet aan
het *scherm*, en hij geldt ook voor de query die je vergat. Je hoeft geen RLS aan te zetten
(dat raakt migraties, connectie-pooling en de importscripts), maar de vraag die je van RLS
moet lenen is: *kan iemand die morgen een nieuwe query schrijft de scoping per ongeluk
overslaan?* Als het antwoord ja is, zit de bewaking op de verkeerde plek. Vergelijk met hoe
`lib/repo/prijszicht.ts` het in 3.2b oploste: niet een vlag die je kunt vergeten, maar een
projectie waarin het verkeerde antwoord een typefout wordt.

**Zacht (deny-by-default): OWASP Broken Access Control (A01:2021).** De kern die hier telt:
toegang faalt veilig, de allowlist is expliciet, en een route die niemand bewust heeft
toegelaten is geweigerd — niet toegelaten omdat niemand eraan dacht. Een nieuwe route die
morgen wordt toegevoegd moet standaard dicht zijn.

## 4. Wat gemeten is (feiten, geen aannames)

Alles hieronder is op 3 aug nagemeten. Neem het niet over zonder te kijken — main beweegt
snel, er lopen parallelle sessies.

1. **Er is géén `middleware.ts`.** Niet in de root, niet in `src/`. De route-allowlist moet dus
   ergens anders landen. Dat is een ontwerpkeuze die jij maakt, niet een gat dat je moet vullen
   met het eerste dat werkt — zie §3.
2. **44 routes** (`page.tsx` + `route.ts` onder `app/`). Het oppervlak is dus niet klein: naast
   `/projects` en `/catalog` staan er `/data/*` (13 stuks), `/admin/*` (6), `/brand/*` (4),
   `/analytics`, `/products/[id]`, plus `/login` en `/activate` die juist **open** moeten
   blijven.
3. **`lib/repo/analytics-tiles.ts` heeft de `orgId`-parameter al** (`:23` de parameter, `:134`
   een fail-closed uuid-controle) en documenteert zelf dat een `orgId` vandaag elke tegel 0
   oplevert — "de parameter staat klaar voor week 3". **Sluit hierop aan, bouw geen tweede
   scoping-mechanisme.**
4. **`db/schema.ts:461` declareert `orgId: uuid("org_id")` zonder `.references()`**, terwijl de
   productiedatabase de constraint `project_dossiers_org_id_fkey` wél heeft (aangelegd door
   `0005_h2_h3.sql:34-35`). Ter vergelijking: `memberships` (`:931`) heeft de reference wél.
   ⚠️ **Risico dat je moet toetsen, niet aannemen:** omdat Drizzle de FK niet kent, kan een
   volgende `drizzle-kit generate` hem als overtollig zien en een `DROP` genereren. Dit hoort
   bij 3.2a omdat het precies het scoping-veld is.
5. **De oude bevinding "er is niets om aan te scopen" is achterhaald.** Die zei: alle 13
   dossiers hebben `org_id IS NULL`. Migratie `0019` heeft ze op 3 aug allemaal aan
   `brink-licht` gekoppeld — **13 van 13 hebben nu een `org_id`**. Je scoping-tests meten dus
   iets echts; een test die "0 rijen" teruggeeft is nu een fout en niet meer een lege database.
6. **Er is precies één organisatie** (`brink-licht`, `type = 'intern'`) met drie
   `org_admin`-memberships, plus een vierde account dat Timo bij het testen aanmaakte. Er is
   **nog geen externe organisatie**. Wil je tegen een echte externe situatie testen, dan maak je
   die zelf aan in de testdatabase — **niet op productie**.

## 5. Bekende schuld die hier thuishoort

**`saveBrandingAction` (`app/settings/organization/actions.ts:96`) staat achter alleen
`requireSession()`.** Hij leest `orgId` uit de `FormData` en controleert niet of de actor bij
die organisatie hoort — org A kan de branding van org B overschrijven. Vastgelegd als
`BEKENDE_SCHULD` in `lib/repo/authz-deuren.test.ts:175`, mét een vastpin-test die rood wordt
zodra iemand de lijst stilletjes uitbreidt.

Dit was theoretisch zolang er één organisatie bestond. Het wordt echt op het moment dat de
tweede wordt aangemaakt — en dat staat op het punt te gebeuren (zie G41). **Dit gat dichten
hoort bij 3.2a.** Haal het uit `BEKENDE_SCHULD` als je klaar bent; de vastpin-test dwingt af
dat je dat bewust doet.

## 6. Grenzen (bindend)

- **Ijzeren regel 3 blijft staan:** verlopen prijslijst = product onzichtbaar in álle
  zoekresultaten. Scoping mag daar niets aan veranderen, en mag er ook niet omheen bouwen.
- **Ijzeren regel 5:** elke zoekactie, match en offerte blijft gelogd in `events`. Als scoping
  een query verlegt, blijft de logging even compleet.
- **Fase-aware, default = veilig.** Twijfel over het accounttype of het lidmaatschap → de
  strengste uitkomst. `lib/repo/prijszicht.ts` laat zien hoe dat eruitziet: "intern? toon",
  niet "extern? verberg".
- **Blijf van 3.2b af.** Prijszicht is af, gedeployd en getest. Als scoping raakt aan wie een
  estimate mag zien, verander je de *toegang*, niet de *prijsprojectie*.
- **Rate limiting is voor de route, niet voor deze laag.** Het stond genoteerd als 3.2a-werk;
  neem het alleen mee als het je route-allowlist niet vertroebelt.
- **Niets pushen naar main en niets deployen zonder Timo's expliciete akkoord.** Elke push naar
  main deployt binnen seconden naar productie. Pushen gaat uitsluitend via
  `bash scripts/safe-push.sh $(git rev-list --reverse origin/main..HEAD)` — de kale vorm zonder
  argument pusht **één commit** en is precies de val waar dit project al vijf keer in trapte.
- **Niet tegen de productiedatabase werken.** Het incident van 30 jul kwam van een dev-server
  met de productie-`DATABASE_URL` in `.env.local`. Test op PGlite; die draait dezelfde
  migraties.

## 7. Werkwijze

Elke feature: white-box RSC-test met screenshots (light/dark × mobile/desktop) vóór hij af
heet. Kleine commits. Aannames en open eindes in `HANDOVER.md`.

⚠️ Verse worktree zonder `node_modules` → DB-tests falen met "Invalid FS bundle size". Eerst
`bun install`; dat is geen codefout.

⚠️ De testsuite is aantoonbaar flaky: drie runs op dezelfde commit gaven 3, 2 en 9 rode tests
in wisselende bestanden. **Draai twee keer voor je iets een regressie noemt.** Eén bekende
echte: `components/data/custom-fields.test.tsx > "archiveren zonder VERSE telling"` valt ook op
een kale `origin/main` om onder volle-suite-belasting — die is niet van jou.

## 8. Wat expliciet niet in deze briefing staat

Hoe je het bouwt. Waar de allowlist woont, of scoping via een gedeelde queryhelper gaat of via
de repo-laag, of je één bewaker maakt of per route beslist — dat is jouw ontwerp. §2 zegt
wanneer het af is, §3 waaraan het gemeten wordt, §6 waar de grenzen liggen. De rest is aan jou,
en als je een betere weg ziet dan wat hierboven gesuggereerd wordt: neem hem, en schrijf op
waarom.
