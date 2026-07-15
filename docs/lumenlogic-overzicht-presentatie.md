# Lumen Logic — Compleet overzicht (presentatiebron)

> Samengesteld 2026-07-15 uit de coderepo-docs (MASTERPLAN, FUNCTIONEEL-ONTWERP,
> matching-regelset, briefing) en de Obsidian-vault (projects/lumenlogic).
> Bedoeld als bronmateriaal voor een presentatie.

---

## 1. Wat is Lumen Logic — in één zin

**Lumen Logic is de spec-, calculatie- en offertetool van Brink Licht voor de
professionele verlichtingsmarkt: armaturenboek erin, binnen minuten een
gecontroleerde, verstuurbare estimate eruit — en elke stap voedt het
data-platform.**

- Opdrachtgever: **Eduard Brink** (Brink Licht / Brink Nederland B.V.)
- Bouwer: **Timo Wittkamp** (via AInstein)
- Status: **LIVE** op https://lumenlogic.vercel.app sinds 2026-07-09
- Schaal: **211.310 producten · 436 merken · 26 leveranciers · 152 categorieën**

## 2. Waarom — de markt

- Premium verlichtingsmerken (Flos, Artemide, XAL, Wever & Ducré, …) **wantrouwen
  e-commerce**. Elke webshop-uitstraling laat ze afhaken.
- Lumen Logic is daarom nadrukkelijk **GEEN webshop**: geen winkelwagen, geen
  checkout, geen publieke prijzen. Het lanceert Brink-branded — 25 jaar
  merkvertrouwen is de toegangskaart.
- Kernwaarde: **tijdwinst** (offertes maken kost nu dagen), **accurate data**,
  **duurzaamheidssturing**.

## 3. De ijzeren regels (niet heronderhandelbaar)

1. Geen webshop-semantiek, ooit.
2. **Geld beïnvloedt nooit de ranking** — matching strikt gescheiden van commercie
   (de geloofwaardigheids-moat).
3. Verlopen prijslijst = product onzichtbaar in álle zoekresultaten.
4. Fase-aware: default = veilig. Tender-stand toont nooit alternatieven.
5. Elke zoekactie/match/offerte wordt gelogd in de events-tabel (fundament voor
   de merk-analytics van fase 2).

## 4. Voor wie — de wig

| Fase | Gebruiker | Rol |
|---|---|---|
| Nu | **Brink binnendienst = klant nul** (2–5 logins: Timo, Eduard, binnendienst) | Bewijzen dat het werkt op echte projecten |
| Fase 1 (0–6 mnd) | **Installateurs** | Betalen voor dossierdocumenten (abonnement / per dossier) |
| Fase 2 (6–12 mnd) | **Specifiers** (BREEAM/MPG-druk) + **merken** | Spec & vergelijking gratis (acquisitie); merken betalen voor presence + analytics |

Drie rollen in het installateursdossier: **calculator** (tender-inschrijving),
**werkvoorbereider** (value-engineering ná gunning), **projectleider**
(gecodeerd armaturenboek). Dezelfde engine, twee standen (tender / gegund),
gestuurd door de dossierstatus.

## 5. De kernflow: Aanvraag → Estimate (5 stappen)

```
1. INLADEN    armaturenboek-PDF → deterministische tekstlaag-parser →
              voorstel-scherm → spec_lines (markdown-controlespoor per importrun)
2. MATCHEN    per regel: SKU exact → parametrisch binnen merk (SQL + tolerantietabel)
              → status groen/geel/blauw/rood/paars + afwijkingenlijst
3. REVIEWEN   review-station: mens beslist bij ambiguïteit (gele gevallen,
              kleur-/varianten, rood handmatig linken)
4. UITSTUREN  estimate met totalen-per-kleur + p.m. → XIS-export (POST-API door
              Lynx in aanbouw; tot die tijd exportbestand)
5. LEREN      alles in de event-log; hit-rate op evaluatieset = kwaliteitsmeter
```

Drie bronsoorten: armaturenboek = **wát**, bestek/telstaat = **hoevéél**,
tekening = **wáár** — gekoppeld op armatuurcode.

## 6. Het hart: de vijfstatussen-regelset (met Eduard vastgesteld)

| Status | Betekenis | Actie |
|---|---|---|
| 🟢 **GROEN** | Product hebben we; alle specs binnen groene marge | Direct in de offerte |
| 🟡 **GEEL** | Zelfde merk, zelfde productlijn-DNA, afwijking binnen gele marge | Brink reviewt en stelt voor (auto-door mét afwijkingsnotitie) |
| 🔵 **BLAUW** | Merk niet in de database — dátagat, ónze actie | Merk inladen (voedt inlaadprioriteit) |
| 🔴 **ROOD** | Merk wél, dit product niet / buiten gele marge / lager IP | Actie bij de klant |
| 🟣 **PAARS** | Buiten assortiment (geen verlichting) | Expliciet melden, nooit weglaten |

Invarianten (elk getest): niets stilzwijgend weglaten · aanvraagvolgorde
aanhouden · lager IP = altijd rood · elke afwijking benoemen (ook binnen groen) ·
ontbrekende data ≠ afwijkende data · groen+geel tellen in het totaal ·
**statustoekenning is deterministische code — een LLM kent nooit een status toe**
(AI alleen als vangnet: import-verrijking, PDF-inlezen, zoek-fallback; nu nog uit,
geen API-key).

## 7. Datamodel — 5 lagen

```
laag 1  REFERENTIE    merken (436, incl. disclosure-tier) · leveranciers (26)
                      · categorieën (152, 3 niveaus)
laag 2  PRODUCTEN     products (211.310) — uniek op merk + artikelcode,
        (matching)    alle specs in 10 buckets
laag 3  COMMERCIE     prices (alleen actueel; bruto + inkoop intern) ·
        (gescheiden)  price_lists (één actieve lijst per merk) ·
                      archive.prices_archive (koud, append-only)
laag 4  OFFERTE       quote_lines = snapshot: naam + prijs + prijslijst +
                      lijstdatum vastgeklikt — "de offerte bevriest zichzelf"
laag 5  IMPORT &      import_runs (markdown-controlespoor) ·
        CONTROLE      docs/import-beslissingen.md (25 spelregels) ·
                      raw-bestanden in Supabase-archief
```

Disclosure-tiers voor merkrelaties: **Tier 1** volledige data + adviesprijs ·
**Tier 2** specs zichtbaar, prijs gegated · **Tier 3** alleen naam/logo.

## 8. Systemen & stack

- **App:** Next.js 16 (App Router, RSC) · React 19 · TypeScript · Tailwind 4 +
  shadcn/ui · Bun
- **Data:** Drizzle ORM + **Neon Postgres** (één DB voor lokaal + productie);
  zoeken via Postgres full-text + trigram (geen Elasticsearch)
- **Auth:** Better Auth magic link + allowlist (mailprovider Resend nog te koppelen)
- **Hosting:** Vercel (deploys via CLI, `vercel --prod`)
- **Tests:** Vitest incl. RSC-screenshottests — **294+ tests groen** (datamodel-
  branch: 402), typecheck schoon
- **Archief:** Supabase (raw importbestanden; was de oorspronkelijke databron)
- **ERP-koppeling:** **XIS** (Lynx Solutions, on-premise). Grens: Lumen Logic =
  spec + match; XIS = prijzen, offertedocument, opvolging. POST-API in aanbouw.

## 9. Verdienmodel

1. **Installateur betaalt** voor dossierdocumenten — near-term cash (fase 1).
2. **Spec & vergelijking gratis** — acquisitiekanaal voor specifiers.
3. **Merk-data & analytics** — de lange-termijnomzet (fase 2): merken betalen
   voor presence + marktinzichten. Daarom: event-log vanaf dag één, en het
   merkportaal (geaggregeerd dashboard = anonimiseringsgrens).

## 10. Wat er nu draait (functioneel)

- Vijfstatussen-matcher op tolerantietabel (deterministisch, 7 geteste invarianten)
- Twee-lijsten-presentatie ("voldoet aantoonbaar" / "mogelijk — data onvolledig")
  + afwijkingentabel
- Review-station (geel → automatisch in de Review-tab; echte variantkaarten)
- Estimate met totalen-per-kleur + p.m.; XIS-export
- PDF-import met voorstel-scherm + markdown-controlespoor per run
- Verrijking + `/data`-werkbank, catalogus, instellingen + allowlist
- Latere horizon (ook al gebouwd): organisaties/rollen, dossier-lifecycle,
  disclosure-tiers + productpagina's + leads + vergelijk-tray, substitutie- en
  systeemalternatieven, armaturenboek-versies + staffels, merkportaal `/merk/*`,
  admin `/admin/*`
- Test-armaturenboek (20 regels, lokt alle 5 statussen uit):
  9 groen · 5 geel · 2 rood · 2 blauw · 2 paars

## 11. Werkwijze & status per onderdeel

Sinds 2026-07-09: **onderdeel voor onderdeel, top-down**, per onderdeel drie fases
(idee/nulmeting → plan → bouw), telkens met agents die elkaars werk controleren.

| Onderdeel | Status |
|---|---|
| Aanvraag → Estimate (kernflow) | ✅ Afgerond & live (2026-07-14) |
| Datamodel & productspecs (migratie 0007) | ✅ Gebouwd (2026-07-14) |
| Merkrelaties (migratie 0008) | 🔨 In uitvoering (deze branch) |
| Analytics | ⏸ Geparkeerd (nulmeting klaar) |

## 12. Open punten

1. ANTHROPIC_API_KEY toevoegen → AI-vangnet live
2. Branch `runs-4-6-vijfstatussen` naar GitHub pushen
3. Resend koppelen (magic link per mail)
4. Extern afhankelijk: XIS POST-API (Lynx), OCR voor beeld-PDF's, facturatie
5. Supabase-project hernoemen naar "Brinklicht"
