# Lumen Logic — Bouwplan run 1

> **Voor wie:** de autonome bouwsessie die in de `lumenlogic`-coderepo draait (níet in de vault).
> Dit bestand wordt door het setup-runbook gekopieerd naar `docs/BUILD-PLAN.md` in de repo.
> **Status:** vastgesteld met Timo op 2026-07-02 na grill-sessie. Besluiten hieronder zijn
> genomen — niet heropenen zonder Timo.

---

## 1. Wat is Lumen Logic (context in 5 zinnen)

Lumen Logic is het SaaS-platform van Brink Licht voor de professionele verlichtingsmarkt:
~430 merken, ~3M SKU's. Het is **géén webshop** — het is een spec-, calculatie- en offertetool
voor installateurs (calculator → werkvoorbereider → projectleider). Het hart is de
**fase-aware engine**: hetzelfde systeem gedraagt zich anders naargelang een projectdossier op
*tender* (alleen exacte matches, geen suggesties) of *gegund* (value-engineering en duurzame
alternatieven actief) staat. Run 1 bouwt het fundament: datamodel, echte data, calculatorflow.
Volledige achtergrond: `docs/lumenlogic-briefing.md` en `docs/lumenlogic-podcast-transcript.md`
(lees beide vóór je begint), voorbeeldspec: `docs/07364_NLD_BD_LIG_armaturenboek_ANN_20260313.pdf`.

## 2. IJzeren regels (gelden voor elke regel code, ook na run 1)

1. **Nooit webshop-semantiek.** Geen winkelwagen, geen checkout, geen publieke prijzen.
   Premium merken trekken hun data terug als het op e-commerce lijkt.
2. **Merkgeld mag de ranking nooit kantelen.** Matching-/ranglogica strikt gescheiden van
   alles wat commercieel is. Er bestaat geen code-pad waar geld de volgorde beïnvloedt.
3. **Verlopen prijslijst = product onzichtbaar.** Niet grijs, niet "prijs op aanvraag" —
   wég uit alle zoekresultaten. "Een gat is eerlijk, een verkeerde prijs is fataal."
   Centraal afdwingen (één repository-functie/view), nooit per query opnieuw.
4. **Default = veilig.** In tender-stand toont het systeem niets dat spec-gelijkwaardigheid
   in gevaar brengt. Suggesties bestaan pas in de gegund-stand (run 3, maar de poort
   zit vanaf nu in de architectuur).
5. **Event-log vanaf dag één.** Elke zoekactie, match en offertegeneratie wordt gelogd —
   fase-2-verdienmodel (merk-analytics) hangt hieraan; achteraf toevoegen kan niet.

## 3. Besluiten (vastgesteld, niet heropenen)

| Besluit | Keuze | Waarom |
|---|---|---|
| Stack | epic-rsc-stack-skelet (route B, publieke ingrediënten): Next.js 16, React 19, TypeScript, Drizzle, Better Auth, Vitest 5 + vitest-plugin-rsc, Tailwind 4, shadcn/ui, Bun, Vercel | Timo traint 4 weken met Kasper Peulen (auteur van de stack); agent krijgt "ogen" via screenshot-tests |
| Database | **Neon** Postgres (via Vercel Marketplace) | Stack-zuiver; Neon-branch per PR-preview; later triviaal naar Supabase te verhuizen (allebei kaal Postgres) |
| Databron | Supabase-project "Thursd Chatbot" (`uvmeytxejlzvdgjgthmr`) is **bron, geen backend** — CSV-export staat in `data/source/` | 211k echte producten, 436 merken; app blijft los van die legacy |
| Zoeken | Postgres full-text + trigram (`pg_trgm`) — **geen Elasticsearch in run 1** | 211k rijen kan Postgres prima aan; ES pas bij 3M SKU's |
| Auth | Better Auth magic link, **één gebruiker (Timo), geen rollen** | Rollen (calculator/werkvoorbereider) komen met de fase-engine |
| Spec-invoer | Handmatig/CSV-plak per regel — **geen PDF-parsing in run 1** | PDF-import van armaturenboeken = run 2 |

## 4. Scope run 1 — drie deliverables

### 4.1 Datamodel (Drizzle-schema)

Modelleer minimaal deze tabellen. Kolomdetails van de brondata staan in
`data/source/README.md` (door het setup-runbook gegenereerd) — volg de bron waar die rijker is.

- **brands** — naam, slug, XIS `brand_code` (⚠️ mag dubbel voorkomen in bron!),
  `disclosure_tier` enum (`tier1|tier2|tier3`), kortings-/leveranciersinfo uit bron.
- **suppliers** — apart van brands (1 supplier ↔ n brands en omgekeerd).
- **categories** — 3 niveaus (hoofd > sub > subsub), XIS-structuur.
- **products** — SKU, naam, brand, category, supplier + technische velden (nullable:
  lumen, watt, kelvin, CRI, IP-waarde, afmetingen, dimbaar, driver-type) + duurzaamheidsvelden
  (nullable, nu grotendeels leeg: garantie_maanden, repareerbaarheid, EPD/levensduur, land
  van herkomst). Bron vult vooral SKU/naam/categorie/prijs/merk — de rest is schema-ruimte
  die run 2+ vult.
- **price_lists** — per merk, met `valid_from` en **`valid_until` (verplicht!)** — dit veld
  drijft ijzeren regel 3. Bron heeft mogelijk geen geldigheidsdatum: default dan
  2026-12-31 en noteer die aanname expliciet in `HANDOVER.md`.
- **prices** — product ↔ price_list, brutoprijs (staffels zijn run 2+).
- **project_dossiers** — naam, klant(tekst), **`phase` enum (`tender|awarded`)**, timestamps.
- **spec_lines** — dossier, armatuurcode (bv. "Lp301"), aantal, omschrijving, merk-tekst,
  product-tekst, gevraagde kernvelden (kelvin, CRI, IP…), `matched_product_id` (nullable),
  status (`open|matched|no_match`). Modelleer op het Deerns-armaturenboek in `docs/`.
- **quote** + **quote_lines** — dossier → regels met product, aantal, stukprijs, totaal.
- **events** — entity, action, actor, payload (jsonb), created_at. Log: zoekopdrachten,
  matches, no-matches, offertegeneraties.

### 4.2 Data-import

Script (`bun run import`) dat de CSV's uit `data/source/` naar het nieuwe schema laadt.
Idempotent (herdraaien is veilig). De bron is echte XIS-rommel — dubbele brand_codes,
ontbrekende velden. Dat is een feature: als het schema de rommel niet aankan, moet dat nú
blijken. Onoplosbare bronproblemen: loggen + overslaan (fail loud), nooit stil droppen.
Alle geïmporteerde merken krijgen `disclosure_tier = tier1` (bron is al Tier 1-data).

### 4.3 Calculatorflow (de demo voor Eduard)

1. **Dossiers**: lijst + aanmaken (naam, klant, fase — default `tender`).
2. **Spec-regels invoeren**: per regel armatuurcode, aantal, merk, type, kernvelden.
   Ook: CSV-blok plakken (kolommen: code, aantal, merk, type).
3. **Matchen per regel**: exact op SKU/artikelnummer als aanwezig; anders zoek op
   merk + producttekst (full-text + trigram). Toon top-kandidaten met de brondata-velden;
   calculator klikt het juiste product aan. Geen match = eerlijke "geen match in catalogus"-status.
4. **Offerte genereren**: geprijsde regellijst (aantal × stukprijs, totalen), nette
   printbare pagina. Geen PDF-export nodig in run 1 — print-CSS volstaat.

## 5. Werkwijze

- **Testdiscipline is de kern van deze stack**: elk feature krijgt een white-box RSC-test
  (server render → interactie → assert) mét screenshots (light/dark × mobile/desktop) via
  vitest-plugin-rsc + PGlite + drizzle-seed. **Bekijk de PNG's die je tests produceren** —
  dat is je zicht op wat je bouwt. Tests draaien op synthetische seed-data (klein,
  deterministisch); het importscript test je apart tegen een sample uit `data/source/`.
- Werk op `main`, kleine commits per feature, regelmatig pushen (elke push = Vercel-preview).
- Loop je >30 min vast op infra (Vercel, Neon, Chromatic): noteer het in `HANDOVER.md`
  en werk verder aan wat wél kan.
- Geen scope-uitbreiding. Twijfel je of iets bij run 1 hoort: het antwoord is nee,
  noteer het als run-2-kandidaat in `HANDOVER.md`.

## 6. Definition of done — run 1 is klaar als:

1. **`bun vitest run` volledig groen**, inclusief screenshot-tests.
2. **Demo end-to-end op de live Vercel-URL**: inloggen met magic link → dossier aanmaken →
   deze 5 regels uit het Deerns-boek invoeren → matchen → geprijsde offerte:
   - Lp301 — XAL — SASSO 100
   - Lr303 — XAL — SASSO 60 Adjustable
   - Lw201 — Wever & Ducré — SCAVA 1.0
   - Lp001-a — LedsC4 — INFINITE PRO
   - Ls001 — Glamox — i40
   XAL en Wever & Ducré zitten zeker in de catalogus (≥2 echte matches verwacht);
   merken die er niet in zitten tonen een nette "geen match" — dat is correct gedrag, geen bug.
3. **De twee kernregels aantoonbaar in tests**: (a) product met verlopen prijslijst
   verschijnt in géén enkel zoekresultaat; (b) dossier op `tender` toont nergens
   alternatieven-suggesties.
4. **`HANDOVER.md` in de repo-root**: wat is af, wat niet, welke aannames/keuzes onderweg
   gemaakt (o.a. de prijsgeldigheids-default), run-2-kandidatenlijst.

## 7. Expliciet NIET in run 1

Armaturenboek-export · PDF-import van specs · vergelijkings-/suggestie-engine ·
werkvoorbereidersview · Elasticsearch · rollen & rechten · disclosure-gating in de UI ·
staffelprijzen · PDL/ConnectingTheDots-koppeling. (Run 2: PDF-import + armaturenboek-export.
Run 3: fase-aware vergelijkingsengine + werkvoorbereidersview.)
