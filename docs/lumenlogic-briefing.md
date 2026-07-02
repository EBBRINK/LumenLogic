---
type: product
aliases: ["Lumenlogic", "LumenLogic", "Lumen Logic"]
links: ["[[brink-licht]]", "[[eduard]]", "[[timo-wittkamp]]", "[[brink-estimate-builder]]", "[[connectingthedots]]"]
confidence: high
last_updated: 2026-06-24
---

# Lumenlogic

## Overview
SaaS van [[brink-licht]] over ~430 premium verlichtingsmerken en ~3 miljoen SKU's. Het is een
**spec-, project- en offertetool met gecontroleerde prijzen** — **nadrukkelijk GEEN webshop**.
Reden: premium merken (Flos, Artemide) wantrouwen e-commerce; elke shop-uitstraling (publieke
prijzen, winkelwagen, afrekenen) laat ze afhaken, en zonder hun logo's verliest het platform
geloofwaardigheid. Lanceert **Brink-branded** (25 jaar vertrouwen = toegangskaart bij merken).
Kernwaarde: tijdwinst, accurate data, duurzaamheidssturing. [[brink-estimate-builder]] is de
huidige bouwsteen hiervan.

## De markt — één wig, niet alles tegelijk
Vijf doelgroepen mogelijk (architecten, interieurontwerpers, installateurs, vastgoedbeheerders,
projectontwikkelaars), maar gefaseerd:
- **Fase 1 (0–6 mnd):** installateurs (warme, betalende klanten, hoge frequentie).
- **Fase 2 (6–12 mnd):** specifiers onder certificeringsdruk (BREEAM/MPG) + premium-merk-buy-in.
Bouw eerst voor de installateur, maar ontwerp datamodel + engine meteen zó dat de specifier later past.

## Het installateursdossier — 3 rollen, 3 documenten (operationele kern)
Eén installateur = drie paar handen, elk met eigen deliverable én eigen engine-stand:
- **Calculator** → geprijsde tender-inschrijving. Engine in **TENDER-STAND**: spec-getrouw, géén groener alternatief duwen (afwijking = "niet gelijkwaardig" = inschrijving eruit).
- **Werkvoorbereider** → value-engineering / substitutievoorstellen (ná gunning). Engine in **POST-GUNNING-STAND**: vol aan, duurzamer/simpeler, mét onderbouwing.
- **Projectleider** → gecodeerd **armaturenboek**, verrassingsvrije overdracht.

## De fase-bewuste engine (hart van de logica)
Dezelfde machine, twee standen, gestuurd door een **statusveld op het dossier** (tender / gegund).
**Default = veilig**: in tenderfase mag de engine niets tonen dat de gelijkwaardigheid in gevaar
brengt. Een tool die overal "het groenere alternatief" roept, kost installateurs aanbestedingen.

## Vergelijkings- & gelijkwaardigheidsengine — "scheidsrechter, geen rechter"
Rangschik **uitsluitend op objectieve, door het merk aangeleverde velden** + toon de bron. Geen
eigen redactioneel oordeel; citeer de cijfers van de merken zelf. Let op het **"geen-data"-probleem**:
merken zonder duurzaamheidsdata mogen niet stilletjes verdwijnen (= impliciet oordeel) — bewuste
keuze: uitsluiten vs. tonen met grijze "geen data"-vlag (openstaand, §14).

## Datamodel & databackbone
Data-pijplijn waarschijnlijk **[[connectingthedots]] PDL** (plumbing, niet het product — de engine,
documenten en het armaturenboek bouwt Brink zelf). **Belangrijkste datakeuze: bouw het uniforme
schema vanaf dag één goed**, incl. de velden waarop de engine matcht:
- **Technisch:** lumen, W, kleurtemp (K), CRI, dimbaarheid, IP, afmetingen.
- **Duurzaamheid/gelijkwaardigheid:** garantietermijn, repareerbaarheid, EPD/levensduur, land van herkomst.
- **Commercieel:** prijs(staffel) + geldigheidsdatum prijslijst.
- **Zichtbaarheid:** per merk/veld een zichtbaarheidsniveau + opt-in-vlag.
Velden achteraf toevoegen over 430 mappings = planning-sloper. **Data-rot:** verlopen prijslijst wordt
automatisch uitgesloten + alert (faalmodus = dekkingsgat, niet foute data; een gat is eerlijk).

## Merkrelaties — disclosure-tiers
Prijzen gecontroleerd (geen publieke prijskaartjes; adviesprijs gegated/projectgebonden).
- **Tier 1:** volledige data + adviesprijs (merk expliciet akkoord).
- **Tier 2:** specs zichtbaar, prijs verborgen/gegated.
- **Tier 3:** alleen naam/logo, data in afwachting van toestemming.

## Verdienmodel (stuurt bouwprioriteiten)
- **Installateur betaalt** voor de dossierdocumenten (abonnement/per dossier) — near-term cash, Fase 1.
- **Spec & vergelijking gratis** — acquisitiekanaal voor specifiers.
- **Merk-data & analytics** — grote lange-termijnomzet (Fase 2): merken betalen voor presence +
  inzichten. **Bouwimplicatie:** leg vanaf dag één een meet-/loglaag aan (welke producten worden
  gespecificeerd/gekozen) — anders mis je later de historie.

## De ijzeren regel (architectuurprincipe, geen toggle)
**Merkgeld mag de ranking NOOIT kantelen.** Betaalde plaatsing in een B Corp-vergelijkingsengine =
geloofwaardigheid (en de moat) weg. Ranking-/matchlogica strikt gescheiden van elke commerciële laag;
geen codepad waarlangs betaling de volgorde/zichtbaarheid beïnvloedt.

## Voorgestelde bouwvolgorde (MVP → uitbouw)
1. Datamodel + uniform schema mét duurzaamheids-, gelijkwaardigheids- en zichtbaarheidsvelden.
2. Import (PDL) voor eerste set Tier 1-merken met pristine data.
3. Calculator-flow: spec inladen → geprijsde tender-inschrijving (eerste betaalde pijnstiller).
4. Armaturenboek-export (gecodeerd).
5. Vergelijkingsengine (gelijkwaardigheid + duurzaamheid), fase-bewust.
6. Werkvoorbereider-view (value engineering, post-gunning).
7. Meet-/analyticslaag (fundament voor Fase 2 merk-analytics).
Valideer onderweg met 3–5 installateurs.

## Openstaande beslispunten
- Prijsmodel Fase 1: per zetel vs. per dossier.
- PDL-contract: schema-scope, mapping-effort ~430 leveranciers, 150 GB, data-eigendom & exit (zie vragenmail [[connectingthedots]]).
- "Geen-data"-product in duurzaamheidsfilter: uitsluiten vs. grijze vlag.
- Definitie + bron van "gelijkwaardigheid" t.o.v. hoe tenderbeoordelaars in de praktijk toetsen.

## Bronnen
- `raw/Platform-briefing-Lumenlogic-2026-06-23.docx` (origineel: "Platform-briefing Lumenlogic — voor Timo", Brink Nederland BV, vertrouwelijk, 23 juni 2026).
- `raw/Lumenlogic-podcast-De-menselijke-psychologie-2026-06.m4a` (audio-versie van dezelfde briefing) — uitgeschreven in [[lumenlogic-podcast-transcript]].
