# Sprint 1.1 — het probleem in eigen woorden

> Stap 1 van de verplichte werkwijze (briefing `docs/sprint1-1-briefing.md`).
> Geschreven vóór er een regel code is. Nog geen ontwerpbesluiten — die komen uit de
> plan-agents; dit document legt alleen vast wát er precies moet kloppen.

## Wat is er aan de hand

Merken krijgen van ons een Excel-template (`buildMasterTemplateXlsx()`), vullen het in, en
mailen het terug naar Brink. Dat teruggekomen bestand kan nu nergens naar binnen. Week 1
bouwt dat retour-pad; 1.1 is de poortwachter die als eerste naar het bestand kijkt.

De poortwachter schrijft zelf niets weg (besluit 1, grill-sessie 15 jul: nooit stil
wegschrijven). Hij leest een buffer en geeft een oordeel terug. 1.2 doet er iets mee.

## Wat is "ons format" exact (feiten uit `lib/excel-template.ts`, geverifieerd 16 jul)

- Werkblad **"Product data"** moet bestaan. Tweede werkblad "Instructions" is tekst-uitleg
  en doet er voor validatie niet toe.
- Rij 1 = samengevoegde bucketgroep-koppen (cosmetisch). **Rij 2 = de veldlabels** — dit is
  de enige rij die identificeert welke kolom welk veld is. Labels zijn `field.labelEn`,
  Engels. Rij 3 = instructies. **Data begint op rij 4.**
- De kolommen zijn `excelColumns()` uit `lib/field-catalog.ts`: alle velden met `inExcel`
  én `!internalOnly`, in bucket-volgorde. Dat is de enige bron van waarheid — de module mag
  geen enkele kolomnaam hardcoden, want het template wijzigt (16 jul nog: NL-velden eruit,
  commit `34e1e57`).
- Must-velden = `niveau: "must"` binnen die kolommen. Stand vandaag zijn dat er vier
  (Supplier article code, Product name (English), Category, Gross list price excl. VAT),
  maar ook dat leiden we runtime af. Oudere HANDOVER-notities noemen "must-totaal 3" —
  die tellen iets anders; de code is leidend.
- De template-instructie vraagt merken de kolomvolgorde ongemoeid te laten. Merken doen dat
  niet altijd. Hoe streng we daarop zijn, is een ontwerpbesluit voor de plan-agents.

## Welke faalvormen bestaan er

Twee niveaus, strikt gescheiden — dit is de kern van de opdracht:

**(a) Format-afwijzing — "dit is niet ons format".** Het bestand is geen ingevulde versie
van ons template. Vormen: werkblad "Product data" ontbreekt; rij 2 bevat onze veldlabels
niet; kolomkoppen zijn hernoemd of weggelaten; het is geen leesbare .xlsx. Uitkomst: één
duidelijke afwijzing **mét de lijst van wat er mist** (welke kolommen precies), en er
worden géén rijen verwerkt. Half werk is hier erger dan niets.

**(b) Rij-waarschuwingen — format klopt, inhoud roept vragen op.** Het bestand is ons
template, dus we kunnen per rij kijken. Vormen, elk mét rijnummer:
- een must-veld is leeg;
- de supplier article code komt niet voor in de bekende codes van dit merk → "nieuw
  product?" — een dubbelcheck voor Brink, uitdrukkelijk géén fout;
- twee rijen in hetzelfde bestand dragen dezelfde supplier article code.

Waarschuwingen blokkeren niets. 1.2 toont ze in het voorstel-scherm en een mens beslist.
Een leeg bestand (0 datarijen) is geen fout — het is gewoon een correct format zonder rijen.

## Wat de module is

Een pure functie: buffer + context erin, oordeel eruit. Geen `db/`, geen `lib/repo/`, geen
route, geen UI, geen migratie, geen events. De bekende artikelcodes komen als parameter
binnen (1.2 haalt ze uit de DB); de module doet niets met merknamen — het template heeft
niet eens een merkkolom, en merk-normalisatie is van de parallelle leesroute-sessie.

Dat "puur" is geen stijlvoorkeur: week 4-uitloop B (merkportaal-self-serve-upload) moet
deze module **ongewijzigd** hergebruiken. Elke DB-afhankelijkheid die we er nu in laten
lekken, is over drie weken een herschrijving.

Meldingen in het Nederlands (de interne UI is Nederlands, Brink uploadt). Het template
zelf blijft Engels.

## Wat expliciet niet van 1.1 is

- Aansluiten op `brand_uploads`/staging — dat beslist 1.2.
- Prijzen: het prijsveld wordt alleen op *gevuld/leeg* getoetst. Nooit op waarde gerankt of
  vergeleken (IJzeren regel 2: geld beïnvloedt nooit de ranking).
- Merk-aliassen/`brandKeyOf` — leesroute-sessie.
- Events — 1.1 voegt geen runtime-gedrag toe; die komen in 1.2 op het upload-pad.

## Open vragen voor de plan-agents

1. Kolomherkenning: strikt op volgorde, of op naam (volgorde-onafhankelijk, onbekende
   kolommen negeren-met-melding)? Wat is robuust voor rommelende merken?
2. Waar ligt de grens tussen (a) en (b)? Eén ontbrekende optionele kolom — afwijzing of
   melding? Eén ontbrekende must-kolom — vermoedelijk afwijzing.
3. Module-API: één functie of een klein oppervlak? Vorm van het resultaat-type zodat 1.2
   er een scherm op kan bouwen en 4.B hem ongewijzigd hergebruikt.
4. Bestandsnaam (`lib/excel-validate.ts`?) en de exacte testlijst.
