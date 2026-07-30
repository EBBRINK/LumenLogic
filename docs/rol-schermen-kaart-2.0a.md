# Rol→schermen-kaart (G21) — sprint 2.0a

*Papier-deliverable. Legt vast **welk scherm bij welke rol hoort**, zodat week 3 (3.1 auth +
3.2a route-allowlist) kan verbergen **zonder herbouw**. Deze sprint dwingt niets af: iedereen
ziet nog alles (`components/nav-items.ts:7-8`, 0 organisaties / 0 memberships in de db). Alleen
de **structuur** is langs deze lijn gelegd.*

Besluit G21 (Timo, 29 jul): de IA-as = vier inlog-/rollentypen. Besluit 30 jul: deze sprint
bouwen we één goede **Intern**-view; het enige verschil Intern ↔ super admin is of je **Admin**
ziet.

## De vier rollen
1. **Intern** — Brink binnendienst. Het dagelijkse werk.
2. **Intern super admin** — alles van Intern + de Admin-console.
3. **User** — externe professional (lichtontwerper / architect / aannemer). Alleen eigen
   projecten + prijsloze catalogus. Labels wijzigen later voor dit publiek.
4. **Brand** — merk beheert eigen template/data (het huidige Brand portal).

## De kaart (route → rol)

| Scherm (route) | Intern | Super admin | User | Brand |
|---|:--:|:--:|:--:|:--:|
| Projects — `/projects`, `/projects/[id]/**` | ✓ | ✓ | ✓ (eigen org, week 3) | – |
| Catalog — `/catalog`, `/products/[id]` | ✓ | ✓ | ✓ (prijsloos) | – |
| Brand relations — `/data/brand-relations/**` (incl. zichtbaarheid/tier na 2.0a) | ✓ | ✓ | – | – |
| Data — `/data`, `/data/enrichment/**`, `/data/price-lists`, `/data/evaluation`, `/data/fields`, `/data/event-log` (nieuw) | ✓ | ✓ | – | – |
| Data — `/data/loading` (blijft technisch bestaan; niet in de hub-kaarten) | ✓ | ✓ | – | – |
| Analytics — `/analytics` (placeholders in 2.0a) | ✓ | ✓ | – | – |
| Settings — `/settings`, `/settings/organization` | ✓ | ✓ | – | – |
| Brand portal — `/brand`, `/brand/dashboard`, `/brand/data`, `/brand/price-lists` | ✓ (preview) | ✓ | – | ✓ |
| Admin — `/admin`, `/admin/brands/**` (add/edit/delete), `/admin/imports`, `/admin/users` | – | ✓ | – | – |

Legenda: ✓ = ziet dit · – = ziet dit niet. "Preview" = intern mag de merk-omgeving bekijken
zonder merk te zijn.

## Week-3-hint: verbergen zonder herbouw
De hele hoofdbalk komt uit één pure module: `NAV_ITEMS` in `components/nav-items.ts:12-21`.
Eén rol→href-allowlist-filter dáár verbergt top-items zonder één scherm te verbouwen;
`activeNavHref` (r.27-39) accepteert al een `items`-parameter, dus een gefilterde lijst werkt
direct. Server-side route-gating (dat iemand die de URL kent alsnog wordt geweerd) is een
aparte laag — 3.2a — en staat los van deze nav-filter.

## Grens (blijft gelden)
2.0a bouwt **géén** auth, **géén** server-side route-gating, en maakt **geen** rollen/orgs in de
db aan. Dit document is het contract waarop die week-3-lagen zich baseren.
