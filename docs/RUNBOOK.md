# RUNBOOK — Lumen Logic overdracht (sprint 4.2)

> Voor een ontwikkelaar of Brink-beheerder **zonder voorkennis** van dit project.
> Elk commando hieronder is geverifieerd tegen de repo (`package.json`, `scripts/`,
> `CLAUDE.md`, `HANDOVER.md`, `docs/`). Volg de stappen in volgorde; elke stap zegt
> wat je hoort te zien. De accountmigratie zelf (van Timo's accounts naar Brink)
> staat in `docs/spike-2.3-migratie-draaiboek.md` — dit document gaat over het
> dagelijkse draaien, niet over de eigendomsoverdracht.

## 1. Wat dit is (architectuur in het kort)

Lumen Logic is de spec-, calculatie- en offertetool voor Brink Licht: een
Next.js 16-app (App Router, React Server Components) in TypeScript 7 (native
compiler), gebouwd en gedraaid met Bun. **Dit is géén webshop** — zie de ijzeren
regels in §8.

De diensten eromheen (volledige inventaris met bronverwijzingen:
`docs/spike-2.3-migratie-draaiboek.md` §0):

| Dienst | Rol |
|---|---|
| **Vercel** | Hosting. Project `lumenlogic`, live op https://lumenlogic.vercel.app. Elke push naar `main` deployt automatisch naar productie — er is géén preview-stap. |
| **Neon Postgres** | De enige werkdatabase. ⚠️ **Lokaal en productie delen dezelfde DB** — je lokale `bun dev` schrijft in de productiedata. Er is geen aparte staging-DB. |
| **Supabase** | Alleen archief/bron (project "Brinklicht"); zit **niet** in het runtime-pad van de app. |
| **Anthropic API** | AI-vangnet voor matching-suggesties en OCR/leesroute bij PDF-import. Zonder key valt de app terug op het deterministische pad; de site blijft werken. |
| **Mailprovider** | **Geen.** De magic-link-login komt niet per mail maar uit de serverlogs (zie §2 stap 6 en §4). |
| **GitHub** | Coderepo; de push naar `main` is de trigger voor de Vercel-deploy. |

Verplichte leesstof vóór je iets bouwt: `CLAUDE.md` (wortels van de repo),
`docs/BUILD-PLAN.md`, achtergrond in `docs/lumenlogic-briefing.md`.

## 2. Schone checkout → werkende lokale omgeving

1. **Clone de repo.**
   ```
   git clone <repo-URL> lumenlogic && cd lumenlogic
   ```
   Je ziet nu de projectmap met o.a. `app/`, `db/`, `lib/`, `docs/`, `scripts/`.
   (De actuele repo-locatie: zie het migratiedraaiboek — vóór de overdracht is dat
   `github.com/Timo-AInstein/lumenlogic`.)

2. **Installeer de git-hooks** (eenmalig per clone — beschermt tegen een kale push
   naar productie, zie §4):
   ```
   bash scripts/install-git-hooks.sh
   ```
   Je ziet nu een melding dat de pre-push-hook geïnstalleerd is.

3. **Installeer dependencies.**
   ```
   bun install
   ```
   Let op: de postinstall draait `scripts/link-typescript6.mjs`. Dat is geen ruis
   maar noodzaak — TypeScript 7 levert (tot 7.1) geen JavaScript-API meer, en dit
   script geeft typescript-eslint de oude API uit `@typescript/typescript6`.
   Zonder deze stap crasht `bun run lint`. Je ziet nu een gevulde `node_modules/`
   zonder foutmeldingen. (Draai je later tests in een verse git-worktree: ook dáár
   eerst `bun install`, anders falen DB-tests met "Invalid FS bundle size".)

4. **Maak `.env.local` aan** in de projectroot. Alleen de **namen** staan hier;
   de waarden krijg je van de beheerder (ze staan ook in de Vercel-project-env).
   De volledige inventaris met vindplaats per key:
   `docs/spike-2.3-migratie-draaiboek.md` §0.
   - `DATABASE_URL` — de Neon-connection-string (verplicht)
   - `BETTER_AUTH_SECRET` — **zelfde waarde als in de Vercel-env**, anders werkt
     de magic-link niet
   - `BETTER_AUTH_URL` — optioneel; valt op Vercel terug op `VERCEL_URL`
   - `ANTHROPIC_API_KEY` — optioneel lokaal; zonder deze key doet de app alles
     behalve de AI-routes

   ⚠️ Nogmaals: `DATABASE_URL` wijst naar de **productie**database. Behandel je
   lokale omgeving alsof je in productie werkt, want dat doe je.

5. **Start de dev-server.**
   ```
   bun dev
   ```
   Je ziet nu Next.js opstarten met een lokale URL (doorgaans
   `http://localhost:3000`).

6. **Log in via magic link.** Ga naar `http://localhost:3000/login`, vul een
   e-mailadres in dat op de allowlist staat (beheer via `/instellingen` in de
   app). Er wordt géén mail verstuurd: **de magic link verschijnt als
   `console.log` in de terminal waar `bun dev` draait.** Kopieer die URL naar de
   browser binnen **5 minuten** (daarna is hij verlopen; vraag dan gewoon een
   nieuwe aan). Je ziet nu de ingelogde app.

## 3. Tests, typecheck en lint

1. **Typecheck** (hele repo, ±1 s dankzij de native TS7-compiler):
   ```
   bun run typecheck
   ```
   Je ziet nu `tsc --noEmit` en daarna niets — geen output betekent schoon.

2. **Tests:**
   ```
   bun vitest run
   ```
   Je ziet nu de volledige suite groen. De white-box RSC-tests schrijven
   **screenshot-PNG's naast de testfiles** (light/dark × mobile/desktop) —
   bekijk die na wijzigingen aan schermen; ze zijn onderdeel van de definitie
   van "af".

3. **Lint:**
   ```
   bun run lint
   ```
   Je ziet nu ESLint zonder fouten. Crasht dit vóór de eerste regel, dan is de
   postinstall-symlink uit §2 stap 3 niet gedraaid (`bun install` opnieuw, of
   `node scripts/link-typescript6.mjs`). Deze brug mag weg zodra
   typescript-eslint de TypeScript 7.1-API ondersteunt; zie `CLAUDE.md` en
   `HANDOVER.md`.

## 4. Deployen

⚠️ **Elke push naar `main` deployt automatisch naar productie** (geverifieerd:
deployment start seconden na de push; er is geen preview- of goedkeuringsstap).

⚠️ **Pushen gaat UITSLUITEND via:**
```
bash scripts/safe-push.sh            # pusht HEAD
bash scripts/safe-push.sh <sha>      # pusht exact deze commit(s)
DRY_RUN=1 bash scripts/safe-push.sh  # toont wat er zou gaan, pusht niet
```

Waarom: een kale `git push origin main` stuurt **álle** commits op je lokale
`main` mee — ook halffabricaat van een parallelle sessie in dezelfde
werkdirectory — en dat deployt dan ongevraagd naar productie. Dit ging in week 1
vier keer mis (beslissingslog: `docs/lumenlogic-sprintplan-augustus.md`).
`safe-push.sh` pusht exact de opgegeven commit(s), gerebased op de actuele
`origin/main`, via een wegwerp-worktree; je lokale `main` blijft onaangeraakt.
De pre-push-hook (geïnstalleerd in §2 stap 2 met
`bash scripts/install-git-hooks.sh`) **weigert** de kale push, dus vergeet die
installatie niet — hij is je vangnet, per clone (worktrees delen de hook).

Na de push: je ziet binnen ±1 minuut een nieuwe deployment in het
Vercel-dashboard, en de wijziging live op https://lumenlogic.vercel.app.

**Magic link op productie** (er is geen mailprovider, dus ook daar komt de link
uit logs):
```
vercel logs --environment production --since 15m --expand --no-branch
```
`--expand` is verplicht — zonder die vlag zie je alleen de POST-regel en blijft
de `console.log` met de link verborgen. Link is 5 minuten geldig.

## 5. Databasemigraties

Migraties zijn `.sql`-bestanden in `db/migrations/`, gegenereerd door drizzle-kit
uit `db/schema.ts`.

1. **Schema gewijzigd? Genereer de migratie:**
   ```
   bun run db:generate
   ```
   (dit draait `drizzle-kit generate`). Je ziet nu een nieuw genummerd
   `.sql`-bestand in `db/migrations/`.

2. **Migratie toepassen:**
   ```
   bun run db:migrate
   ```
   Let op: dit is **niet** `drizzle-kit migrate` — die gebruikt de
   WebSocket-driver en hangt in deze omgeving. `db/migrate.ts` is een eigen,
   idempotente runner over de Neon HTTP-driver die dezelfde `.sql`-bestanden
   uitvoert. Je ziet nu per bestand `= overslaan (al toegepast): …` of
   `→ toepassen: … (N statements)`.

3. **Controleren wat al toegepast is:** de runner houdt de tabel
   `__migrations` bij (kolommen `name`, `applied_at`). Draai
   `bun run db:migrate` nogmaals — een schone stand toont uitsluitend
   `= overslaan`-regels. (Of query `SELECT name FROM __migrations ORDER BY name`
   in het Neon-dashboard.)

⚠️ Dit draait tegen de gedeelde productie-DB (§1). Een migratie is dus meteen
een productie-ingreep: eerst typecheck en tests groen, dan pas migreren.

## 6. Importproces (brondata en prijslijsten)

- **Brondata-import:**
  ```
  bun run import
  ```
  Leest `data/source/*.csv` (o.a. `brink_brands.csv`, `brink_products.csv`,
  `brink_suppliers.csv`, `brink_categories.csv`) en schrijft naar de database.
  `data/` is **read-only brondata en staat niet in git** — je krijgt die map
  apart aangeleverd bij de overdracht. Je ziet nu per bestand voortgang in de
  terminal; import-beslissingen en het waarom staan in
  `docs/import-beslissingen.md`.

- **Merk-prijslijsten (de brandportal-route):** nieuwe of bijgewerkte
  prijslijsten van een merk gaan **niet** via `bun run import` maar via de
  brandportal in de app (`/brand`, met o.a. het prijslijsten-scherm). Een merk
  levert het ingevulde brand-Excel (66 velden) aan; het omzetten van een ruwe
  leveranciers-prijslijst naar dat Excel is een begeleid proces (zie de
  `prijslijst`-verwerking en `docs/brand/`). Kernregel daarbij: een **verlopen
  prijslijst maakt het product onzichtbaar in álle zoekresultaten** — dat wordt
  centraal afgedwongen, dus houd geldigheidsdatums bij.

## 7. Incident-basics

- **Logs:** productie-logs staan bij Vercel:
  `vercel logs --environment production --since 15m --expand --no-branch`
  (of het Vercel-dashboard → project `lumenlogic` → Logs). Vergeet `--expand`
  niet (§4).
- **Audittrail:** elke zoekactie, match en offerte-actie wordt gelogd in de
  **`events`-tabel** (Neon). Bij "wat is er gebeurd?"-vragen is dat je eerste
  stop. Let op bij het filteren: AI-runs herken je aan `action LIKE 'ai_%'`;
  alleen `search`-events hardcoderen de actor `ai:vangnet` (zie `HANDOVER.md`).
- **AI-budgetcap:** de uitgavengrens voor de Anthropic-routes leeft als
  app-setting **`llm_budget_eur`** in de `app_settings`-tabel (instelbaar via
  `/instellingen`). Uitgaven staan in `llm_usage` (`cost_eur`). Cap bereikt →
  de app logt `ai_vangnet_skipped_budget` en draait AI-loos verder; budget `0`
  is een echt plafond, alleen `null` betekent "geen cap". Loopt AI-verbruik uit
  de hand: zet de cap laag of verwijder de key uit de Vercel-env — de app
  blijft werken.
- **Site plat:** check eerst het Vercel-dashboard (deployment-status; rol
  desnoods terug naar de vorige deployment via "Instant Rollback"), dan de
  Neon-status (database bereikbaar?). De app heeft geen andere
  runtime-afhankelijkheden (§1).
- **Data kwijt of corrupt — Neon point-in-time restore:**
  > **[PLACEHOLDER — wordt in sprint 4.3 geoefend en aangevuld.]** Neon
  > ondersteunt point-in-time restore via branches; de precieze klikroute,
  > het herstelvenster van dit project en een geoefende procedure worden in
  > 4.3 vastgelegd. Tot die tijd: niet improviseren op de productie-DB —
  > eerst het Neon-dashboard raadplegen en de stappen hier documenteren.

## 8. De vijf ijzeren regels

Deze staan in `CLAUDE.md` en gelden voor **elke** sessie en **elke** feature.
Wie hier bouwt, bewaakt ze:

1. **Dit is geen webshop.** Geen winkelwagen, geen checkout, geen publieke
   prijzen.
2. **Geld beïnvloedt nooit de ranking.** Matching-logica strikt gescheiden van
   commercie.
3. **Verlopen prijslijst = product onzichtbaar** in álle zoekresultaten
   (centraal afgedwongen).
4. **Fase-aware: default = veilig.** De tender-stand toont nooit
   alternatieven-suggesties.
5. **Elke zoekactie/match/offerte wordt gelogd** in de events-tabel.
