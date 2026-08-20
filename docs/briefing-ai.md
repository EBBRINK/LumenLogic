# Lumen Logic — AI-briefing (volledige technische context)

> Voor een AI-sessie (of ontwikkelaar) bij Brink die **zonder enige voorkennis**
> aan dit project moet werken. Lees dit document volledig vóór je iets doet.
> Aanvullend: `CLAUDE.md` (repo-root, bindend), `docs/RUNBOOK.md` (operatie),
> `HANDOVER.md` (chronologisch logboek van alle aannames en open eindes),
> `docs/MASTERPLAN.md` (koers), `docs/FUNCTIONEEL-ONTWERP.md` (78 features,
> schermen, flows), `docs/INVOERVALIDATIE.md` (validatieconventie).

## 0. Wat dit is

Lumen Logic is de spec-, calculatie- en offertetool van Brink Licht voor de
professionele verlichtingsmarkt: armaturenboek/bestek inladen → per regel
matchen tegen de catalogus (±211k producten, 436 merken) met de
vijfstatussen-regelset → menselijke review → geprijsde estimate/offerte.
**Géén webshop** (zie ijzeren regel 1). Klant nul is de Brink-binnendienst.
Live: https://lumenlogic.vercel.app.

## 1. Stack en architectuur

- **Next.js 16** — App Router, React Server Components. Lagenmodel:
  RSC → server actions → repo-laag (`lib/repo/`) → Drizzle → Neon.
- **TypeScript 7 (native compiler)** — `bun run typecheck` = `tsc --noEmit`,
  hele repo in ±1 s. ⚠️ TS7 levert (tot 7.1) **géén JavaScript-API**
  (`lib/typescript.js` bestaat niet). Twee bruggen hangen daaraan:
  1. `experimental.useTypeScriptCli: true` in `next.config.ts` — zonder deze
     vlag denkt `next build` dat TypeScript ontbreekt en installeert het
     ongevraagd een tweede packagemanager.
  2. `scripts/link-typescript6.mjs` (postinstall, vereist Node naast Bun) —
     symlinkt de oude API uit `@typescript/typescript6` voor
     typescript-eslint + ts-api-utils. Zonder deze stap crasht `bun run lint`
     vóór de eerste regel.
  Beide mogen weg zodra typescript-eslint de 7.1-API ondersteunt.
- **Drizzle + Neon Postgres.** ⚠️ **Lokaal en productie delen één database.**
  Er is geen staging-DB; je lokale `bun dev` schrijft in de productiedata.
  Behandel elke lokale actie als een productie-ingreep. Migraties:
  `.sql`-bestanden in `db/migrations/`, gegenereerd uit `db/schema.ts`;
  toepassen met `bun run db:migrate` (eigen idempotente runner over de Neon
  HTTP-driver; `drizzle-kit migrate` hangt op de WebSocket-driver). Toegepaste
  migraties staan in de tabel `__migrations`.
- **Better Auth, magic link — zonder mailprovider.** De magic link wordt niet
  gemaild maar ge-`console.log`d: lokaal in de `bun dev`-terminal, op productie
  in de Vercel-logs (`vercel logs --environment production --since 15m
  --expand --no-branch` — `--expand` is verplicht, anders zie je alleen de
  POST-regel). Link 5 min geldig. Een Resend/mail-integratie is op 19 aug 2026
  gebouwd én gerevert — geen mail onder brinklicht.nl; evt. later een
  lumenlogic-domein. Aanvullend: allowlist op `/settings`, accounts via
  `/admin/users` (PIN + `/activate`), wachtwoord-login en reset
  (`/forgot-password`, `/reset-password`), noodluik
  `scripts/zet-wachtwoord.ts` (zet wachtwoord op bestáánd account).
  Better Auth-user-ids zijn 32 alfanumerieke tekens, **geen uuid** — daarom is
  `events.entity_id` sinds migratie 0023 `text`; cast nooit `entity_id::uuid`.
- **Tailwind 4 + shadcn/ui** · **Bun** (runtime én packagemanager) ·
  **Vercel** — ⚠️ **elke push naar `main` deployt automatisch naar productie**,
  binnen seconden, zonder preview- of goedkeuringsstap.
- **Supabase** — uitsluitend archief van de brondata (project "Brinklicht"),
  blijft bij Timo, zit niet in het runtime-pad. `data/source/*.csv` is de
  export daarvan; `data/` is read-only en staat niet in git.
- **Anthropic API** — ⚠️ **per 20 aug 2026 is `ANTHROPIC_API_KEY` uit de
  productie-env verwijderd.** De AI-routes staan daarmee uit: de
  PDF-leesroute (`lib/ai/leesroute.ts`, `lib/ai/ocr.ts`) en het
  matching-vangnet (`lib/ai/vangnet.ts`). Dit is een ontworpen toestand, geen
  bug: de app logt `*_skipped_no_key`-events en valt terug op het
  deterministische pad. Tekst-PDF's en gestructureerde bestanden werken
  volledig; gescande boeken/handschrift worden niet meer gelezen en er komen
  geen AI-suggesties. Her-activeren = key in de Vercel-env; budgetcap
  `llm_budget_eur` in `app_settings` (via `/settings`), uitgaven in
  `llm_usage`; budget `0` is een echt plafond, alleen `null` = geen cap.

## 2. De vijf ijzeren regels (elke sessie, elke feature)

1. **Geen webshop.** Geen winkelwagen, checkout of publieke prijzen.
2. **Geld beïnvloedt nooit de ranking.** Matching-logica strikt gescheiden
   van commercie; er bestaat geen codepad waar betaling volgorde of
   zichtbaarheid beïnvloedt.
3. **Verlopen prijslijst = product zichtbaar zónder prijs.** ⚠️ Deze regel is
   op **19 aug 2026 herschreven** (was: "product onzichtbaar in álle
   zoekresultaten" — die oude formulering staat nog in oudere docs, o.a.
   `docs/RUNBOOK.md` §6/§8 en `docs/BUILD-PLAN.md`; de nieuwe wint). De
   bescherming is identiek: er wordt **nooit** geoffreerd op verouderde
   prijzen. Maar verbergen is vervangen door melden, omdat bestekschrijvers
   bestekken van vorig jaar hergebruiken en die artikelnummers een treffer
   moeten geven. **Afdwinging (centraal, nooit per query):**
   `db/migrations/0022_vervallen_zichtbaar.sql` — de view `visible_products`
   levert `price_state` (`'actueel' | 'prijslijst_verlopen' |
   'uit_prijslijst'`) en zet `gross_price`, `currency`, `price_list_id` en
   `valid_until` op NULL zodra de state niet `'actueel'` is. Leeskant:
   `lib/prijstoestand.ts`. Altijd rood gemarkeerd, altijd met de melding
   welke prijslijst de laatst bekende was. Achtergrond:
   `docs/probleem-vervallen-producten.md`. `visible_products` is de enige
   leesroute voor kandidaten; de basistabel `products` alleen voor
   "merk bestaat"-checks.
4. **Fase-aware, default = veilig.** Dossier-veld `phase`
   (`tender | awarded`); tender-stand toont nooit alternatieven-suggesties.
5. **Alles gelogd.** Elke zoekactie/match/offerte in de append-only
   `events`-tabel (entity, action, actor, jsonb-payload). AI-runs herken je
   aan `action LIKE 'ai_%'`; alleen `search`-events hardcoderen actor
   `ai:vangnet`, andere events dragen het ingelogde e-mailadres. Deze loglaag
   is het fundament voor het latere merk-analytics-verdienmodel — nooit
   afzwakken.

Daarnaast het domeinmodel: de **vijfstatussen-regelset**
(groen/geel/blauw/rood/paars, `docs/matching-regelset.md`,
`docs/MASTERPLAN.md` §3) met zeven geteste invarianten, o.a.: niets
stilzwijgend weglaten, aanvraagvolgorde nooit hersorteren, lager IP = altijd
rood, elke afwijking benoemen, ontbrekende data ≠ afwijkende data,
statustoekenning is deterministische code — een LLM kent **nooit** een status
toe. Let op de semantiek: **groen betekent "dit ís het gevraagde product"**,
niet "gelijkwaardig" (open punt, zie `docs/goal-groen-betekent-zeker.md`).
Toleranties leven als code in `lib/matching/`.

## 3. Conventies (verplicht)

- **Server actions:** altijd `requireSession()` → `parseForm()` (zod, via
  `lib/validation.ts`) → repo. Nooit een kale `String(formData.get(…))` of
  `as`-cast een db-kolom in. De repo-laag vertrouwt zijn invoer; alleen
  domeinregels die geld of een klantdocument raken staan óók in de repo.
  Conventie + waarom: `docs/INVOERVALIDATIE.md`. Raak je een oude action aan,
  zet hem om.
- **Client-side een action awaiten:** uitsluitend via `callAction()` uit
  `lib/next-action-result.ts`, nooit een kale `await` in `try/catch`. Een
  action die `redirect()` aanroept laat zijn promise rejecten met
  `NEXT_REDIRECT` (navigatiesignaal, geen fout), en `requireSession()`
  redirect naar `/login` — een lege `catch` maakt van elke geslaagde actie een
  mislukking (is precies één keer gebeurd).
- **Pushen: UITSLUITEND `bash scripts/safe-push.sh [<sha>]`** (of `DRY_RUN=1`
  eerst). Een kale `git push origin main` stuurt álle lokale main-commits mee
  — ook halffabricaat van een parallelle sessie — en deployt die naar
  productie; ging in week 1 vier keer mis. De pre-push-hook
  (`bash scripts/install-git-hooks.sh`, eenmalig per clone) weigert de kale
  push. Een AI-sessie pusht **nooit** uit eigen beweging: committen op de
  huidige branch en stoppen.
- **Parallelle sessies bestaan.** Andere sessies shippen naar main terwijl jij
  werkt: altijd eerst `git fetch`, nooit de lokale main vertrouwen.
- **Tests:** elke feature krijgt een white-box RSC-test met screenshots
  (light/dark × mobile/desktop) vóór hij af heet. De PNG's staan naast de
  testfiles — bekijk ze, dat is je zicht op wat je bouwt. Stack:
  vitest-plugin-rsc + PGlite + drizzle-seed; browser-tests headless Chromium
  (`bunx playwright install chromium` eenmalig). Bestaande testnaden hebben
  voorrang op nieuwe.
- **Issue tracking:** niet in GitHub Issues maar in `docs/`:
  `docs/probleem-<slug>.md` (gemeten probleem) → `docs/goal-<slug>.md`
  (spec + beslissingen). Zie `docs/agents/issue-tracker.md`. Aannames en
  open eindes altijd bijschrijven in `HANDOVER.md`.

## 4. Commando's

| Commando | Doel |
|---|---|
| `bun dev` | dev-server (magic link verschijnt in deze terminal) |
| `bun run typecheck` | `tsc --noEmit`, hele repo ±1 s |
| `bun vitest run` | volledige suite incl. screenshot-tests |
| `bun run lint` | ESLint (vereist de postinstall-symlink, §1) |
| `bun run db:generate` / `bun run db:migrate` | migratie genereren / toepassen |
| `bun run import` | brondata `data/source/*.csv` → database |
| `bash scripts/safe-push.sh [<sha>]` | de enige toegestane push naar main |
| `vercel logs --environment production --since 15m --expand --no-branch` | productielogs / magic link |

## 5. Mappenstructuur — waar wat leeft

- `app/` — App Router. Kernroutes: `projects/` (dossiers, review, estimate,
  `offerte/pdf`), `brand/` (brandportal: prijslijsten-upload 66-velden-Excel,
  dashboard, data), `brand-management/`, `catalog/`, `products/`, `data/`
  (verrijkingswerkbank), `analytics/`, `settings/` (allowlist, AI-budget),
  `admin/` (users), `login/`, `activate/`, `forgot-password/`,
  `reset-password/`, `api/` (o.a. `matchstation/`).
- `lib/` — domein- en infralaag: `repo/` (alle datatoegang, o.a.
  `dossiers.ts`, `estimate.ts`, `brand-portal.ts`, `matchstation.ts`),
  `matching/` (engine + toleranties), `ai/` (vangnet, ocr, leesroute — uit
  zonder key), `pdf/` (estimate-PDF via pdf-lib; let op de
  tslib-workaround in `vitest.config.ts`), `prijstoestand.ts` (regel 3),
  `validation.ts`, `next-action-result.ts`, `auth*.ts`.
- `db/` — `schema.ts`, `migrations/` (0001–0024), `migrate.ts` (eigen runner).
- `scripts/` — `safe-push.sh`, `install-git-hooks.sh`,
  `link-typescript6.mjs`, `zet-wachtwoord.ts`, `matchstation/`
  (PowerShell-watcher voor de EliteDesk-machine), eval-scripts.
- `docs/` — alle plannen, probleem/goal-docs, RUNBOOK, migratiedraaiboek
  (`spike-2.3-migratie-draaiboek.md` — volledige dienst- en env-inventaris).
- `data/` — read-only brondata, niet in git; apart aangeleverd.
- `tests/`, `__screenshots__/` — testinfra en screenshotoutput.

Env-keys (`.env.local`): `DATABASE_URL` (Neon = productie!),
`BETTER_AUTH_SECRET` (zelfde waarde als Vercel-env), `BETTER_AUTH_URL`
(lokaal weglaten mag; `lib/auth-factory.ts` valt terug op `VERCEL_URL` /
localhost), `ANTHROPIC_API_KEY` (optioneel; ontbreekt bewust in productie).

## 6. Bekende valkuilen (uit `HANDOVER.md` — lees dat bij twijfel integraal)

1. **Eén database voor dev en prod.** `llm_usage` en `events` kunnen dev-
   en prod-verkeer niet onderscheiden; trap niet in "dit kwam uit productie".
2. **Vitest flakt onder belasting**: willekeurige 15s-timeouts in de volle
   suite; nooit twee runs tegelijk; flaky files solo verifiëren. Verse
   git-worktree zonder `node_modules` → DB-tests falen met "Invalid FS bundle
   size": eerst `bun install`, geen codefout.
3. **Migratie 0024 (import_source_files) was op 20 aug nog niet tegen Neon
   gedraaid** — controleer `__migrations` vóór/bij de eerstvolgende deploy.
4. **Testdata in productie**: dossier `49c6340e…` ("ZZ-TEST 0.1") staat er
   bewust nog (bewijsspoor); testmerk ZZTEST (QA-14) wordt zichtbaar zodra
   0022 deployt — opruimen bij eerstvolgende push.
5. **Wachtwoordresets van vóór de 0023-fix** kunnen voltooid zijn zonder
   session-revocation — openstaande actie: Vercel-logs nalopen op de
   uuid-fout en getroffen sessies handmatig intrekken.
6. **`deleteProjectsAction` geeft geen uitkomst-feedback** (skipped oogt als
   succes) en nieuwe FK's zonder `ON DELETE CASCADE` op de dossier-boom
   breken de delete stil — check de cascade-keten bij elke nieuwe tabel.
7. **pdf-lib hangt op tslib v1** — de pre-resolve-plugin in
   `vitest.config.ts` niet verwijderen.
8. **Matchstation (EliteDesk)**: `scripts/matchstation/` bevat een
   PowerShell-watcher die werk ophaalt via `/api/matchstation/werk` en
   resultaat POST naar `/api/matchstation/resultaat`; de PowerShell-scripts
   zijn nooit op een Windows-machine getest en de M2-af-toets is niet
   gedraaid. `docs/goal-agent-matching.md` staat niet in git (los op schijf).
   Draait op een Claude-sessie — zonder AI-toegang bij Brink ligt dit pad stil.
9. **Neon-branches zijn niet duurzaam** (kunnen zonder aankondiging
   verdwijnen); leg meetuitkomsten buiten de database vast. Neon
   point-in-time-restore is nog niet geoefend (RUNBOOK §7-placeholder).
10. **Merkloze regels kunnen catalogus-breed vals groen matchen** op generieke
    tokens ("3000K") — bekend open semantiek-punt ("nooit groen zonder
    gevraagd merk" is een besluit voor de producteigenaar).
11. **Prijslijst-voorbewerking leeft buiten de repo**: ruwe
    leveranciers-lijst → 66-velden-Excel was een AI-geassisteerd proces bij
    Timo; de brandportal verwacht het ingevulde Excel.
12. Twee meta-lessen bovenaan `HANDOVER.md`: toets je meetinstrument na elke
    ingreep opnieuw tegen een bekende meting, en een meting bewijst alleen de
    vraag die hij letterlijk stelde.

## 7. Werkwijze voor een nieuwe sessie

1. `git fetch` en controleer waar `origin/main` staat.
2. Lees `CLAUDE.md`; bij bouwen ook het relevante `docs/goal-*.md` of schrijf
   eerst een `docs/probleem-*.md`.
3. Bouw test-first op de bestaande naden (white-box RSC + screenshots);
   `bun run typecheck` onderweg, volle suite aan het eind.
4. Kleine commits op de huidige branch. **Niet pushen** — pushen gebeurt via
   `safe-push.sh`, alleen op expliciet akkoord van de mens, want push = deploy.
5. Aannames en open eindes bijschrijven in `HANDOVER.md`.
