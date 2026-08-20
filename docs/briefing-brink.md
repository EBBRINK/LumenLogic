# Lumen Logic — Briefing voor Brink (Eduard, Menno, Jayden)

> Overdracht, augustus 2026. Dit is de leesbare versie voor niet-programmeurs:
> wat Lumen Logic is, wat het kan, hoe je erin komt, wat de spelregels zijn en
> wat je doet als er iets misgaat. Technische details staan in
> `docs/briefing-ai.md` en het stappenplan-voor-beheer in `docs/RUNBOOK.md`.

---

## 1. Wat is Lumen Logic en waarom bestaat het

Lumen Logic is de spec-, calculatie- en offertetool van Brink Licht. Het is
gebouwd om één werkstroom snel en betrouwbaar te maken: een armaturenboek of
bestek binnenkrijgt → uitzoeken welke producten uit de catalogus daarbij horen
→ dat controleren → er een geprijsde offerte (estimate) van maken.

Waarom een eigen tool en geen webshop? De premium verlichtingsmerken (denk
Flos, Artemide) willen niet dat hun producten met publieke prijskaartjes op
internet staan. Zodra iets op een webshop lijkt, trekken ze hun data terug.
Lumen Logic is daarom nadrukkelijk **géén webshop**: geen winkelwagen, geen
afrekenknop, geen prijzen voor de buitenwereld. Het is vakgereedschap voor
Brink zelf (en later voor installateurs), met gecontroleerde prijzen.

De eerste gebruiker ("klant nul") is de Brink-binnendienst. De site draait
live op https://lumenlogic.vercel.app.

## 2. Wat kan het

**Zoeken en matchen.** Je laadt een armaturenboek of spec in en het systeem
zoekt per regel het gevraagde product in de catalogus (ruim 200.000 producten,
honderden merken). Elke regel krijgt een kleur:

- **Groen** — dit is het gevraagde product, specs kloppen.
- **Geel** — zelfde merk en productlijn, kleine afwijking; iemand van Brink
  kijkt ernaar en beslist.
- **Blauw** — het merk zit nog niet in onze database; dat is óns huiswerk
  (merk inladen), niet een "nee" naar de klant.
- **Rood** — het merk kennen we wel, maar dit product niet (of de afwijking
  is te groot). Actie ligt bij de klant/leverancier.
- **Paars** — geen verlichting (valt buiten ons assortiment); wordt wél
  gemeld, nooit stilletjes weggelaten.

Belangrijke principes daarbij: geen enkele regel verdwijnt stilletjes, de
volgorde van de aanvraag blijft altijd staan, en elke afwijking wordt benoemd
("gevraagd 12W, geleverd 13W") — ook als hij binnen de marge valt.

**Projectdossiers.** Elk project is een dossier met de spec-regels, de
matchresultaten, het review-station (waar een mens twijfelgevallen beslist) en
de offerte. Een dossier heeft een fase: *tender* of *gegund*. In de
tender-fase doet het systeem bewust géén suggesties voor alternatieven — een
"groener alternatief" aanbieden tijdens een aanbesteding kan een inschrijving
ongeldig maken. Veilig is de standaard.

**Offertes / estimates.** Vanuit een dossier maak je een geprijsde regellijst
met totalen, als scherm, printversie en PDF-download. Regels zonder match of
zonder prijs staan er eerlijk in als "p.m." en tellen niet mee in het totaal.

**PDF- en bestandsimport.** Je kunt armaturenboeken uploaden als PDF, maar ook
als Excel, Word, CSV of zelfs een foto/scan. Nette bestanden worden
automatisch gelezen; rommelige of gescande bestanden gingen tot voor kort door
een AI-leesroute (zie §5 — die staat nu uit).

**Prijslijstenbeheer via de brandportal.** Nieuwe of bijgewerkte
prijslijsten van een merk gaan via het brandportal-gedeelte van de app
(`/brand`): het merk (of Brink) uploadt daar het ingevulde brand-Excel met de
66 afgesproken velden. Elke prijslijst heeft een verplichte geldigheidsdatum —
die datum stuurt de belangrijkste spelregel van het hele systeem (zie §4,
regel 3).

**Logboek.** Alles wat er gebeurt — elke zoekactie, elke match, elke offerte —
wordt vastgelegd. Dat is de audittrail ("wat is er gebeurd?") én het fundament
voor latere merk-analytics.

## 3. Inloggen — hoe de magic link nu werkt

Inloggen gaat met een **magic link**: je vult op de loginpagina je e-mailadres
in en klikt op een link die je toegang geeft. Maar let op: **er wordt op dit
moment géén e-mail verstuurd.** Er is bewust nog geen mailprovider aangesloten
(mail versturen onder brinklicht.nl is afgeblazen; eventueel komt er later een
eigen lumenlogic-domein).

De link bestaat wél — hij verschijnt in de logboeken van de server:

- Werkt iemand lokaal op een ontwikkelmachine, dan staat de link in het
  terminalvenster van de dev-server.
- Op de live site staat de link in de Vercel-logs. De beheerder haalt hem op
  met één commando (staat in het RUNBOOK, §4) of via het Vercel-dashboard.

De link is **5 minuten geldig**. Te laat? Gewoon opnieuw aanvragen.

Praktisch betekent dit: een nieuwe gebruiker toevoegen of iemand laten
inloggen vereist iemand met toegang tot die logs. Daarnaast is er een
wachtwoord-route: via `/admin/users` maakt een beheerder een account aan met
een PIN, waarna de gebruiker via `/activate` een wachtwoord instelt en
voortaan gewoon met wachtwoord inlogt. Alleen adressen op de allowlist
(beheer op `/settings`) kunnen überhaupt inloggen.

## 4. De ijzeren regels

Deze vijf regels gelden voor alles wat er ooit aan het systeem gebouwd wordt.
Ze zijn er niet voor de sier — elk ervan beschermt de relatie met de merken of
met de klant.

1. **Dit is geen webshop.** Geen winkelwagen, geen checkout, geen publieke
   prijzen. Zodra het op e-commerce lijkt, haken de premium merken af.
2. **Geld beïnvloedt nooit de volgorde.** Welk product bovenaan staat wordt
   bepaald door de specs, nooit doordat een merk betaalt. Dit is het
   geloofwaardigheidsfundament van het hele platform.
3. **Verlopen prijslijst = product zichtbaar, maar zónder prijs.** Er wordt
   nooit geoffreerd op een verouderde prijs. Het product blijft wel vindbaar
   (bestekschrijvers hergebruiken oude bestekken, en die artikelnummers moeten
   een treffer geven), maar de prijs is weg, het staat rood gemarkeerd, en
   erbij staat welke prijslijst de laatst bekende was. *Let op: tot 19
   augustus 2026 was de regel strenger ("product helemaal onzichtbaar") — in
   oudere documenten, waaronder het RUNBOOK, kan die oude formulering nog
   staan. De bescherming is gelijk gebleven: nooit een prijs uit een verlopen
   lijst.* Een gat is eerlijk; een verkeerde prijs is fataal.
4. **Veilig is de standaard.** In de tender-fase toont het systeem nooit
   alternatieven-suggesties.
5. **Alles wordt gelogd.** Elke zoekactie, match en offerte staat in het
   logboek (de events-tabel).

## 5. AI staat op dit moment uit

Per **20 augustus 2026 is de Anthropic-sleutel uit de productieomgeving
gehaald**. Dat betekent dat de AI-onderdelen niet actief zijn:

- de **AI-leesroute** voor rommelige of gescande PDF's/foto's;
- het **AI-vangnet** dat bij niet-gematchte regels extra zoekpogingen deed.

De app blijft gewoon werken: alles valt terug op het gewone (deterministische)
pad. Nette bestanden met een tekstlaag worden nog steeds gelezen en gematcht.
Wat je merkt: gescande boeken en handschrift worden niet meer automatisch
gelezen, en er komen geen AI-suggesties meer bij lastige regels. Wil Brink de
AI-functies weer aan, dan is dat een kwestie van een eigen Anthropic-sleutel
in de omgeving zetten; er zit een instelbaar maandbudget op (via `/settings`)
zodat de kosten nooit weglopen.

## 6. Dagelijks beheer

- **Waar staan de logs?** Twee plekken. (1) De technische serverlogs staan bij
  Vercel (dashboard → project `lumenlogic` → Logs, of via het commando in het
  RUNBOOK §4/§7) — daar staan ook de magic links. (2) Het functionele logboek
  — wie zocht wat, welke match, welke offerte — staat in de events-tabel in de
  database (Neon); dat is de eerste stop bij "wat is er gebeurd?"-vragen.
- **Site plat?** Kijk eerst in het Vercel-dashboard naar de laatste
  deployment; daar kun je met één klik terug naar de vorige versie ("Instant
  Rollback"). Werkt dat niet, check dan of de database (Neon) bereikbaar is.
  Meer smaken zijn er niet: de app hangt alleen aan Vercel en Neon.
- **Eén waarschuwing die iedereen moet kennen:** er is maar één database.
  Wie lokaal op een ontwikkelmachine werkt, werkt **in de echte
  productiedata**. En elke code-wijziging die naar "main" wordt gestuurd staat
  binnen een minuut live — er is geen tussenstap. Daarom mag pushen alleen
  via het speciale script (staat in het RUNBOOK, §4).
- Het volledige stappenplan — van schone installatie tot databaseherstel —
  staat in **`docs/RUNBOOK.md`**. Dat is het document voor de beheerder.

## 7. Wie doet wat na de overdracht

- **Brink (Eduard, Menno, Jayden)** wordt eigenaar van het product en het
  dagelijkse gebruik: dossiers, matchen, reviewen, offertes, prijslijsten
  bijhouden (geldigheidsdatums!), gebruikers beheren via `/settings` en
  `/admin/users`.
- **De accounts en diensten** (Vercel, Neon-database, GitHub) gaan over naar
  Brink volgens het migratiedraaiboek (`docs/spike-2.3-migratie-draaiboek.md`).
- **Supabase blijft bij Timo.** Dat is uitsluitend het archief met de
  oorspronkelijke brondata; de app gebruikt het niet en heeft het niet nodig.
- **AI-functies** zijn uitgeschakeld (zie §5); weer aanzetten is een keuze
  (en een sleutel) van Brink.
- **Toekomstig onderhoud/bouw** doet een ontwikkelaar of AI-sessie namens
  Brink; die begint bij `docs/briefing-ai.md` en het RUNBOOK. Het omzetten van
  ruwe leveranciers-prijslijsten naar het 66-velden-Excel was tot nu toe een
  AI-geassisteerd proces bij Timo — spreek bij de overdracht af hoe Brink dat
  voortaan doet.

Vragen die dit document niet beantwoordt: eerst `docs/RUNBOOK.md`, dan
`docs/briefing-ai.md`.
