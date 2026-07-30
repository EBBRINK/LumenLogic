# Probleem: de spec-informatie van 28 merken staat in de rauwe tabellen, niet in de catalogus

> Fase 1 (probleem uitschrijven), 30 jul 2026. Elk getal met **gemeten** ervoor heb ik zelf
> nagerekend op de Neon-branch `enrichment-serien` (endpoint `ep-rapid-credit-at806lp6`), achter
> `scripts/branch-guard.ts`, met de échte functies — `parseProductName`, `evaluateSpecLine`,
> `pickSampleIndices` — en nooit met een nagebouwde query. Getallen die uit
> `docs/zwerm-kolomonderzoek-28-merken.json` komen staan als **overgenomen** gelabeld; waar ik ze
> onafhankelijk heb kunnen kruiscontroleren staat dat erbij.
>
> Voorgangers die dit doc niet overdoet: `docs/probleem-merk-speckolommen-serien.md` +
> `docs/plan-merk-speckolommen-serien.md` (Serien, de kolomroute) en
> `docs/probleem-lege-speckolommen-xal.md` + `docs/rapport-cri-run-xal.md` (XAL, de naam-route).

## Het probleem in één regel

28 merken leveren CRI, kelvin, IP, wattage, lumen, bundelhoek en dimprotocol aan als **eigen
kolommen** in hun rauwe prijslijsttabel op Supabase; in de catalogus staan die zeven matchvelden
bij het merendeel van die merken op **0 %**, en de opdracht is ze er in drie ronden van zeker naar
onzeker in te krijgen — met een agent-zwerm als controle na elke ronde.

## Wat er vandaag in de catalogus staat — gemeten, bestemmingskant

Gemeten op de branch (`scripts/meet-bestemming.ts`), 211.317 producten over 33 merken met
producten. Alleen de merken die in het zwerm-onderzoek voorkomen; percentage = aandeel producten
met dat veld gevuld.

| merk | producten | kelvin | cri | ip | watt | lumen | beam | dim |
|---|---|---|---|---|---|---|---|---|
| Lombardo | 65.096 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| XAL | 31.420 | 27.850 | 7.049 | 2.090 | 28.322 | 0 | 5.284 | 14.267 |
| Flos Architectural | 18.263 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Axo Light | 15.862 | 14.796 | 0 | 60 | 7.428 | 0 | 9.110 | 29 |
| Kreon | 13.998 | 12.035 | 0 | 796 | 11.654 | 4.402 | 7.852 | 4.393 |
| Artemide Architectural | 8.559 | 3.003 | 0 | 110 | 1.039 | 0 | 1.374 | 995 |
| Egoluce | 8.376 | 6.537 | 0 | 74 | 153 | 0 | 355 | 323 |
| Wever & Ducré | 8.120 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Roger Pradier | 7.747 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Prado | 7.321 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| TAL | 6.481 | 5.232 | 0 | 224 | 193 | 1.315 | 2.591 | 1.205 |
| Sylvania | 3.914 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| TossB | 2.934 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Aromas | 1.987 | 9 | 0 | 0 | 8 | 8 | 0 | 0 |
| Serien Lighting | 1.955 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Marset | 1.723 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Artemide | 1.699 | 360 | 0 | 3 | 42 | 0 | 111 | 11 |
| Estiluz | 1.081 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Nordlux | 1.027 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| CLS | 1.016 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Leucos | 754 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| &Tradition | 539 | 0 | 0 | 0 | 5 | 0 | 0 | 0 |
| It's About RoMi | 420 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Northern | 309 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Muuto | 276 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Nyta | 233 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Valerie Objects | 90 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Flos | 4 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |

Catalogusbreed gevuld: kelvin 69.826 · cri 7.052 · ip 3.360 · watt 48.845 · lumen 5.728 ·
beam 26.677 · dim 21.223. Slechts **10.216 producten** dragen een `tier2_source`-stempel — allemaal
XAL. De rest van wat er staat komt uit de import, niet uit verrijking.

Twee merken uit het zwerm-onderzoek hebben **géén catalogusmerk**: `brickinthewall` (21.383
bronrijen, koppelt sowieso niet) en `goodmojo` (42 bronrijen, 7 treffers). Omgekeerd hebben
Lumiance (105) en SymmaLed (1) wél producten maar geen rauwe tabel.

## Kruiscontrole op het zwerm-onderzoek: de koppelsleutels houden stand — met vijf uitzonderingen

De opdracht zegt: verifieer steekproefsgewijs, meet niet alles opnieuw. Ik kan de rauwe kant niet
zien (blokkade 1), maar de **bestemmingskant** wel, en die geeft een onafhankelijke toets die het
zwerm-onderzoek zelf niet had: `koppelTreffers` mag nooit hoger zijn dan het aantal producten van
dat merk in de catalogus.

**Gemeten: `products.supplier_article_code` is globaal uniek** — 211.317 rijen, 211.317 distincte
codes, 0 duplicaten, en **0 codes die over meer dan één merk voorkomen**. De join is dus
ondubbelzinnig. Precies daarom is dit een echte toets.

Zeven merken komen exact uit (&Tradition 539, Muuto 276, Northern 309, Valerie 90, XAL 31.420,
Serien 1.955, Aromas 1.987, Nordlux 1.027, CLS 1.016, Prado 7.321, Egoluce 8.376, Roger Pradier
7.747, TAL 6.481, Nyta 233). Dat is sterke steun voor de sleutels.

**Maar bij vijf merken is `koppelTreffers` hóger dan het aantal producten van dat merk:**

| merk | zwerm-treffers | producten in catalogus | verschil |
|---|---|---|---|
| flos | 19.872 | 18.267 (Flos Architectural + Flos) | **+1.605** |
| lombardo | 65.360 | 65.096 | **+264** |
| marset | 2.172 | 1.723 | **+449** |
| sylvania | 4.020 | 3.914 | **+106** |
| artemide | 10.281 | 10.258 (beide Artemide-merken) | **+23** |

Omdat de code globaal uniek is, kan dat maar twee dingen betekenen, en allebei zijn ze schadelijk:

1. **De rauwe tabel heeft dubbele sleutels** — meerdere bronrijen op één product. Dan is niet
   bepaald wélke rij wint, en de overzetting is niet-deterministisch. Dat breekt de
   run-vingerafdruk uit het Serien-plan (§"Twee keer dezelfde bewerking"), die er juist op rekent
   dat dezelfde bron dezelfde voorstellen geeft.
2. **De rauwe tabel raakt producten van een ánder merk.** Dan schrijft een Marset-run een
   Marset-cel op een niet-Marset-product. Dat is val 2 in zijn ergste vorm, en `publishRun` is
   onomkeerbaar.

Dit is **nieuw** ten opzichte van het zwerm-onderzoek en het is niet af te doen als ruis: bij Flos
gaat het om 1.605 rijen (8,1 % van de tabel), bij Marset om 449 (20,7 %). Voor élk merk moet vóór
ronde 1 gemeten worden `count(*)` versus `count(distinct sleutel)` én of het gekoppelde product
werkelijk van dát merk is. De koppel-query hoort dus altijd `and p.brand_id = <merk>` te dragen.

## Blokkade 1 — Supabase is in déze sessie opnieuw onbereikbaar

Dit is het harde punt en het houdt ronde 1 en ronde 2 volledig tegen.

- Geen Supabase-MCP-tool in deze sessie (nagekeken via de tool-zoeker).
- Geen Supabase-credential in `.env.local` (uitsluitend Neon, Vercel, Better Auth, Anthropic) en
  geen in `.env.branch` (twee sleutels: `DATABASE_URL`, `LUMENLOGIC_DB`).
- `data/source/` bevat vier CSV's — `brink_products`, `brink_brands`, `brink_categories`,
  `brink_suppliers`. De 28 rauwe per-merk-tabellen zitten er niet in.
- Er bestaat **nergens in de repo of in een van de zeven worktrees een export** van een rauwe
  tabel. Ook niet van `brink_serien_raw`, terwijl het Serien-plan die export als expliciete
  voorwaarde noemt ("de bron wordt één keer geëxporteerd naar een bestand, dat bestand krijgt een
  hash, en **beide** runs lezen datzelfde bestand").

Gevolg: van de 158 kolommen in `stap2Wachtrij` en de 11 in `stap1Klaar` kan ik er vandaag **nul**
lezen. Ronde 1 en 2 zijn niet te bouwen en niet te controleren; alleen ronde 3 (de naam-route)
staat er los van.

Dit is dezelfde blokkade die het Serien-spoor 's ochtends had en die 's middags met read-only
toegang opgelost werd. **De export die toen gemaakt had moeten worden, is niet bewaard** — daarom
staat hij nu opnieuw in de weg, en daarom is "eerst exporteren, dan pas werken" hieronder een
harde eis en geen nette gewoonte.

### En nee, de catalogus draagt de leverancierstekst niet zelf — nagemeten

De import-bron heeft 45 kolommen en daar zitten er een paar tussen die de blokkade hadden kunnen
omzeilen: `description`, `light_source`, `light_source_included`, `lamp_foot`, `lamp_category`.
Als `products.description` de rauwe leveranciersomschrijving droeg, zou een flink deel van ronde 2
vandaag bereikbaar zijn — 158 van de kolommen in `stap2Wachtrij` komen immers uit precies zo'n
vrijetekstveld (`Description`, `DESCRIZIONE`, `Omschrijving`, `Item Desc.50NL`).

Gemeten (`scripts/meet-description.ts`, `scripts/meet-description-inhoud.ts`): **de kolommen
bestaan en zijn zo goed als leeg.**

- `light_source`, `light_source_system`, `light_source_included`, `lamp_foot`, `lamp_category`:
  **0 gevuld bij álle 28 merken.** Daarmee is de Muuto-kruistabel uit blokkade 5 vandaag **niet**
  te draaien — er is geen lichtbron-kolom om tegen te kruisen. Blokkade 5 blijft dus staan.
- `description` is bij precies zeven merken gevuld, en levert vrijwel niets nieuws op:

| merk | gevuld | veldvullingen uit de naam | uit de description | **extra** |
|---|---|---|---|---|
| Sylvania | 3.914 (100 %) | 7.164 | 7.164 | **0** — de description is letterlijk gelijk aan de naam |
| Lumiance | 105 | 310 | 310 | **0** — idem |
| It's About RoMi | 420 | 21 | 21 | **0** — idem |
| Nordlux | 1.027 (100 %) | 117 | 284 | **225** — draagt `[DECO-FUNCTIONAL]`/`[OUTDOOR]` plus wat stijltekst |
| Nyta | 233 | 6 | 46 | **40** |
| Marset | 2 | 0 | 0 | **0** — staffelprijs-notities, puur commercieel |
| Leucos | — | 36 | 0 | **0** |

Totale winst als je de bestaande parser óók over `description` laat lopen: **265 veldvullingen**
op 150.633. Verwaarloosbaar, en bij Nordlux zit het in een categorie-tag die geen matchveld is.

Dit is een negatief resultaat en dat is precies waarom het hier staat: het sluit de gedachte
"misschien kunnen we het zonder Supabase" definitief af, in plaats van hem als hoop te laten
staan.

## Blokkade 2 — de voorwaardelijke code staat op twee zijsporen, niet op `main`

Dit spoor kan zonder drie ingrepen niet draaien, en geen daarvan staat op `origin/main`:

| wat | waar | zonder dit |
|---|---|---|
| `chunk()` / `INSERT_CHUNK = 1000` in `createRun` | `claude/optimistic-wing-334c41` (`fc049f9`) | één bulk-insert van >1.000 voorstellen faalt op de neon-HTTP-driver |
| `fields`-filter op `startEnrichmentRun` | idem (`7e0b94a`) | de steekproef van 100 verdeelt zich over zeven velden en meet niets |
| `scripts/branch-guard.ts` + `publiceer-run.ts` | idem (`f7564d0`) | er is geen gepoorde schrijfroute |
| `supplier-columns.ts` / `supplier-cell.ts` | losse commit `9ba288f` (**detached HEAD**, geen branch) | er is geen kolom→veld-poort |

`9ba288f` hangt aan geen enkele branchnaam en is alleen via zijn SHA te vinden — één `git gc` en
dat werk (2.518 regels, inclusief 38 groene tests) is weg.

**Wat ik gedaan heb:** beide sporen lokaal in deze worktree samengevoegd (`0b3663f` en de merge van
`9ba288f`), omdat er zonder die code niets te meten valt. Alleen `HANDOVER.md` conflicteerde —
beide kanten waren toevoegingen, beide behouden. Code merget schoon; **109 tests groen**. Ik push
niets; de volgorde waarin dit op `main` landt is een beslissing voor de sprintmaster.

## Blokkade 3 — de meetlat kan hooguit een tiende van dit werk zien

Gemeten met `scripts/eval-testset.ts` tegen de branch (7,5 min, read-only). De nulmeting:

| case | import | statusverdeling | rang≤50 | auto-keuze | top-1 |
|---|---|---|---|---|---|
| raadhuis | 31/31 | open 12 · blauw 10 · geel 6 · rood 2 · paars 1 | 4/4 | 0/4 | 2/4 |
| kvk | 0/48 | – (leesroute, vergt `--ai`) | – | – | – |
| tno | 15/20 | open 11 · blauw 2 · groen 1 · geel 1 | – | – | – |
| dordrecht | 0/18 | – (beeld-PDF, vergt `--ai`) | – | – | – |

Twee van de vier cases leveren zonder `--ai` geen enkel cijfer. Blijven over: 204 spec-regels, en
gemeten dragen die 94× kelvin, 94× dimmable, 87× beam, 72× cri, 65× watt, 58× lumen, 55× ip.

**Welke van mijn 28 merken worden gevraagd?** Gemeten over `spec_lines.brand_text`, genormaliseerd
tegen `brands.name`:

| gevraagd merk | regels | waarvan blauw/open |
|---|---|---|
| XAL | 35 | 4 |
| Axo Light | 8 | 0 |
| Flos (4 producten) | 6 | 0 |
| Kreon | 6 | 0 |
| Wever & Ducré | 5 | 1 |
| TAL / Egoluce / Artemide | 3 elk | 0 |
| Muuto | 1 | 0 |

De grootste gevraagde merken — Trilux (9), BEGA (8), ETAP (8), NORKA (5), Philips (4) — hebben
**nul producten** in de catalogus en staan dus blauw; verrijking raakt ze per definitie niet.

De opdracht zegt terecht dat Serien nergens gevraagd wordt. **Maar het is scherper dan dat:** van
de 28 merken worden er 9 gevraagd, samen goed voor 70 regels, en daarvan staan er **5 op een
status die `publishRun` überhaupt hermatcht** (`REMATCHABLE = ['blauw','open']`,
[enrichment.ts:55](lib/repo/enrichment.ts:55)).

Nuance die de zaak redt, en die je alleen ziet als je het meetscript werkelijk leest:
`eval-testset.ts` leest de PDF's **vers** en roept `evaluateSpecLine` opnieuw aan — het leest
`spec_lines` niet terug. De meetlat is dus níét aan die 5 gebonden; hij ziet alle 70 regels
opnieuw beoordeeld worden. De grens van 5 geldt voor wat er in de dossiers zichtbaar verandert,
niet voor wat het meetscript kan zien. Dat onderscheid moet in het rapport per ronde expliciet
staan, anders leest "0 verschil" als "geen effect" terwijl het "niet gevraagd" betekent.

**Conclusie: de meetlat is per ronde onvoldoende, maar niet nutteloos.** Er is een tweede meetlat
nodig — dekking (hoeveel velden gevuld) en juistheid (hoeveel waarden kloppen tegen de bron) —
precies zoals de opdracht al voorschrijft. Ronde 1 en 2 raken 19 van de 28 merken die op deze
cases per constructie onmeetbaar zijn; dat hoort per ronde hardop vastgesteld, niet weggemoffeld
in een zwakkere meting.

## Blokkade 4 — publiceren duurt uren, en de reparatie is gemeten

De opdracht zegt: fix dit vóór je 28 merken draait. Ik heb het nagemeten in plaats van het over te
nemen (`scripts/meet-latentie.ts`, `scripts/meet-bundeling.ts`, beide op de branch).

**De latentie klopt.** Kale round-trip `select 1`: **151,8 ms**. Eén product op `id` selecteren:
**135,4 ms**. Het overgenomen cijfer van 139 ms is dus juist.

**De vorm klopt ook.** `publishRun` doet per product één `select` ([:415](lib/repo/enrichment.ts:415)),
één `update products` ([:440](lib/repo/enrichment.ts:440)) en één `update enrichment_items`
([:441](lib/repo/enrichment.ts:441)) — drie losse round-trips over de HTTP-driver, geen transactie.

**De reparatie is gemeten, niet geschat.** Op 500 echte Serien-producten:

| | huidige vorm | gebundeld | winst |
|---|---|---|---|
| select | 131 ms/product (100× los) | 1,86 ms/product (1× `inArray` over 500) | **70×** |
| update | 133 ms/product (100× los) | 0,59 ms/product (1× `UPDATE … FROM (VALUES …)` over 500) | **226×** |

Doorgerekend op de 150.633 veldvullingen over 106.691 producten die ronde 3 catalogusbreed
oplevert: **12,6 uur → 6,5 minuten**. Voor XAL's 13.407 CRI-voorstellen: 90 minuten → seconden.
Het overgenomen "ruim 40 uur voor 28 merken" is dus eerder ~13 uur, maar de conclusie verandert
niet.

Drie dingen die bij deze ingreep horen en die geen van de voorgangers noemt:

- **`rematchBrandLines` is niet het probleem.** Gemeten: er zijn 204 `spec_lines` in totaal,
  waarvan 109 blauw/open. De hermatch-lus is dus ~109 round-trips, geen uren. Optimaliseren is
  hier onnodig — belangrijk om te weten, want het is de verleiding.
- **De ingreep raakt code die naar PRODUCTIE schrijft** en `publishRun` is onomkeerbaar. De
  precedent-bug in dezelfde functie (bulk-insert boven 1.000 rijen faalde stil) laat zien dat deze
  pijplijn nooit op schaal gedraaid heeft.
- **Bundelen maakt bug 1 uit het Serien-plan erger, niet kleiner.** Vandaag breekt een cel
  `"OHNE LM"` op een `numeric`-kolom de lus halverwege af — vervelend, maar de schade stopt daar.
  In één `UPDATE … FROM (VALUES …)` over 500 rijen faalt de héle bundel op één slechte waarde, dus
  óf je verliest 500 goede updates, óf je splitst en bent de winst kwijt. De validerende
  normalisator (`supplier-cell.ts`) en de `Number.isFinite`-toets in `toColumnValue` zijn daarmee
  **voorwaarde vóór** het bundelen, niet erna.

## Blokkade 5 — de twee bronnen spreken elkaar tegen over Muuto

Dit is de scherpste inhoudelijke tegenspraak in de opdracht en hij kan niet met een meting worden
opgelost, want beide kanten hebben gelijk over iets anders.

- **`docs/zwerm-kolomonderzoek-28-merken.json`, `stap1Klaar`** zet Muuto's
  `BULB SPECIFICATION - KELVIN` (20 bruikbare rijen), `- WATT` (10) en `- LUMEN` (11) op
  `gaatOverArmatuur: true` — klaar voor ronde 1, zonder bewerking.
- **`lib/enrichment/supplier-columns.ts`** zet exact diezelfde drie kolommen op
  `beschrijft: "lichtbron"`, `veld: null`, met als bewijs de kolomnaam zelf en het bestaan van
  `BULB INCLUDED`, `CHANGEABLE BULB` en `BULB RECCOMENDADTION - LAMP BASE` in dezelfde tabel:
  *"Nooit naar products.kelvin."*

De opdracht kiest impliciet de eerste kant — Muuto's wattagekolom is er hét voorbeeld dat de oude
grens willekeurig was. Dat argument klopt: dat de ene 8 W-lamp `"8"` heet en de andere `"8W"` is
typografie, geen risico. **Maar de grens die de opdracht zelf trekt is een andere**: "zeker weten
betekent, met data onderbouwd, dat de kolom het ARMATUUR beschrijft, niet een lamp." En een kolom
die letterlijk `BULB SPECIFICATION` heet in een tabel met een `CHANGEABLE BULB`-kolom is precies
het geval waar dat criterium op ziet.

Het Serien-spoor heeft de methode om dit te beslechten en die is niet duur: kruistabelleer de
kolom tegen de lichtbron-kolom. Bij Serien was dat beslissend — alle 1.283 schone kelvinwaarden
stonden op een `Leuchtmittel = 'LED'`-rij, en géén van de 114 rijen met een verwisselbare fitting
had er een. Muuto heeft met `CHANGEABLE BULB` de tegenhanger. **Die kruistabel vergt Supabase**
(blokkade 1) en is dus niet vandaag te draaien, maar hij is de beslisser — niet een oordeel van
mij of van de zwerm.

Zolang hij niet gedraaid is, staat dit op een **decisie van Timo**, en het is er één die verder
reikt dan Muuto: het bepaalt of "ronde 1" over typografie gaat (dan mogen de BULB-kolommen mee) of
over herkomst (dan niet). Het aantal is klein — 41 waarden — maar het precedent geldt voor alle
158 kolommen in `stap2Wachtrij`.

Twee ingangen in `stap1Klaar` verdienen om dezelfde reden een eigen toets vóór ronde 1:

- **`Prado.driver → dimmable`, 1.980 rijen.** Een kolom die `driver` heet, kan het dimprotocol
  dragen óf het drivertype. Dat verschil is niet uit de naam te lezen en Prado is met 7.321
  producten geen kleintje.
- **`northern."IP code" → ip_value`, 282 rijen** op een merk waarvan maar 309 van de 838 bronrijen
  koppelen (36,9 %). De koppeling zelf is hier de zwakke schakel, niet de kolom.

## Ronde 3 staat er los van — en heeft drie eigen gemeten defecten

Ronde 3 (de naam-route) raakt Supabase niet en is vandaag volledig te draaien. Ik heb hem
opnieuw gemeten op de branch met de échte `parseProductName` over de échte productnamen
(`scripts/meet-naamroute.ts`), tegen de kolommen zoals ze **nu** gevuld zijn — dus wat
`publishRun` er werkelijk nog bij zou zetten:

**150.633 veldvullingen op lege kolommen, over 106.691 producten (50,5 % van de catalogus).**

Dat is lager dan de 157.676 uit het Serien-plan, en dat verschil is verklaarbaar en gezond: die
meting liep over `data/source/brink_products.csv`, waar XAL's kolommen nog leeg waren. Inmiddels
draagt XAL 10.216 verrijkte producten, dus daar valt minder te winnen (9.807 in plaats van
16.856). Mijn getal is de actuele restopbrengst.

De vijf grootste posten: Lombardo 64.558 · Prado 23.432 · Wever & Ducré 21.936 · Kreon 11.944 ·
XAL 9.807. Alleen Lombardo's `maxWattage` (59.623) is groter dan het hele Prado-spoor.

**En dan de drie defecten, alle drie zelf nagemeten met de echte parser
(`scripts/meet-parserdefecten.ts`):**

| defect | gemeten | gevolg |
|---|---|---|
| kelvin geschreven als `2.7K` | **26.625 namen** (Lombardo 26.617) — de parser leest er **0** | `KELVIN_RE` eist `\d{3,5}` ([parser.ts:43](lib/enrichment/parser.ts:43)). De grootste enkele kelvin-winst in de catalogus zit achter één regex. |
| naam zegt letterlijk niet-dimbaar | **4.222 namen** — **3.359** krijgen tóch een `dimmable`-voorstel | Dit is geen ontbrekende maar een **omgekeerde** waarde ([parser.ts:120](lib/enrichment/parser.ts:120)). |
| naam is zelf een driver/converter/trafo | zie de correctie hieronder — **niet 3.106 maar ~158** | Val 2 op de naam-route: het vermogen van de driver wordt het vermogen van het armatuur. |

Defect 2 is een **verkeerd feit**, geen gat, en `publishRun` is onomkeerbaar. Het moet vóór ronde 3
dicht. Defect 1 is puur winst en verandert ook de aanvraagkant, want `parseProductName` voedt óók
`lib/pdf/armaturenboek.ts` — die reparatie verdient een eigen meting.

### Correctie op defect 3 — mijn eerste getal was een bovengrens, geen meting

Plan-agent A betwistte het en had gelijk in de richting. Hertelling
(`scripts/meet-driver-echt.ts`, `scripts/meet-defecten-scherp.ts`), nu met het onderscheid dat
telt — **landt het voorstel** (lege kolom) en **ís het product werkelijk een driver**:

| | aantal |
|---|---|
| namen met een driverwoord (mijn brede regex) | 4.018 |
| daarvan met een `maxWattage`-voorstel | 3.106 |
| daarvan dat werkelijk zou **landen** op een lege kolom | **924** |
| daarvan waar het product **zelf een driver is** (`DRIVER LCA 100W 24V DALI`) | **158** |
| namen die de driver alleen **noemen** (`Esprit floor, driver incl., carrara`) | 1.806 |

De 3.106 uit mijn eerste versie telde voorstellen die grotendeels op een al gevulde kolom vielen,
én rekende module-armaturen mee die de driver alleen vermelden. De echte schade is **158 tot
924** — twee ordes kleiner. Dat verandert niets aan het besluit (een verkeerd vermogen blijft
verkeerd en de publish is onomkeerbaar), maar wel aan de urgentie én aan de vorm van de
reparatie: een kale `\bdriver\b`-guard zou 1.806 gewone armaturen hun wattage afnemen. De guard
moet **verankerd** zijn (`^DRIVER`, `^LED driver`) en alleen `maxWattage` onderdrukken.

Defect 2 heeft die correctie **niet** nodig — hertelling met dezelfde maatstaf: 4.222 namen,
3.359 voorstellen, **3.348 landen**. En strikt op `NON DIM`: 3.174 namen, **3.164 landen**.

**Ieder getal dat met een woordregex over productnamen wordt geproduceerd, is een bovengrens.**
Dat geldt voor de mijne en voor die van de agents; het hoort in elk runrapport te staan.

## De drie ronden, en waar de opdracht-grens knelt

De opdracht verlegt de grens van "geen bewerking nodig" naar "weten we zeker waar de kolom over
gaat". Dat is de goede as en het bewijs eronder (Muuto's 10 van 152) klopt. Twee gevolgen die de
opdracht niet uitspreekt en die het plan moeten sturen:

1. **Ronde 1 wordt daarmee grotendeels ronde 2.** Van de 11 `stap1Klaar`-kolommen zijn er 3
   Muuto-BULB (betwist, blokkade 5), 1 Prado-`driver` (betwist), 1 Northern-`IP code` (zwakke
   koppeling) en 4 Serien. Blijven over: `nordlux.Lumen` (312) en `tossb.LUMEN` (803). Wat er
   wérkelijk bij komt door de grens te verleggen, zit in `stap2Wachtrij` — en dat zijn 158
   kolommen die vrijwel allemaal uit één vrijetekstveld komen (`Description`, `DESCRIZIONE`,
   `Omschrijving`, `Item Desc.50NL`). Dat is geen kolomroute meer maar een tweede naam-route op een
   ander veld, met dezelfde drie defecten.
2. **De normalisatoren die er zijn, dekken vijf velden en nul vrije tekst.** `supplier-cell.ts`
   heeft `klasseerKelvin/Cri/Ip/Watt/Dimprotocol` — allemaal geschreven voor een cel die één
   waarde draagt. Geen daarvan kan `"2700K - CRI90+"` uit Prado's `lightcolour` uit elkaar halen,
   en geen daarvan kent `lumenOutput` of `beamAngle`. Dat is echt bouwwerk, geen configuratie.

## De volgorde is geen smaakkwestie: de eerste bron claimt de kolom permanent

`publishRun` vult uitsluitend lege kolommen ([enrichment.ts:429](lib/repo/enrichment.ts:429)) en is
onomkeerbaar. Wie het eerst schrijft, sluit elke latere bron voorgoed uit. Ik heb daarom de twee
routes naast elkaar gelegd per merk × veld (`scripts/meet-overlap-bronnen.ts`): de naam-route zelf
gemeten op de branch, de kolomroute overgenomen uit `stap1Klaar`.

| merk | veld | kolomroute | naam-route | uitkomst |
|---|---|---|---|---|
| Serien | ipValue | 1.886 | 12 | kolom is 157× groter |
| Serien | kelvin / maxWattage / dimmable | 1.283 / 1.400 / 1.193 | 0 / 0 / 0 | geen conflict |
| TossB | lumenOutput | 803 | 9 | kolom is 89× groter |
| Nordlux | lumenOutput | 312 | 6 | kolom is 52× groter |
| Northern | ipValue | 282 | 0 | geen conflict |
| Muuto | kelvin / maxWattage / lumenOutput | 20 / 10 / 11 | 0 / 0 / 0 | geen conflict (maar betwist, zie blokkade 5) |
| **Prado** | **dimmable** | **1.980** | **2.448** | **naam is groter — en de kolom heet `driver`** |

En dan de kant die zwaarder weegt: van de 150.633 veldvullingen die de naam-route klaarzet, is er
**bijna geen enkele die niet óók door een kolomroute geclaimd wordt.** Gemeten: het enige merk waar
de naam-route de énige bron is, is **Lumiance** (105 producten, 254 vullingen) — en dat merk heeft
helemaal geen rauwe tabel. Alle grote posten — Lombardo's 59.623 wattages, Kreon's 11.587 CRI's,
Wever & Ducré's 21.936 — staan óók in `stap2Wachtrij`.

Ronde 3 eerst draaien betekent dus: 150.633 kolommen permanent vullen met de zwakkere van twee
bronnen, waarvan er 3.359 een omgekeerde dimbaarheid en 3.106 een driververmogen dragen.

## Maar "ronde 2" is grotendeels geen kolomroute — het is de naam-route op een ander tekstveld

Dit ondergraaft de driedeling van de opdracht en het is met tellen vast te stellen. Van de **158**
ingangen in `stap2Wachtrij` wijst het merendeel niet naar een spec-kolom maar naar een vrij
tekstveld — `PRODUCT NAME`, `Description`, `DESCRIZIONE`, `Omschrijving`, `Item Desc.50NL`,
`Article name`, `name`, `Beschreibung`:

- **114 van de 158** komen uit een vrij tekstveld;
- **44** uit een echte spec-kolom — en daarvan zijn er ~11 expliciete niet-ingangen
  (`(geen kolom)`, `geen`, `n.v.t.`, `geen (valstrik)`, `kreon.EUR`, `xal.Weight / Tariff Nr.`).

Er blijven dus ruwweg **33 echte spec-kolommen** over, verspreid over een stuk of tien merken:
`serien` (4), `leucos` (9, maar over drie LED-modulekolommen), `valerie` (4), `northern` (5),
`Prado` (4), `muuto` (1), `andtradition` (1), `Egoluce` (1), `estiluz` (1), `sylvania` (1),
`tal` (1), `tossb` (1).

Wat dat betekent voor het plan: ronde 2 en ronde 3 zijn voor 114 van de 158 ingangen **dezelfde
machinerie op een andere invoer**, niet twee onafhankelijke bronnen. Ze delen dus ook de drie
gemeten parserdefecten. Een plan dat ronde 2 als "kolomroute met bewerking" behandelt en ronde 3
als "naam-route", beschrijft de werkelijkheid niet — en dat verschil bepaalt of je één normalisator
bouwt of twee.

## Wat de matcher toestaat — zelf nagelezen, want het begrenst elke normalisatie

De normalisatieregels mogen niet strenger of losser zijn dan het oordeel dat erop volgt. Nagelezen
in `lib/matching/tolerances.ts`:

| veld | oordeel | wat dat toestaat |
|---|---|---|
| `judgeKelvin` | `delivered === requested` — **exact** | een bereik platslaan naar een representant is actief schadelijk: een bestek dat 4000 vraagt krijgt **rood** op een product dat 4000 aantoonbaar kan leveren |
| `judgeCri` | `delivered >= requested` | `">97"` → 97 is semantisch sound; de ondergrens gaat door een ondergrens-toets |
| `judgeIp` | `got >= req` | een hogere IP is groen. Let op: `parseIp` plukt met `/(\d{2})/` het eerste tweetal uit wíllekeurige tekst — een kolomverwisseling faalt hier stil, niet luid |
| `judgeDimmable` | substring in **beide** richtingen na strippen | `"DALI 2CH + CASAMBI"` geeft groen op een DALI-vraag: samengestelde protocollen doorgeven is correct, niet slordig. En `"ON/OFF"` zou als "ander protocol" **geel** worden gelezen in plaats van "kan niet dimmen" — daarom moet die cel zwijgen |
| `judgeBeamAngle` | ±10° groen, ±25° geel, daarboven rood | **een band, anders dan kelvin** |

Die laatste regel is een verschil dat geen van de voorgangersdocumenten noemt en dat er voor
ronde 2 toe doet: **bundelhoek verdraagt wél een representant en kleurtemperatuur niet.** Een
`beamangle`-cel `"25-35"` mag als 30 landen (afwijking 5°, binnen groen); een `CCT K`-cel
`"2200-5000"` mag dat nooit. De "bereik"-uitkomst in `supplier-cell.ts` hoort dus per veld te
verschillen, niet uniform te zwijgen.

Verder nagelezen: `UNCONFIRMED_TIER2_SOURCES` bevat alleen `"optic-code"`
([engine.ts:197](lib/matching/engine.ts:197)). Een `supplier-column:*`-label hoort daar níét in —
staat het er wel in, dan kan geen enkel veld uit de kolomroute groen worden.

## ✅ Blokkade 1 opgeheven (30 jul, later) — en drie vragen zijn nu gemeten in plaats van beoordeeld

Er kwam alsnog read-only Supabase-toegang op `uvmeytxejlzvdgjgthmr` ("Brink licht"). De 28 rauwe
tabellen staan er, met de kolomaantallen die het zwerm-onderzoek noemt (Valerie 116, Sylvania 73,
Northern 70, Muuto 68 … Kreon 5, Brick in the Wall 5). Daarmee vervallen de metingen hieronder als
"overgenomen".

### 1. De vijf verdachte koppelingen: het zijn dubbele sleutels, geen merk-overschrijding

De verdenking uit dit doc was terecht en de uitkomst is precies te maken. `count(distinct sleutel)`
per rauwe tabel valt **exact samen met mijn onafhankelijk gemeten catalogusteller**:

| merk | rauwe rijen | distincte sleutels | producten in catalogus | dubbele sleutels |
|---|---|---|---|---|
| flos | 19.872 | **18.263** | 18.263 ✓ | 1.609 |
| marset | 2.172 | **1.723** | 1.723 ✓ | 449 |
| lombardo | 65.360 | **65.096** | 65.096 ✓ | 264 |
| artemide | 10.281 | 10.259 | 10.258 (−1) | 22 |
| sylvania | 4.020 | 4.019 | 3.914 (−105) | 1 |

Geen enkele bronrij landt dus op een product van een ánder merk — faalvorm 2 valt af. Blijft
faalvorm 1: welke van twee rijen met dezelfde sleutel wint? Dat is alleen schadelijk als ze het
oneens zijn, en dat is gemeten:

| merk | dubbele sleutels | betrokken rijen | **sleutels waar de brontekst verschilt** |
|---|---|---|---|
| flos | 1.470 | 3.079 | **0** |
| lombardo | 264 | 528 | **0** |
| marset | 214 | 663 | **9** |

Flos en Lombardo dragen bij élke dubbele sleutel identieke tekst — meervoudige sheet-imports van
dezelfde regel, onschadelijk. **Het hele risico is negen Marset-sleutels.** De overzetting krijgt
een dedup-stap en die negen komen met naam en al in het runrapport; ze worden niet stilzwijgend
door een `distinct` opgeslokt.

### 2. Muuto: Timo's kritiek is gemeten en klopt — met een factor tien

De tegenspraak uit blokkade 5 lost op zodra je de vraag per **rij** stelt in plaats van per kolom.
De geïntegreerde-LED-populatie (`LAMP BASE = '-'` én `BULB INCLUDED = 'Yes'`) is **152 rijen**;
daarnaast staan 28 rijen met een verwisselbare fitting mét lamp, die eruit horen.

| veld | kale waarde (de ronde-1-grens: typografie) | mét waarde (na eenheid strippen) | factor |
|---|---|---|---|
| wattage | **10** | **146** | 14,6× |
| kelvin | **20** | **152** | 7,6× |
| lumen | **11** | **137** | 12,5× |

**41 waarden onder de typografische grens, 435 onder de betekenisgrens.** Precies het bezwaar dat
de opdracht maakt — Tip Table krijgt zijn 8 en Leaf Table blijft leeg omdat er `8W` staat — nu met
een getal erbij. En het antwoord is niet "zet de BULB-kolom in ronde 1": dat houdt juist die 10 van
de 146 en laat de willekeur staan. Het antwoord is een **rijfilter plus normalisator in ronde 2**,
en dan vullen alle 146 consistent.

Daarmee hebben `supplier-columns.ts` en het zwerm-onderzoek allebei gelijk over iets anders: de
kolom als geheel beschrijft de lamp (`supplier-columns.ts`), en 152 rijen ervan beschrijven het
armatuur (de zwerm). `KolomToewijzing` kan dat vandaag niet uitdrukken — het heeft één boolean
`alleenGeintegreerdeLed` en dat is een Serien-specifiek predikaat. Dat veld moet een **benoemd,
gecureerd rijfilter** worden.

### 3. `stap1Klaar` is geen ronde-1-lijst — de zwerm zegt dat zelf

Ik heb de `kanttekening`-velden gelezen die in de samenvatting niet meekomen. Vier van de elf
ingangen dragen daarin een **gemeten defect tegen hun eigen voorstel**:

| ingang | wat de zwerm er zelf bij schrijft |
|---|---|
| `serien.Schutzart` (1.886) | **89 rijen zijn geen armatuur** — 56 met een expliciete accessoirenaam (optiek, baldakijn, reflektor, front). Op zo'n frontplaat wordt `ip_value` de énige spec. |
| `serien.Regelung` (1.193) | **42 van de 1.193 beschrijven het retrofit-peertje**, niet het armatuur (TRIAC op G9/R7S/GU10/E27/B15D). |
| `tossb.LUMEN` (803) | **12 rijen zijn per lichtbron, niet totaal** — bij de DICE-familie is de `6x`-multiplier weggevallen. |
| `muuto.BULB …` (41) | *"geselecteerd op TYPOGRAFIE, niet op betekenis"* — de zwerm schrijft het letterlijk op. |

Een lijst die "stap 1 klaar" heet en waarvan vier ingangen een eigen tegenbewijs dragen, is geen
werklijst maar een leeslijst. **Ronde 1 moet uit de export opnieuw worden opgebouwd**, met het
rijfilter als eerstelijnsinstrument.

## Wat er beslist moet worden vóór er iets gebouwd wordt

1. **Supabase-toegang** (blokkade 1). Zonder dit zijn ronde 1 en 2 dood. Als hij er komt: éérst
   een export per merk naar een bestand mét hash, vóór er ook maar één voorstel gemaakt wordt —
   het Serien-plan eist dat al, en het is nu al één keer misgegaan doordat die export niet bewaard
   bleef.
2. **De volgorde van de drie ronden versus de blokkades.** Ronde 3 kan vandaag, ronde 1 en 2 niet.
   Wachten tot alles kan, of ronde 3 naar voren halen? Ronde 3 vult óók kolommen, en
   `publishRun` vult alleen lege kolommen — wie eerst gaat, wint. Dat is een besluit met gevolgen,
   geen volgordekwestie.
3. **Muuto's BULB-kolommen** (blokkade 5): typografie-grens of herkomst-grens?
4. **De prestatie-ingreep**: bundelen mag pas ná de validerende normalisator, want een bundel
   faalt op één slechte waarde. Bevestigen dat die volgorde akkoord is.
5. **De vijf merken waar `koppelTreffers` de productenteller overschrijdt** moeten opnieuw gemeten
   worden mét een merkfilter op de join, vóór ze in welke ronde dan ook meegaan.
6. **Blokkade 2**: wanneer landen `claude/optimistic-wing-334c41` en de losse commit `9ba288f` op
   `main`? Zolang `9ba288f` aan geen branchnaam hangt, is dat werk één `git gc` van verdwenen.
