---
type: project
status: live
aliases: ["Lumen Logic status", "LumenLogic live", "Brink Licht platform status"]
links: ["[[brink-licht]]", "[[eduard]]", "[[ainstein]]"]
confidence: high
last_updated: 2026-07-09
---

# Lumen Logic — STATUS (lees dit eerst in een nieuwe sessie)

> Actuele stand van het Brink Licht-platform. De koers staat in `docs/MASTERPLAN.md`
> (in de coderepo), het complete wat/hoe in `docs/FUNCTIONEEL-ONTWERP.md`. Dít bestand is
> de **operationele stand**: wat draait, waar, hoe je erin komt, en wat er nog open is.

## ⭐ Werkwijze vanaf nu — onderdeel voor onderdeel (LEES DIT EERST)

Het platform is af en live. Vanaf **2026-07-09** verbetert Timo het **onderdeel voor onderdeel,
top-down** — geen brede sweeps meer. Per onderdeel (bv. **Aanvraag→Estimate**, **Analytics**,
**Merk**) werken we in **drie fases** (aangescherpt 2026-07-09), en er wordt **niet gebouwd**
vóór fase 1 en 2 klaar zijn:

1. **Fase 1 — Idee uitwerken.** Haal éérst bij Timo op wat het onderdeel moet zijn: doel,
   gebruiker, wat hij wil zien en kunnen. Vraag door tot het scherp is (de **grill-me**-skill mag
   hiervoor). Sluit af met een **nulmeting**: loop het huidige scherm langs en zet het naast die
   wens als een **genummerde lijst** (bv. Analytics 1, 2, 3…), elk met een oordeel:
   ✅ klopt · ⚠️ mist · ❌ werkt niet. Leg alles vast — in `docs/FUNCTIONEEL-ONTWERP.md`
   (coderepo) of een onderdeel-notitie in `projects/lumenlogic/onderdelen/<onderdeel>.md`.
2. **Fase 2 — Plannen.** Werk de ⚠️/❌-punten uit tot een implementatieplan. Zet hier
   **meerdere agents** in die elkaars werk controleren (bv. plan-agent + kritische reviewer),
   binnen de bestaande tech stack. Plan eindigt met Timo's akkoord.
3. **Fase 3 — Bouwen.** Pak de punten één voor één, ook hier met **agents die elkaar checken**
   (bouwer + onafhankelijke reviewer/verifier), test, vink af. Pas als het onderdeel echt áf
   is → door naar het volgende.

**Tech stack is heilig:** de bestaande stack van de coderepo — Next.js + Bun + Neon Postgres +
Better Auth + Vercel, deterministische logica, `bun vitest run` groen — niets nieuws introduceren
zonder overleg.

**Waarom:** Timo wil grip en overzicht, en elk onderdeel echt klaar hebben voordat het volgende
komt. Zie ook de memory `lumenlogic-werkwijze`. Bij twijfel: eerst de wens ophalen, niet gokken.

**Volgorde (door Timo bepaald):** 1e = **Aanvraag→Estimate** (de kernflow, "grootste win") —
zie `onderdelen/aanvraag-tot-estimate.md`. **✅ AFGEROND 2026-07-14** (fase 1 t/m 3, live
gedeployed). Analytics is geparkeerd (nulmeting staat al in `onderdelen/analytics.md`).
Parallel loopt een tweede sessie aan **merkrelaties/datamodel** (migratie 0007/0008-stroom).

## In één zin

Lumen Logic = de spec-, calculatie- en offertetool voor Brink Licht (vijfstatussen-regelset).
**Runs 1–6 én de latere horizon (H2/H3) zijn gebouwd en staan LIVE.**

## Waar alles staat

- **Coderepo:** `~/Documents/dev/lumenlogic` (NIET in de vault — aparte git-repo).
- **Live URL:** https://lumenlogic.vercel.app  (Vercel-project `lumenlogic`, account `timo-8534`).
- **Database:** Neon Postgres (via `DATABASE_URL` in `.env.local` én in Vercel-env). Lokaal en
  productie delen **dezelfde** Neon-DB. Migraties t/m `0006_projectstatus_ai` + `0008_merkrelaties`
  toegepast (0007 is nog in-flight bij de merkrelaties-sessie).
- **Git:** branch **`runs-4-6-vijfstatussen`**. Deploys gaan via de **Vercel-CLI** (`vercel --prod`),
  **niet** via GitHub — de branch is (nog) **niet gepusht** naar `github.com/Timo-AInstein/lumenlogic`.
- **Test-armaturenboek:** `docs/examples/test-armaturenboek.pdf` (ook in `~/Downloads`). 20 regels,
  lokt bewust alle vijf statussen uit. Feitelijke verdeling (gemeten 2026-07-14):
  **9 groen · 5 geel · 2 rood · 2 blauw · 2 paars**; 3 van de 5 geel gaan automatisch door
  als bijna-match. Genereren: `bun scripts/gen-test-armaturenboek.ts`.

## Inloggen (magic link — nog geen mailprovider)

Login = Better Auth magic link naar een adres op de **allowlist**. Er is nog géén mailprovider
(Resend), dus de link komt niet per mail. Ophalen kan op twee manieren:
- De link staat in de **serverconsole/Vercel function-logs** na een aanvraag op `/login`.
- Of genereer 'm rechtstreeks (schrijft token in dezelfde Neon-DB):
  `bun --env-file=.env.local -e '...auth.api.signInMagicLink({body:{email, callbackURL:"/dossiers"}, headers:new Headers()})...'`
  daarna het token uit de `verification`-tabel lezen en de prod-URL bouwen:
  `https://lumenlogic.vercel.app/api/auth/magic-link/verify?token=<TOKEN>&callbackURL=%2Fdossiers`

**Allowlist (kunnen inloggen):** `hello@noplasticfloralfoam.com`, `timo@jouwainstein.com`,
`e.brink@brinklicht.nl` (Eduard, toegevoegd 2026-07-09). Toevoegen kan in `/instellingen`.

## Wat er draait (kort)

- **Kern (runs 4–6):** vijfstatussen-matcher op de tolerantietabel (deterministisch, geen AI;
  7 invarianten getest), twee-lijsten-presentatie + afwijkingentabel, **review-station**
  (geel → automatisch in de Review-tab), estimate met totalen-per-kleur + p.m., XIS-export,
  import-voorstelscherm, verrijking + `/data`-werkbank, catalogus, instellingen + allowlist.
- **Latere horizon (H2/H3):** organisaties + rollen (petten) + `/instellingen/organisatie`,
  dossier-lifecycle (opgeleverd/gearchiveerd), disclosure-tiers + `/producten/[id]` + leads +
  vergelijk-tray, substitutievoorstel + systeemalternatieven, armaturenboek-versies + staffels,
  merkportaal `/merk/*` (geaggregeerd dashboard = anonimiseringsgrens), admin `/admin/*`.
- **PDF-import:** leest de tekstlaag **deterministisch** → code/merk/type **én** de specs uit de
  omschrijving (via de naam-parser, geen AI). Daardoor bepaalt de tolerantie-matcher ook
  geel/rood op een PDF. AI is een vangnet en is **nog niet aangesloten** (geen sleutel).

Test: `bun vitest run` → **294 tests groen** (34 files). `bunx tsc --noEmit` schoon.

## Open punten / next steps

1. ~~Demo-data opruimen~~ ✅ 2026-07-14: Van Dijk Elektro + leden verwijderd, Flos terug naar
   tier-1 (`bun run cleanup:testdata`, idempotent).
2. ~~ANTHROPIC_API_KEY toevoegen~~ ✅ 2026-07-15: key "lumenlogic" aangemaakt in de Console,
   staat in `.env.local` én Vercel-env (production), geverifieerd werkend, prod herdeployed —
   het AI-vangnet is nu live. Credits: $5 op het account; verbruik zichtbaar in `/instellingen`.
3. ~~GitHub push~~ ✅ 2026-07-15: branch `runs-4-6-vijfstatussen` gepusht naar
   github.com/Timo-AInstein/lumenlogic (mergen naar main staat nog open).
4. **Mailprovider (Resend):** koppelen zodat de magic-link per mail komt i.p.v. handmatig
   ophalen (L-01). Vergt een Resend API-key.
5. **Nog extern-afhankelijk (◑):** echte XIS-API (Lynx bouwt — lees-key checken, schrijf-keys
   aangevraagd), OCR voor beeld-PDF's, echte PDL/Connecting-the-Dots-sync, echte facturatie.
6. ~~PDF → tussenbestand als controlespoor~~ ✅ 2026-07-14: markdown per importrun opgeslagen,
   inzichtelijk + downloadbaar op de importpagina.

**NB (2026-07-14):** "dossiers" heet in de UI nu overal **projecten** (routes `/projecten`,
redirect vanaf `/dossiers`); het magic-link-voorbeeld hierboven werkt met `callbackURL:"/projecten"`.
DB/code-namen bleven bewust `dossier` (zie HANDOVER.md).

## Handige commando's (in `~/Documents/dev/lumenlogic`)

```
bun dev                         # lokale dev-server (localhost:3000)
bun vitest run                  # volledige testsuite (+ screenshots)
bun run db:migrate              # migraties naar Neon
bun run seed:demo && bun run seed:scenario   # demo-dossier(s) herseeden
bun scripts/gen-test-armaturenboek.ts        # test-PDF (alle 5 statussen)
vercel --prod --yes             # naar productie deployen
```

## Timeline

- 2026-07-02 — masterplan herzien (binnendienst = klant nul, vijfstatussen), funct. ontwerp.
- 2026-07-09 — runs 4–6 + H2/H3 gebouwd (twee multi-agent-workflows), migraties 0004+0005 op
  Neon, **live gezet** op lumenlogic.vercel.app. PDF-spec-lezer + geel→review toegevoegd.
  Test-armaturenboek gemaakt en end-to-end geverifieerd. Eduard op de allowlist gezet.
