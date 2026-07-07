# HANDOVER — Lumen Logic (runs 1–3)

_Bijgewerkt: 2026-07-02. Zie `docs/BUILD-PLAN.md` voor de oorspronkelijke run-1-opdracht._
_2026-07-07: eindbeeld + roadmap runs 4–8 vastgelegd in `docs/MASTERPLAN.md` (plansessie,
geen code gewijzigd)._
_2026-07-07 (later, grill-sessie): koers herzien — Brink-binnendienst als klant nul,
vijfstatussen-regelset als domeinmodel, XIS-koppeling. `docs/MASTERPLAN.md` vervangen;
nieuw: `docs/matching-regelset.md` + `docs/xis-post-api-attributes.md` (voor Lynx-call)._

## Status: het complete Lumen Logic staat

`bun vitest run` → **41 tests groen** (5 files): repo-/engine-tests op een echte PGlite-db
(zelfde migraties + view als productie) + white-box RSC-screenshottests van álle schermen
(licht/donker × mobiel/desktop). `bunx tsc --noEmit`, `bunx eslint .` en `bunx next build`
zijn schoon. Alles is end-to-end geverifieerd in de browser tegen echte Neon-data.

### De drie rollen (driekoppige gebruiker) — compleet
- **Calculator** → geprijsde tender-inschrijving. Engine in tender-stand (spec-getrouw,
  geen suggesties). `/dossiers/[id]/offerte`.
- **Werkvoorbereider** → value-engineering ná gunning. `/dossiers/[id]/werkvoorbereiding`
  (alleen in gegund-stand).
- **Projectleider** → gecodeerd armaturenboek. `/dossiers/[id]/armaturenboek`.

### De vijf ijzeren regels — in code én in tests
1. **Geen webshop** — geen winkelwagen/checkout/publieke prijzen.
2. **Geld nooit in de ranking** — matching (`lib/repo/products.ts`) én de vergelijkings-
   engine (`lib/repo/equivalence.ts`) sorteren puur op objectieve velden; prijs wordt
   getoond, nooit gesorteerd. Aparte test bewijst dit.
3. **Verlopen prijslijst = onzichtbaar** — centrale view `visible_products`; alle zoek-/
   engine-code leest enkel hieruit. Bewezen voor zoeken, exacte SKU én de engine.
4. **Default = veilig** — dossier-fase default `tender`; `getEquivalentAlternatives` geeft
   in tender altijd `[]`. Bewezen in repo- én UI-tests.
5. **Event-log vanaf dag één** — elke search/match/no-match/offerte/suggestie/PDF-import
   in `events`; de `/analytics`-view maakt er het Fase-2-fundament van.

### Run 1 — fundament (af)
Datamodel · import van **211.310 echte XIS-producten** · calculatorflow (dossiers,
spec-regels los + CSV-plak, matchen, printbare offerte).

### Run 2 — PDF-import + armaturenboek (af)
- **Armaturenboek-export** (projectleider): gecodeerd, printbaar overdrachtsdocument.
- **PDF-import** (`lib/pdf/armaturenboek.ts`): leest de inhoudsopgave-tekstlaag van een
  geüpload armaturenboek, segmenteert op armatuurcodes en splitst merk/type via de
  merkenlijst. ⚠️ Het Deerns-voorbeeld in `docs/examples/…ANN…pdf` is als **beeld/outline**
  geëxporteerd en heeft géén tekstlaag — daar valt niets uit te parsen (de UI meldt dat
  eerlijk). Voor de live demo genereert `bun scripts/gen-demo-pdf.ts` een tekst-PDF
  (`docs/examples/demo-armaturenboek.pdf`) die de import wél leest (7 regels).

### Run 3 — fase-bewuste gelijkwaardigheidsengine (af)
- **Engine** (`lib/repo/equivalence.ts`) — "scheidsrechter, geen rechter": rangschikt
  alternatieven op objectieve merk-velden (categorie, kelvin, CRI, IP) + duurzaamheid
  (garantie, repareerbaarheid, EPD) als tiebreak, **nooit prijs**. Toont de bron
  ("merk-opgave") en eerlijk "geen data" bij ontbrekende cijfers. Alleen in gegund-stand.
- **Werkvoorbereidersview** met objectieve vergelijkingstabellen per gematchte regel.

## DoD-demo (klaargezet in Neon)
`bun run seed:demo` → `bun run seed:scenario` zet het Deerns-dossier klaar en valideert de
volledige pijplijn end-to-end. Na inloggen ziet Timo het dossier met 3 matches + 2 nette
no-matches; op “gegund” toont de werkvoorbereider cross-merk groenere gelijkwaardigen.

## Aannames & keuzes onderweg
- **Prijsgeldigheid:** bron heeft geen datum → prijslijst `valid_until = 2026-12-31`. Eén
  prijslijst per merk (staffels = later). Zichtbaarheid vereist een geldige prijs.
- **Categorie- en duurzaamheidsdata ontbreekt in de bron** (`category_path` op 19 van 211k
  rijen, duurzaamheid leeg). De engine/architectuur zijn daarop gebouwd; de data komt in
  productie van de merken. Voor de demo zetten `seed:scenario` (cross-merk spots-scenario)
  en `seed:sustainability` **synthetische, duidelijk-gemarkeerde** categorie/kelvin/
  duurzaamheidscijfers op een kleine set producten, zodat de engine zichtbaar werkt.
- **Eigen HTTP-migrator** (`bun run db:migrate`) i.p.v. drizzle-kit's ws-driver (hing hier).
- **Better Auth via de Drizzle-adapter** (pg-provider mist het `pg`-pakket). Magic link →
  serverconsole (op Vercel: functie-logs).
- **Testomgeving-compat:** geteste componenten zijn server-safe (lucide → lokale inline-
  SVG's; shadcn Slot direct uit `@radix-ui/react-slot`; `Table` niet meer `"use client"`).

## Nodig voor de live Vercel-demo
- **`DATABASE_URL`** — Neon (al gevuld; migraties + import + seeds hiertegen gedraaid).
- **`BETTER_AUTH_SECRET`** — staat lokaal in `.env.local`; **zet dezelfde waarde als Vercel
  project-env**, anders werkt de magic-link-login op de deploy niet.
- Schone DB opbouwen: `db:migrate` → `import` → `seed:demo` → `seed:scenario`.

## Commando's
`bun dev` · `bun run test` · `bun run db:migrate` · `bun run import` · `bun run seed:demo`
· `bun run seed:scenario` · `bun run seed:sustainability` · `bun scripts/gen-demo-pdf.ts`

## Bewust NIET gedaan / vervolg
- OCR voor beeld-geëxporteerde PDF-armaturenboeken (zoals het Deerns-voorbeeld) — nu een
  eerlijke melding; OCR-pijplijn is een volgende stap.
- Echte merk-duurzaamheidsdata (PDL/ConnectingTheDots-koppeling), staffelprijzen,
  disclosure-tier-gating in de UI, rollen & rechten, Elasticsearch (richting 3M SKU's).
- Client-side navigatie (`next/link`) in de twee lijst-componenten die nu `<a>` gebruiken.

## Review-pass (Fable, 2026-07-02)
Frisse-ogen-review na oplevering; drie fixes doorgevoerd (43 tests groen):
- **Matching**: prefix-bonus in de fuzzy-ranking — het armatuur ("SASSO 100 SQ SP CEIL…")
  wint nu van accessoires die de familienaam middenin noemen ("SNOOT … FOR SASSO 100").
  `seed:demo` matcht Lp301 daardoor direct aan het echte armatuur. Nog steeds puur tekst.
- **CSV-plak**: meegeplakte kolomkop ("code, aantal, merk, type") wordt overgeslagen.
- **Analytics**: uuid-cast op `payload->>'productId'` afgeschermd met een regex-guard —
  één afwijkend event kan de pagina niet meer breken.

## Open eindes
- RLS staat uit op de bron-Supabase — bekend, niet van ons (alleen-lezen bron).
- Eén gebruiker (Timo), geen rollen; rollen komen bij een echte multi-user-uitrol.
