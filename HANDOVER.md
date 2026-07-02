# HANDOVER — Lumen Logic run 1

_Bijgewerkt: 2026-07-02. Zie `docs/BUILD-PLAN.md` voor de opdracht._

## Status: run 1 is af

`bun vitest run` → **22 tests groen** (2 files): 4 repository-/kernregeltests op een echte
PGlite-database + 18 white-box RSC-screenshottests (licht/donker × mobiel/desktop). De
PNG's staan naast `components/dossier/screens.test.tsx` (gitignored) en zijn visueel
gecontroleerd. `bunx tsc --noEmit`, `bunx eslint .` en `bunx next build` zijn schoon.

### Wat is af (BUILD-PLAN §4)
- **Datamodel** (`db/schema.ts`): brands (brand_code niet-uniek), suppliers, categories
  (3 niveaus), products (technische + duurzaamheidsvelden), price_lists (**valid_until
  verplicht**), prices, project_dossiers (`phase` enum), spec_lines, quotes/quote_lines,
  events. Better Auth-tabellen in `db/auth-schema.ts`.
- **Import** (`bun run import`): 211.310 producten idempotent ingeladen in Neon; 210.117
  prijzen; 1.193 producten zonder verkoopprijs (→ bewust onzichtbaar); 0 dangling FK's,
  0 naamloze rijen. Fail-loud logging, nooit stil droppen.
- **Calculatorflow**: `/login` (magic link) → `/dossiers` (lijst + aanmaken) →
  `/dossiers/[id]` (spec-regels invoeren, los of via CSV-plak; fase-toggle) →
  `/dossiers/[id]/regel/[lineId]` (matchen) → `/dossiers/[id]/offerte` (printbare
  geprijsde lijst, print-CSS).

### De vier ijzeren regels in code
1. **Geen webshop-semantiek** — geen winkelwagen/checkout/publieke prijzen.
2. **Geld nooit in de ranking** — `searchProducts` sorteert puur op tekstsimilariteit
   (`lib/repo/products.ts`); prijs wordt getoond, nooit gesorteerd.
3. **Verlopen prijslijst = onzichtbaar** — centrale view `visible_products`
   (`db/migrations/0001`); alle zoekcode leest enkel hieruit. Bewezen in
   `lib/repo/rules.test.ts` (ook op exacte SKU).
4. **Default = veilig** — dossier-fase default `tender`; suggesties-poort
   `getAlternativeSuggestions` geeft in tender altijd `[]`. Bewezen in repo- én UI-test.
5. **Event-log vanaf dag één** — elke search/match/no-match/offerte in `events`.

### DoD-demo (BUILD-PLAN §6.2)
`bun run seed:demo` zet het Deerns-dossier klaar in Neon en valideert de pijplijn
end-to-end tegen echte data:
- Lp301 · XAL · SASSO 100 → match ✓
- Lr303 · XAL · SASSO 60 Adjustable → match ✓
- Lw201 · Wever & Ducré · SCAVA 1.0 → match ✓
- Lp001-a · LedsC4 · INFINITE PRO → **nette "geen match"** (LEDS-C4 heeft 0 producten in de bron)
- Ls001 · Glamox · i40 → **nette "geen match"** (Glamox niet in de catalogus)

Offerte: 3 geprijsde regels, totaal € 3.758,00. Na inloggen ziet Timo dit dossier staan.

## Aannames & keuzes onderweg
- **Prijsgeldigheid (opgedragen aanname):** de bron heeft geen geldigheidsdatum op prijzen,
  dus elke prijslijst krijgt `valid_from = 2026-01-01`, **`valid_until = 2026-12-31`**.
  Aanpassen = één prijslijst per merk bijwerken.
- **Eén prijslijst per merk** (unieke index op `price_lists.brand_id`). Staffels = run 2.
- **Zichtbaarheid vereist een geldige prijs.** Een product zonder prijs verschijnt niet in
  zoekresultaten (1.193 stuks). Dat volgt logisch uit regel 3 en past bij een offertetool.
- **Eigen HTTP-migrator** (`db/migrate.ts`, `bun run db:migrate`): drizzle-kit's ingebouwde
  `migrate` gebruikt de Neon-WebSocket-driver, die in deze omgeving hing.
- **Better Auth via de Drizzle-adapter** i.p.v. de `pg`-provider (het `pg`-pakket zit niet
  in de stack). Magic link logt naar de serverconsole (op Vercel: functie-logs).
- **Testomgeving-compat:** de geteste componenten zijn server-safe gemaakt — lucide-react
  (roept `createContext` bij import aan) vervangen door lokale inline-SVG's; shadcn Button/
  Badge importeren `Slot` nu direct uit `@radix-ui/react-slot` i.p.v. de `radix-ui`-barrel
  (die trok react-collapsible mee en brak de react-server-render); `Table` niet langer
  `"use client"`. Interne links in geteste componenten zijn `<a>` i.p.v. `next/link`.

## Nodig voor de live Vercel-demo
- **`DATABASE_URL`** — Neon (al gevuld; migraties + import zijn hiertegen gedraaid).
- **`BETTER_AUTH_SECRET`** — staat lokaal in `.env.local`; **zet dezelfde waarde als
  Vercel project-env**, anders werkt de magic-link-login op de deploy niet.
- **`BETTER_AUTH_URL`** — optioneel; valt anders terug op `https://$VERCEL_URL`.
- Draai bij een schone DB: `bun run db:migrate` → `bun run import` → `bun run seed:demo`.

## Run-2-kandidaten (bewust NIET in run 1)
- PDF-import van armaturenboeken + armaturenboek-export.
- **Relevance-tuning matching**: nu wint pure tekstsimilariteit, waardoor een accessoire
  ("SNOOT FOR SASSO 100") soms boven de echte armatuur ("SASSO 100 SQ SP CEIL") staat.
  Wegen op categorie/armatuur-vs-toebehoren hoort in run 2.
- Staffelprijzen; disclosure-tier-gating in de UI; rollen & rechten.
- Fase-aware vergelijkings-/suggestie-engine (gegund-stand) + werkvoorbereidersview (run 3).
- Elasticsearch (pas nodig richting 3M SKU's); client-side navigatie (`next/link`) terug.

## Open eindes
- RLS staat uit op de bron-Supabase — bekend, niet van ons (alleen-lezen bron).
- Eén gebruiker (Timo), geen rollen; rollen komen met de fase-engine.
