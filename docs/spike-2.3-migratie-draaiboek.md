# Spike 2.3 — Migratiedraaiboek: van Timo's accounts naar Brink

> **Status:** spike-resultaat (papier only, niets uitgevoerd). Timebox 3 u.
> **Doel:** dit document wordt in week 4 blind gevolgd bij de daadwerkelijke overdracht.
> **Voorwaarde (besluit C8):** de Brink-accounts bestaan nog niet — Timo maakt ze aan.
> Overal waar "Brink-account" staat: invullen zodra dat account er is.
>
> **Bronverantwoording:** alles hieronder is teruggevonden in de repo/docs (verwijzing
> per claim). Transfer-procedures van de leveranciers zijn beschreven naar beste kennis
> en gemarkeerd met ⚠️ *verifiëren tegen actuele leveranciersdocs op de dag zelf* —
> die procedures veranderen soms.

## 0. Wat er werkelijk aan diensten hangt (inventaris tegen de bron)

| Dienst | Waar teruggevonden | Rol |
|---|---|---|
| **Vercel** | `docs/lumenlogic.md:56` — project `lumenlogic`, account `timo-8534`, live op https://lumenlogic.vercel.app; elke push naar `main` deployt automatisch (CLAUDE.md) | Hosting + productie-env |
| **Neon** | `drizzle.config.ts` (`DATABASE_URL`), `@neondatabase/serverless` in `package.json`; `docs/BUILD-PLAN.md:41`: Neon **via Vercel Marketplace** | Enige werkdatabase; lokaal én productie delen dezelfde DB (`docs/lumenlogic.md:57`) |
| **GitHub** | `git remote`: `github.com/Timo-AInstein/lumenlogic` | Coderepo; bron van de auto-deploy |
| **Supabase** | `docs/plan-datamodel-productspecs.md` (besluit B1): project "Brinklicht" (was "Thursd Chatbot", ref `uvmeytxejlzvdgjgthmr`) | **Alleen archief/bron**, niet in het runtime-pad; app draait op Neon |
| **Anthropic** | `lib/ai/shared.ts` (`ANTHROPIC_API_KEY`), `@anthropic-ai/sdk` | AI-vangnet + OCR/leesroute. **Stond niet in de sprintopdracht, hoort wél in de overdracht** |
| **Domein/DNS** | Nergens: geen `vercel.json`, geen custom domein gevonden; Resend/DNS-aanvraag is vervallen (sprintplan besluit 6) | **N.v.t.** — de app draait uitsluitend op `lumenlogic.vercel.app` |
| Mailprovider | Geen (magic link via serverlogs, `lib/auth.ts`) | N.v.t. |
| CI | Geen `.github/workflows` | N.v.t. — deploy loopt via Vercel-git-integratie |

### Env-keys (alleen namen; waarden staan lokaal in `.env.local` en in de Vercel-project-env)

| Key | Gevonden in | Leeft nu | Moet heen |
|---|---|---|---|
| `DATABASE_URL` | `drizzle.config.ts`, `db/` | `.env.local` + Vercel-env | Vercel-env van het Brink-project; lokaal bij wie ontwikkelt |
| `BETTER_AUTH_SECRET` | `HANDOVER.md` ("zet dezelfde waarde als Vercel-env, anders werkt magic-link niet") | `.env.local` + Vercel-env | Idem — **zelfde waarde houden** tijdens de migratie, anders breken lopende sessies/links |
| `BETTER_AUTH_URL` | `lib/auth.ts` (optioneel; valt terug op `VERCEL_URL`) | Onbekend of hij in Vercel-env staat — **open vraag O1** | Alleen zetten als de productie-URL wijzigt |
| `ANTHROPIC_API_KEY` | `lib/ai/shared.ts` | Vermoedelijk Vercel-env + `.env.local` — **open vraag O2** (niet verifieerbaar vanuit de repo) | Nieuwe key onder een Brink-Anthropic-account |
| `VERCEL_URL` | `lib/auth.ts` | Door Vercel zelf gezet | Niets doen |
| `IMPORT_LIMIT`, `EVAL_DIR` | `scripts/` | Alleen lokaal/dev | Niets doen |

---

## 1. Volgorde en afhankelijkheden (het hele draaiboek in één oogopslag)

```
Vooraf (Timo + Brink):  Brink-accounts aanmaken: GitHub-org, Vercel-team,
                        Neon-org, Supabase-org, Anthropic-account  [alleen eigenaar]

Stap 1  GitHub-repo-transfer            (week 3-buffer, laag risico, geen downtime)
Stap 2  Vercel-git-integratie herkoppelen aan de nieuwe repo-locatie
        ── vanaf hier deployt main weer ──
Stap 3  Vercel-project-transfer naar het Brink-team (env-vars gaan mee)
Stap 4  Neon-transfer (LET OP: Marketplace-koppeling — zie §3, open vraag O3)
Stap 5  Anthropic: nieuwe key onder Brink, oude key intrekken
Stap 6  Supabase-project-transfer (archief; los van alles, kan wanneer dan ook)
Stap 7  Domein/DNS: n.v.t. nu; recept voor later in §7
Naderhand: Timo terugzetten naar collaborator; secrets-rotatie afronden
```

Waarom deze volgorde:
- **GitHub eerst**: de repo is de bron van de auto-deploy; zolang de Vercel-koppeling
  niet is herkoppeld (stap 2) deployt een push naar main **niet** — dat venster wil je
  kort en gepland hebben, los van al het andere.
- **Vercel vóór Neon**: als Neon inderdaad een Vercel-Marketplace-resource is
  (BUILD-PLAN), hangt de Neon-billing/ownership aan het Vercel-account en bepaalt de
  uitkomst van stap 3 wat er bij stap 4 nog te doen valt.
- **DNS zou pas na een werkende deploy komen** — hier n.v.t., want er is geen domein.

---

## 2. Stap 1+2 — GitHub (het logische vooruitwerk, staat al in de week 3-buffer)

**Wat gaat over:** de repo `Timo-AInstein/lumenlogic` → Brink-org, inclusief issues,
instellingen en git-history. De pre-push-hook is lokaal per clone
(`scripts/install-git-hooks.sh`) en verhuist niet mee — elke nieuwe clone moet hem
opnieuw installeren.

**Procedure** ⚠️ *verifiëren*: GitHub → repo → Settings → Danger Zone → *Transfer
ownership* → Brink-org. GitHub laat oude URL's redirecten (clone/fetch blijft werken),
maar **webhooks/integraties zoals de Vercel-git-koppeling breken** bij transfer.

**Downtime:** de site blijft gewoon draaien. Wél: tussen transfer en herkoppeling
deployt een push naar `main` **niet meer** — dat is stil falen. Daarom direct erna:
Vercel-dashboard → project `lumenlogic` → Settings → Git → repo opnieuw koppelen aan
de nieuwe locatie, en een no-op-commit via `bash scripts/safe-push.sh` als bewijs dat
de keten weer deployt.

**Wie:** transfer starten = repo-owner (Timo); accepteren = Brink-org-admin.
Herkoppelen = wie toegang tot het Vercel-project heeft.

**Terugval:** repo terug-transfereren naar `Timo-AInstein` (zelfde procedure andersom)
en de Vercel-koppeling weer op de oude locatie zetten. Redirects vangen tussentijdse
clones op.

**Na de transfer:** lokale remotes omzetten
(`git remote set-url origin <nieuwe URL>`) — werkt door de redirect ook zonder, maar
doe het toch, expliciet is beter.

**Tijd:** 15–30 min + deploy-bewijs. Risico: laag.

## 3. Stap 3+4 — Vercel en Neon (het hart van de migratie)

### Vercel

**Wat gaat over:** project `lumenlogic` (deployments, env-vars, de
`lumenlogic.vercel.app`-URL) van account `timo-8534` naar een Brink-team.

**Procedure** ⚠️ *verifiëren*: Vercel ondersteunt project-transfer tussen
accounts/teams (dashboard → project → Settings → *Transfer*). Env-variabelen en de
`.vercel.app`-subdomeinnaam gaan daarbij mee; deployments blijven staan.
**Voorwaarde:** het Brink-team moet op een plan zitten dat het gebruik dekt
(eigenaar/betaalgegevens = alleen Brink).

**Downtime:** in principe geen — de lopende productie-deployment blijft serveren
tijdens de transfer. Gebruikers merken niets zolang de URL gelijk blijft. Plan het
tóch in een rustig venster en push niet naar main tijdens de transfer.

**Wie:** transfer starten = Timo (huidige owner); accepteren = Brink-team-owner.

**Terugval:** project terug-transfereren naar `timo-8534`. Zolang niemand de
`.vercel.app`-URL of env-vars aanraakt, is dit symmetrisch en veilig.

**Na de transfer verifiëren:** (a) site laadt, (b) magic-link-login werkt (bewijst
`BETTER_AUTH_SECRET` + `DATABASE_URL` mee-verhuisd), (c) een push via safe-push
deployt, (d) een PDF-import met AI-route werkt (bewijst `ANTHROPIC_API_KEY`).

**Tijd:** 30–60 min incl. verificatie. Risico: middel (vooral O3 hieronder).

### Neon — met de grote open vraag van deze spike

**Wat gaat over:** de ene Neon-database waar lokaal én productie op draaien
(`docs/lumenlogic.md:57`). Er is geen aparte staging-DB.

**⚠️ Open vraag O3 (belangrijkste van het draaiboek):** `docs/BUILD-PLAN.md:41` zegt
dat Neon **via de Vercel Marketplace** is aangemaakt. Als dat klopt, is de
Neon-resource administratief aan het Vercel-account gebonden en zijn er twee routes:
1. **De resource verhuist mee met de Vercel-project-transfer** (Marketplace-resources
   hangen aan het team) — dan is stap 4 gratis meegenomen; alleen verifiëren.
2. **Hij verhuist niet mee** — dan moet de database losgekoppeld of overgezet worden:
   Neon ondersteunt project-transfer tussen organisaties (⚠️ *verifiëren*; ging
   historisch via een transfer-request/support). **Cruciaal:** bij een echte
   Neon-org-transfer blijft de connection-string (host) gelijk — dan is er **geen
   downtime en hoeft `DATABASE_URL` niet te wijzigen**.
   
**Vóór week 4 uitzoeken** (kan Timo nu al, read-only in beide dashboards): staat de
database als Marketplace-integratie in Vercel, of als los project in een eigen
Neon-account? Dat antwoord bepaalt welke route stap 4 volgt.

**Worst case-route (alleen als transfer onmogelijk blijkt):** nieuwe Neon-DB onder
Brink → `bun run db:migrate` + data-export/import (`pg_dump`/restore) → nieuwe
`DATABASE_URL` in Vercel-env → redeploy. Dát heeft wél een venster: tussen de dump en
de switch zijn schrijfacties (nieuwe dossiers, events, logins) kwijt. Venster plannen
('s avonds, niemand ingelogd), duur ~30–60 min. Gebruiker ziet in dat venster een
werkende site tegen de oude DB; na de switch even opnieuw inloggen (sessies staan in
de DB en gaan bij een dump/restore gewoon mee, maar een login tijdens het venster
belandt in de oude DB).

**Terugval:** oude `DATABASE_URL` terugzetten in Vercel-env + redeploy — de oude DB
niet verwijderen tot minimaal een week na een geslaagde migratie.

**Wie:** dashboards/transfers = eigenaren (Timo → Brink); dump/restore/migrate = ontwikkelaar.

**Tijd:** route 1: 15 min verificatie. Route 2: 1–2 u. Worst case: dagdeel incl. venster.

## 4. Stap 5 — Anthropic (vergeten dienst, wel verplicht)

De AI-routes (vangnet, OCR, leesroute) draaien op `ANTHROPIC_API_KEY`
(`lib/ai/shared.ts`); zonder key vallen ze stil terug op het deterministische pad —
de site blijft werken, alleen de AI-leesroute niet. Budgetbewaking zit in de app zelf
(`llm_usage.cost_eur`).

**Doen:** Brink maakt een eigen Anthropic-account/workspace aan [alleen eigenaar +
betaalgegevens] → nieuwe API-key → in de Vercel-env zetten (naam blijft
`ANTHROPIC_API_KEY`) → redeploy → AI-import testen → daarna pas Timo's oude key
intrekken. **Terugval:** oude key terugzetten (niet intrekken vóór het bewijs).
Geen downtime; hooguit een AI-loze minuut rond de redeploy. Tijd: 30 min.

## 5. Stap 6 — Supabase (archief, laag risico, onafhankelijk)

Project "Brinklicht" (ref `uvmeytxejlzvdgjgthmr`) is **bron/archief, geen backend**
(besluit B1); de app raakt hem nooit aan runtime. Transfer kan dus op elk moment en
heeft nul downtime-impact.

**Procedure** ⚠️ *verifiëren*: Supabase-dashboard → project → Settings → General →
*Transfer project* naar de Brink-org (of: Brink-org aanmaken en het project daarheen
verhuizen). **Wie:** Timo (owner) start, Brink accepteert. **Terugval:** terug-transfereren;
er verandert niets aan data. **Let op:** RLS staat uit op deze bron (bekend, HANDOVER
"Open eindes") — bij overdracht even benoemen richting Brink. Tijd: 15 min.

## 6. Stap 7 — Domein/DNS: nu n.v.t., recept voor later

**Bevinding tegen de bron:** er is geen custom domein. Geen `vercel.json`, geen
domeinverwijzing in code of config; de enige productie-URL is `lumenlogic.vercel.app`
en de Resend/DNS-aanvraag is expliciet vervallen (sprintplan besluit 6). Er valt dus
**niets te verhuizen**.

**Recept als Brink later een domein wil** (bv. `lumenlogic.brinklicht.nl`):
1. Eerst een werkende deploy onder het Brink-Vercel-team (stap 3 klaar).
2. Domein toevoegen in Vercel → CNAME/A-record zetten bij de DNS-beheerder van
   `brinklicht.nl` (dat is Brinks bestaande beheer, niet iets van dit project).
3. `BETTER_AUTH_URL` in de Vercel-env op de nieuwe URL zetten (`lib/auth.ts` valt
   anders terug op `VERCEL_URL`) en de login-flow hertesten.
4. `lumenlogic.vercel.app` blijft als alias werken — oude links breken niet.

## 7. Open vragen (expliciet, liever dan verzonnen zekerheid)

| # | Vraag | Wie kan hem beantwoorden | Blokkeert |
|---|---|---|---|
| O1 | Staat `BETTER_AUTH_URL` daadwerkelijk in de Vercel-env, of leunt prod op de `VERCEL_URL`-fallback? | Timo, read-only in Vercel-dashboard (Settings → Environment Variables — alleen namen noteren) | Niets nu; wel relevant bij een later custom domein |
| O2 | Staat `ANTHROPIC_API_KEY` in de Vercel-env (AI-routes live) of alleen lokaal? | Idem | Stap 5-verificatie |
| O3 | Is de Neon-DB een Vercel-Marketplace-resource (verhuist mee) of een los Neon-project? | Timo, read-only in Vercel- én Neon-dashboard | **Stap 4 volledig** — dit vóór week 4 beantwoorden |
| O4 | Op welk Vercel/Neon-plan moet het Brink-team zitten (kosten)? | Timo + Brink bij het aanmaken van de accounts | Vooraf-stap |
| O5 | Is er ergens een Vercel Deploy Hook, cron of externe webhook op dit project? In de repo staat niets, maar dashboard-config is vanuit de repo niet zichtbaar | Timo, read-only in Vercel-dashboard | Volledigheid stap 3 |

## 8. Blind-afvink-checklist

**Vooraf (Brink + Timo, zodra de accounts er zijn)**
- [ ] Brink: GitHub-org, Vercel-team (+plan/betaal), Neon-org, Supabase-org, Anthropic-account aangemaakt
- [ ] O1/O2/O5 beantwoord (Vercel-dashboard, alleen namen noteren)
- [ ] O3 beantwoord: Neon = Marketplace-resource ja/nee → route gekozen voor stap 4
- [ ] Afgesproken migratievenster; niemand pusht naar main tijdens de stappen hieronder

**GitHub (stap 1+2)**
- [ ] Repo-transfer `Timo-AInstein/lumenlogic` → Brink-org gestart (Timo) en geaccepteerd (Brink)
- [ ] Vercel-git-integratie herkoppeld aan de nieuwe repo-locatie
- [ ] Bewijs: no-op-commit via `bash scripts/safe-push.sh` deployt binnen ~1 min
- [ ] Lokale remotes omgezet; `scripts/install-git-hooks.sh` gedraaid in elke verse clone

**Vercel (stap 3)**
- [ ] Project-transfer `lumenlogic` → Brink-team gestart en geaccepteerd
- [ ] Site laadt op `lumenlogic.vercel.app`
- [ ] Magic-link-login werkt (link uit Vercel-function-logs, `--expand`!)
- [ ] Push via safe-push deployt
- [ ] Env-var-namen in het nieuwe team compleet: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY` (+ evt. `BETTER_AUTH_URL`)

**Neon (stap 4 — route afhankelijk van O3)**
- [ ] Route 1: geverifieerd dat de resource onder het Brink-team hangt — klaar
- [ ] Route 2: Neon-org-transfer uitgevoerd; connection-string ongewijzigd bevestigd
- [ ] App leest/schrijft: dossier openen + zoekactie (event verschijnt in de events-tabel)
- [ ] Oude toegang pas ná een week zonder incidenten opruimen

**Anthropic (stap 5)**
- [ ] Nieuwe Brink-key in Vercel-env, redeploy, AI-import getest
- [ ] Oude key ingetrokken (pas ná het bewijs)

**Supabase (stap 6)**
- [ ] Project "Brinklicht" getransfereerd naar de Brink-org
- [ ] RLS-uit-status benoemd richting Brink

**Afronding**
- [ ] Timo teruggezet naar collaborator (GitHub) / member (Vercel, Neon, Supabase)
- [ ] `BETTER_AUTH_SECRET` geroteerd ná de overdracht (nieuwe waarde alleen in Brink-env; iedereen logt één keer opnieuw in) — optioneel maar netjes
- [ ] Dit document bijgewerkt met wat er in werkelijkheid anders liep

## 9. Tijdsinschatting (realistisch, incl. verificatie)

| Onderdeel | Tijd | Downtime voor de gebruiker |
|---|---|---|
| GitHub + herkoppelen | 30–45 min | Geen (alleen: deploys pauzeren kort) |
| Vercel-transfer | 30–60 min | Geen |
| Neon route 1 / route 2 / worst case | 15 min / 1–2 u / dagdeel | Geen / geen / 30–60 min schrijfvenster |
| Anthropic | 30 min | Geen (AI-route hooguit 1 min) |
| Supabase | 15 min | Geen |
| Domein/DNS | n.v.t. | — |
| **Totaal (verwachte route)** | **±een halve dag**, verspreid over: GitHub in de week 3-buffer, de rest in één week 4-venster | Geen, mits O3 route 1 of 2 blijkt |
