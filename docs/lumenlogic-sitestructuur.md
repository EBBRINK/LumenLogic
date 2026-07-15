# Lumen Logic — sitestructuur (boomstructuur)

> Uitgetekend uit de echte routes in de codebase (`app/**/page.tsx`), 2026-07-15.
> Status per onderdeel: ✅ staat · 🔄 in uitvoering · 🟦 herontwerp gepland · 🟨 komend.

```
                         ┌───────────────────────────────┐
                         │          LUMEN LOGIC          │
                         │   spec · match · dataplatform │
                         └───────────────┬───────────────┘
                                         │
   ┌──────────────┬──────────────┬───────┼────────┬──────────────┬──────────────┐
   │              │              │       │        │              │              │
┌──┴───┐    ┌─────┴─────┐   ┌────┴───┐ ┌─┴──┐ ┌───┴────┐   ┌─────┴─────┐   ┌────┴───┐
│LOGIN │    │ PROJECTEN │   │CATALO- │ │DATA│ │ MERKEN │   │INSTELLIN- │   │ ADMIN  │
│      │    │ vernieuwd │   │ GUS +  │ │werk│ │merkpor-│   │   GEN     │   │        │
│magic │    │    ✅     │   │PRODUC- │ │bank│ │  taal  │   │    ✅     │   │   ✅   │
│link  │    │           │   │  TEN ✅│ │ 🔄 │ │  🟨    │   │           │   │        │
└──────┘    └─────┬─────┘   └───┬────┘ └─┬──┘ └───┬────┘   └─────┬─────┘   └────┬───┘
                  │             │        │        │              │              │
                  │             │        │        │              │              │
  ┌───────────────┘             │        │        │              │              │
  │                             │        │        │              │              │

┌─ PROJECTEN ────────────────────────────────────────────────────────────────────┐
│  /projecten .................. overzicht van alle projecten                     │
│  └─ /projecten/[id] .......... één project, met statusroute:                    │
│         Concept → Estimate gestuurd → Offerte → Gegund / Niet gegund → Archief  │
│         (fase = XIS-taal ·  status = wat de tool deed — staan los van elkaar)   │
│                                                                                 │
│      ├─ armaturenboek ........ PDF uploaden, spec-regels                        │
│      │    └─ versies .......... eerdere versies van het armaturenboek           │
│      ├─ import/[runId] ....... controlespoor per importrun (markdown)           │
│      ├─ regel/[lineId] ....... detail per spec-regel (status, afwijkingen)      │
│      ├─ review ............... review-station (geel, varianten kiezen)          │
│      ├─ offerte .............. estimate / offerte met totalen-per-kleur         │
│      ├─ werkvoorbereiding .... value-engineering ná gunning                     │
│      └─ substitutie/[id] ..... substitutievoorstel per regel                    │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─ CATALOGUS + PRODUCTEN ✅ ───────────────────────────────────────────────────────┐
│  /catalogus .................. zoeken & vergelijken over de hele database        │
│  └─ /producten/[id] .......... productpagina (toont data volgens disclosure-tier)│
└─────────────────────────────────────────────────────────────────────────────────┘

┌─ DATA — de werkbank 🔄 ──────────────────────────────────────────────────────────┐
│  /data ....................... overzicht werkbank                                │
│  ├─ inladen .................. brondata / armaturenboeken inladen                │
│  ├─ prijslijsten ............. prijslijsten beheren (één actieve per merk)       │
│  ├─ verrijking ............... specs verrijken (deterministisch + AI-vangnet)    │
│  │    └─ [runId] ............. detail van één verrijkingsrun + steekproef        │
│  ├─ evaluatie ................ evaluatieset: hit-rate meten vóór/ná verrijking   │
│  └─ merkrelaties ............. relaties & data-inwinning per merk                │
│       └─ [brandId] ........... één merk (velden, template, bericht klaarzetten)  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─ MERKEN / MERKPORTAAL 🟨 ────────────────────────────────────────────────────────┐
│  NU  : merkrelatiebeheer zit onder /data/merkrelaties                            │
│  KOMT: overzicht "welke bedrijven zijn benaderd / moeten nog een mail",          │
│        welke tier, welke data al binnen is                                       │
│                                                                                  │
│  /merk ....................... merkportaal (login voor het merk zelf)            │
│  ├─ dashboard ................ geaggregeerd dashboard = de anonimiseringsgrens   │
│  ├─ data ..................... eigen productdata inzien / aanleveren             │
│  └─ prijslijsten ............. eigen prijslijst(en)                              │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─ ANALYTICS 🟦 (herontwerp gepland) ──────────────────────────────────────────────┐
│  /analytics .................. NU: werkende demo op de oude eventlaag            │
│                                KOMT: trends per week, top-overwogen producten,   │
│                                afwijzingsredenen, zoekacties-zonder-resultaat    │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─ INSTELLINGEN ✅ ────────────────────────────────────────────────────────────────┐
│  /instellingen ............... allowlist (wie mag inloggen)                      │
│  └─ organisatie .............. organisaties + rollen (petten)                    │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─ ADMIN ✅ ───────────────────────────────────────────────────────────────────────┐
│  /admin ...................... beheeroverzicht                                   │
│  ├─ gebruikers ............... gebruikersbeheer                                  │
│  ├─ imports .................. alle importruns                                   │
│  ├─ merken ................... merkenbeheer (incl. disclosure-tier)              │
│  └─ events ................... de complete event-log (elke actie gelogd)         │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─ LOGIN ✅ ───────────────────────────────────────────────────────────────────────┐
│  /login ...................... Better Auth magic link + allowlist                │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Onder water (niet als pagina, wel de motor)

```
DATAMODEL — 5 lagen (commercie strikt gescheiden van matching)
  laag 1  referentie ...... merken · leveranciers · categorieën
  laag 2  producten ....... uniek op merk + artikelcode · alle specs (10 buckets)
  laag 3  commercie ....... prices (actueel, intern) · price_lists · prices_archive
  laag 4  offerte ......... quote_lines = snapshot, "bevriest zichzelf"
  laag 5  import/controle . import_runs (markdown) · raw-bestanden in archief

MATCHER — vijfstatussen, 100% deterministisch (LLM kent nooit een status toe)
  🟢 groen · 🟡 geel · 🔵 blauw · 🔴 rood · 🟣 paars
```
