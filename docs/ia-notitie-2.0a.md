# IA-notitie 2.0a — informatiestructuur opnieuw indelen

*Sprint 2.0a, week 2. Sprintmaster-notitie. **Dit is een startpunt om op te tekenen, geen
dichtgetimmerd ontwerp.** De indeling bepaalt Timo — de voorstellen hieronder zijn er om op te
reageren, niet om over te nemen. Pas ná Timo's akkoord op een boom gaat er een bouwbriefing uit.*

Alle paden en labels hieronder zijn gemeten tegen de code op `c092e35` (27 jul), niet uit het
geheugen. Bronnen staan per regel.

---

## 1. Wat er nu staat (gemeten inventaris)

De hoofdbalk heeft **8 top-items** — bron `components/nav-items.ts:12-21`:

| # | Label | Route | Wat het is |
|---|-------|-------|-----------|
| 1 | Projects | `/projects` | Dossiers: import, regels, review, quote, work-prep, luminaire-schedule, substitution |
| 2 | Catalog | `/catalog` | Vrij zoeken; productdetail hangt op `/products/[id]` (buiten `/catalog`) |
| 3 | Brand relations | `/data/brand-relations` | Intern merkenbeheer + datacollectie per merk (waar Brink werkt) |
| 4 | Data | `/data` | Werkbank-hub met 6 kaarten (zie onder) |
| 5 | Analytics | `/analytics` | Interne stuur-analytics |
| 6 | Settings | `/settings` | + `/settings/organization` |
| 7 | Brand portal | `/brand` | Wat een **merk** ziet: dashboard, data, price-lists |
| 8 | Admin | `/admin` | Beheer-console met 4 kaarten (zie onder) |

**De "Data"-werkbank** (`components/data/data-cards.tsx:6-37`) heeft 6 kaarten:
`Enrichment` (`/data/enrichment`) · `Loading` (`/data/loading`, blauwe wachtrij) ·
`Price lists` (`/data/price-lists`) · `Evaluation` (`/data/evaluation`) ·
`Brand relations` (`/data/brand-relations`) · `Fields` (`/data/fields`, eigen velden).

**De Admin-console** (`app/admin/page.tsx:24-49`) heeft 4 kaarten:
`Brands & visibility` (`/admin/brands`, disclosure-tier + per-veld-uitzonderingen) ·
`Imports` (`/admin/imports`, uploads goedkeuren + PDL) · `Users` (`/admin/users`) ·
`Activity` (`/admin/events`, event-log read-only).

---

## 2. De problemen (met bewijs)

**A. "Merk" zit op drie plekken — en één ervan is dubbel bereikbaar.**
- Top-nav **Brand relations** → `/data/brand-relations` (`nav-items.ts:15`)
- Data-kaart **Brand relations** → **zelfde** `/data/brand-relations` (`data-cards.tsx:28`) — dus
  twee ingangen naar één scherm.
- Admin-kaart **Brands & visibility** → `/admin/brands` (`admin/page.tsx:26-31`) — dit is óók
  merkbeheer, maar dan zichtbaarheid/tier.
- (En **Brand portal** `/brand` is een vierde "brand"-ding, maar met een ander publiek: het merk
  zelf. Dat is een terechte scheiding, geen dubbeling.)

**B. Import zit op twee plekken.**
- `/data/loading` — "blue queue: requested brands not yet in the catalog" (`data-cards.tsx:13-16`).
- `/admin/imports` — "approve brand uploads and the PDL import" (`admin/page.tsx:33-37`).
- Verwant en óók verspreid: `/data/enrichment` (parser + publiceren) en de upload-flow onder
  `/data/brand-relations/[brandId]/upload/[uploadId]`. Vier import-achtige stromen, geen
  gemeenschappelijke ingang.

**C. "Data" is een vergaarbak.** Zes ongelijksoortige dingen onder één naam: verrijken, laden,
prijslijsten, matcher-evaluatie, merkrelaties, eigen velden. Timo's eigen constatering: sommige
horen daar niet. De naam "Data" zegt niet wat je er doet.

**D. Vindbaarheid.** Merkbeheer heette "Brands & visibility" met omschrijving "Disclosure tier and
per-field exceptions" (`admin/page.tsx:26-31`) — Timo vond het zelf niet terug. Een gebouwde
feature die niemand vindt, is niet af.

**E. Breedte.** 8 top-items in een enkele flex-rij (`nav-link.tsx:48-57`) zonder mobiele variant;
gemeld dat de balk op 375px overloopt. *Nog te verifiëren in de browser tijdens de bouw — hier
opgenomen als claim, niet als meting.*

**F. Twee kleine padvreemdheden** (niet urgent, wel meenemen bij "elk scherm → nieuwe plek):
productdetail op `/products/[id]` los van `/catalog`; `/settings/organization` als enige
settings-subpagina.

---

## 3. De gekozen as en de resterende knopen

**Beslissing 1 — de groeperings-as — is genomen (Timo, 29 jul, besluit G21).**
De boom wordt georganiseerd rond **vier inlog-/rollentypen**, en "wie wat ziet" is een
eerste-klas ontwerpvraag, geen bijzaak:

1. **Intern** — Brink binnendienst (bv. Eduard). Het dagelijkse werk.
2. **Intern super admin** — alles van Intern + de beheer-console (merk-zichtbaarheid, imports,
   users, event-log, settings).
3. **User** — externe professional: lichtontwerper, architect, aannemer. Ziet **alleen** eigen
   projecten en de catalogus (prijsloos, besluit 10) — niets interns.
4. **Brand** — logt simpel in om de eigen merk-template/data te beheren (het huidige Brand portal).

Zie sectie 4 voor de vier-rollen-boom die hieruit volgt. **De sub-knopen hieronder (2–6) vult Timo
in op die boom.**

> **⚠️ Grens die de sprintmaster bewaakt (belangrijk).** 2.0a legt de *structuur* langs deze vier
> rollen vast — welk scherm bij welke rol hoort, de hernoemde/gebundelde boom, minder klikken. Het
> *afdwingen* van "wie wat ziet" (server-side route-gating, org-scoping) én de rollen/accounts
> zelf zijn **week 3** (besluiten 11 + G18; 3.1 PIN-auth + 3.2a route-allowlist). Vandaag bestaat er
> in de db nog **geen enkele rol** (0 organisaties, 0 memberships — gemeten) en ziet iedereen alles
> (`nav-items.ts:7-8`). 2.0a mag daarom de boom herbouwen en een rol→schermen-kaart klaarzetten die
> week 3 kan verbergen zónder herbouw — maar 2.0a bouwt géén auth en géén server-side blokkade.
> Anders eet 2.0 week 3 op. Dit is een openstaand punt om met Timo scherp te krijgen: hoe "live"
> moet de per-rol-navigatie in week 2 al zijn?

**Beslissing 2 — Wat wordt de nieuwe thuisbasis van "merk"?**
Advies: één **Merken**-sectie die zowel de relatie/datacollectie (`/data/brand-relations`) als de
zichtbaarheid/tier (`/admin/brands`) bundelt, zodat merkbeheer op één vindbare plek staat. De
Data-kaart die naar hetzelfde scherm linkt vervalt dan. Akkoord, of wil je relatie en
zichtbaarheid gescheiden houden?

**Beslissing 3 — Hoort "Brand portal" in de interne hoofdbalk?**
Het is een ander publiek (het merk zelf). Advies: **weg uit de interne balk** (aparte ingang/rol,
past bij de org-scoping van week 3). Of wil je hem nu zichtbaar houden voor de demo?

**Beslissing 4 — Blijft "Data" bestaan, en met welke naam?**
Als merk eruit gaat (besl. 2), houdt de werkbank over: enrichment, loading, price lists,
evaluation, fields. Advies: hernoemen naar iets dat de handeling dekt (bv. **Catalogusdata** of
**Databeheer**), of deze onder Catalogus/Merken verdelen. Wat past?

**Beslissing 5 — Eén import-ingang?**
Advies: `/data/loading` en `/admin/imports` samenvoegen tot één **Import**-plek (goedkeuren +
wachtrij + PDL), of in elk geval kruislings naar elkaar linken. Akkoord?

**Beslissing 6 — Waar landen Settings en Admin?**
Advies: uit de horizontale balk, naar een **profiel-/beheermenu** rechts (bij het e-mailadres,
`nav-link.tsx:58-60`), zodat de balk ademt. Of wil je Admin als volwaardig top-item houden?

---

## 4. De vier-rollen-boom (startpunt op de gekozen as — teken erop)

Elk bestaand scherm gemapt naar de rol(len) die het ziet. Dit is de invulling van besluit G21;
de labels/bundeling (knopen 2–6) staan nog open — **hier teken je op.**

```
ROL 1 — INTERN (Brink binnendienst)
Hoofdbalk:
├── Projecten            /projects           (+ dossier-subroutes, ongewijzigd)
├── Catalogus            /catalog            (+ productdetail /products/[id])
├── Merken               ← nieuw dak; bundelt (knoop 2):
│   ├── Relaties & data   (was /data/brand-relations — top-nav + Data-kaart, nu één ingang)
│   └── Import & wachtrij (was /data/loading + enrichment — knoop 5)
├── Databeheer           (was "Data" zonder merk, knoop 4): enrichment · price lists · evaluation · fields
└── Analytics            /analytics

ROL 2 — INTERN SUPER ADMIN  (= alles van Intern, plus:)
└── Beheer               (was Admin, knoop 6):
    ├── Merk-zichtbaarheid (was /admin/brands "Brands & visibility" — betere naam, knoop 2+D)
    ├── Imports           /admin/imports   (samen met "Import & wachtrij"? knoop 5)
    ├── Users             /admin/users
    ├── Activity          /admin/events
    └── Settings          /settings (+ organization)

ROL 3 — USER (lichtontwerper / architect / aannemer, extern)
Hoofdbalk (versoberd):
├── Projecten            /projects   ← alléén eigen organisatie (org-scoping = week 3)
└── Catalogus            /catalog    ← prijsloos (besluit 10)
    (geen Merken, geen Databeheer, geen Analytics, geen Beheer)

ROL 4 — BRAND (merk beheert eigen data)
└── Brand portal         /brand : dashboard · data · price-lists
    (eigen, simpele omgeving; los van de interne balk)
```

**Wat dit oplost, per probleem uit sectie 2:** merk staat nog op één plek per rol (A opgelost) ·
import gebundeld (B) · "Data" → "Databeheer" zonder merk (C) · "Brands & visibility" →
"Merk-zichtbaarheid" (D, vindbaarheid) · minder top-items per rol, dus de 375px-overloop verdwijnt
vanzelf (E).

**Open op deze boom (knopen 2–6, jij beslist):** exacte labels · of "Merken" en "Beheer/Imports"
één import-ingang delen · of Settings onder Beheer of in een profielmenu · of Databeheer een eigen
top-item blijft of onder Merken/Catalogus valt. **Teken erop, en ik schrijf de bouwbriefing op
jóuw boom** — met de week-2/week-3-grens uit sectie 3 bewaakt.

---

## 5. Grenzen bij het bouwen (voor de latere briefing)

- Rol-gestuurde zichtbaarheid is week 3 (org-scoping); nu ziet iedereen alles
  (`nav-items.ts:7-8`). De nieuwe boom moet daar wél op voorbereid zijn — groepeer alvast langs de
  lijn intern/beheer/merk, zodat week 3 kan verbergen zonder herbouw.
- Elke navigatie/zoekactie blijft loggen (ijzeren regel 5).
- 2.0b (visueel, brand kit) staat los en wacht op Timo's kit — deze notitie gaat alleen over
  structuur, niet over kleur/typografie.
