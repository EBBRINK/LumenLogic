# Rapport: CRI-run XAL op de branch (stap 2 + 3)

> 30 jul 2026, branch `enrichment-xal` (`ep-broad-term-atw1a95t`). Productie onaangeraakt.
> Nulmeting, publicatie en nameting alle drie op dezelfde branch, via `scripts/eval-testset.ts`
> met verse parse.

## Wat er gebeurd is

| | |
|---|---|
| steekproef | 100/100 goedgekeurd (Timo), 0 fout |
| kruiscontrole | 10 agents, 200 gelezen regels, 0 fouten, 13× twijfel — alle drie empirisch weerlegd |
| gepubliceerd | **13.407 waarden toegepast** (verwacht 13.407) |
| `cri` bij XAL | 0 → **13.407** |
| hermatcht | **4** spec-regels — exact het aantal blauwe/open XAL-regels dat vooraf gemeten was |
| duur | 91,3 min (geschat 62; de update-query is duurder dan de select waarop de schatting stoelde) |

## Nameting: geen regressie

`scripts/vergelijk-meting.ts` over alle vier cases, 117 regels:

```
raadhuis   0 regel(s) veranderd van 31
kvk        0 regel(s) veranderd van 48
tno        0 regel(s) veranderd van 20   ✓ CONTROLEGROEP INTACT
dordrecht  0 regel(s) veranderd van 18
stops: 0 · te verklaren: 0
```

`raadhuis rang≤50` blijft 4/4, `top-1` blijft 2/4. Geen enkele regel buiten de vier die konden
bewegen is veranderd — de harde stop in het script is niet afgegaan.

Dat de meting betrouwbaar is, staat los vast: de nulmeting is twee keer gedraaid en de `results`
waren zonder de duurvelden byte-identiek. Een verschil kón dus alleen van de vulling komen.

## Maar werkt de vulling wél door?

"Nul verandering" is niet hetzelfde als "de vulling komt aan". De eval-JSON rapporteert alleen
status, rang en top-1; kantelt het CRI-oordeel van `onbekend` naar `groen` zonder de status te
veranderen, dan is dat onzichtbaar. Daarom apart getoetst op de deviations zelf
(`scripts/toets-cri-doorwerking.ts`, hetzelfde matchpad als de eval):

| regel | top-1 kandidaat | cri-kolom | cri-oordeel |
|---|---|---|---|
| Lr301 | SASSO PRO 100 FL ADJ DALI 27W … | leeg | `onbekend` |
| Lr303 | SASSO PRO 100 WF ADJ DALI 26,5W … | leeg | `onbekend` |
| **Lw001** | STRETTA 600 IP44 **CRI90** HPO SURF DALI 13W … | **90** | **`groen`** |
| **Lw002** | STRETTA 900 IP44 **CRI90** HPO SURF DALI 19,5W … | **90** | **`groen`** |

**De vulling werkt aantoonbaar door.** Waar de kandidaat een CRI in de naam draagt, staat de
kolom nu gevuld en beoordeelt de matcher het veld als `groen` in plaats van `onbekend`.

## Waarom de status tóch niet kantelde — drie oorzaken, alle drie verklaard

**1. Bij Lr301/Lr303 dragen de kandidaten zelf geen CRI.** De `SASSO PRO`-serie zet geen
CRI-token in de naam, de gewone `SASSO` wel (`SASSO 60 RD 150 SP CRI90 SUSP …`). De parser kan
niet vullen wat er niet staat, dus die twee regels konden niet profiteren. Dat is geen fout maar
ongelijke naamdekking binnen één merk.

**2. Bij Lw001/Lw002 is CRI niet het laatste gat.** Hun kandidaten hebben nog `lumen: onbekend`
en `beamAngle: onbekend`. Eén onbekend veld houdt de kandidaat uit lijst 1 (`aantoonbaar`), en
`anyGreen` kijkt uitsluitend naar die lijst. De regel kan dus niet groen worden zolang lumen en
beam leeg zijn — hoe correct de CRI ook is.

**3. Rood is niet opgetreden, zoals voorspeld.** Alle vier vragen CRI≥90 en XAL levert 90 of
hoger. Er was geen kandidaat met CRI80 bovenaan.

Dit is exact wat de grill vooraf vastlegde en wat als meetpunt-3-val benoemd is: **vullen maakt
de status eerlijker, niet automatisch groener.** Het succescriterium was correcte data zonder
regressie, niet een regel die van open naar groen springt.

## Waarom de rang niet verschoof

De vierde regressie-categorie (rangverschuiving door ongelijke naamdekking) is niet opgetreden,
en er is een verklaring: binnen elke afzonderlijke kandidatenlijst is de CRI-dekking uniform. Bij
Lr301/Lr303 draagt geen enkele kandidaat een CRI (allemaal term 0), bij Lw001/Lw002 dragen ze hem
allemaal (allemaal +1). Een gelijke opslag voor iedereen verschuift niemand.

Dat is geen garantie voor andere merken — het is een eigenschap van deze vier lijsten. Bij een
merk waar de dekking bínnen een productfamilie uiteenloopt, kan het effect wél optreden.

## Wat dit voor het vervolg betekent

- **Lumen en beam zijn nu de beperkende velden**, niet CRI. Bij XAL levert de parser voor lumen
  nul waarden op (XAL zet nooit `lm` in de naam) en voor beam 1.295, allemaal op reeds gevulde
  kolommen. Die gaten zijn dus níét met naam-parsing te dichten; daar is een andere bron nodig.
- **Dimbaarheid (run 2) vereist eerst de `NON DIM`-fix.** Zonder die fix zouden 2.800 XAL-accessoires
  als dimbaar gepubliceerd worden — de omgekeerde waarde.
- De vier hermatchte regels zijn het volledige onomkeerbare deel van deze operatie.

## Conclusies van het XAL-spoor (overgenomen na verificatie, 30 jul)

Onafhankelijk nagemeten door de sprintmaster: branch `cri` 13.407 met stempel
`{"cri":"parsed-from-name"}` op alle; productie `cri` 0 en verrijkt 0, onaangeraakt.

1. **XAL zit aan zijn naam-plafond.** Na dimbaarheid valt er niets meer uit XAL-namen te halen.
   Lumen en beam zijn de beperkende velden, en XAL zet nooit `lm` in de naam — dat gat vraagt een
   andere bron, geen betere parser.
2. **Ongelijke naamdekking bínnen één merk is een echt verschijnsel.** `SASSO PRO` zet geen CRI in
   de naam, de gewone `SASSO` wel. Dat verklaart waarom Lr301/Lr303 niet konden profiteren, en het
   is een waarschuwing voor elk volgend merk: dekking is geen merk-eigenschap maar een
   serie-eigenschap.
3. **Dat de rang niet verschoof was geluk, geen garantie.** De CRI-dekking was binnen elke
   kandidatenlijst uniform — allemaal 0 of allemaal +1. Bij een merk met gemengde dekking bínnen
   één lijst kan het wél schuiven. De rangcontrole in `scripts/vergelijk-meting.ts` blijft daarom
   staan, ook als hij bij XAL niets vond.

**Waarde van deze run, eerlijk gesteld:** op de vier testcases verandert zichtbaar niets. De winst
is dat een toekomstig boek dat CRI vraagt op een gewone SASSO of een STRETTA nu een echt antwoord
krijgt in plaats van `onbekend`.

## Productie-run (30 jul, na expliciete go van Timo in de chat)

Dezelfde bewerking opnieuw op `ep-hidden-sound-atud2oha` — géén merge van de branch, zelfde
code, nieuwe run `ea7742ef`.

| controle | uitkomst |
|---|---|
| nulmeting op productie zelf | identiek aan de branch-nulmeting → vergelijking geldig |
| steekproef | **exact dezelfde 100 rijen en waarden** als de goedgekeurde branch-steekproef |
| droogloop | 0 gevuld vóór, 13.407 verwacht ná |
| toegepast | **13.407** (verwacht 13.407) |
| hermatcht | 4 spec-regels |
| duur | 90,0 min |
| XAL `cri` ná | 13.407, **alle** met `tier2_source {"cri":"parsed-from-name"}`, 0 zonder |
| globaal `cri` | 13.410 = 13.407 + de 3 die er al stonden → **geen bestaande waarde aangeraakt** |
| nameting | 0 van 117 regels veranderd; tno stil; rang≤50 4/4, top-1 2/4 |
| doorwerking | Lw001/Lw002 `cri onbekend → groen`; Lr301/Lr303 blijven `onbekend` (SASSO PRO draagt geen CRI) |

Productie gedraagt zich dus exact als de branch — de repetitie was een geldige voorspelling.

### De poort passeren zonder hem te breken

De guard staat fail-closed op `LUMENLOGIC_DB=branch`. Voor deze run is een tweede, expliciet
benoemde modus toegevoegd (`--productie`) met omgekeerde eisen: de bedoeling moet in het commando
staan, de endpoint **moet** gelijk zijn aan die in `.env.local`, de branch-marker mag níét gezet
zijn, en zonder leesbare `.env.local` is er geen doorgang. Bewust niet gedaan: de marker in
`.env.local` zetten of de marker-eis optioneel maken — beide maken de poort permanent stuk in
plaats van hem één keer bewust te passeren. Zes tests erbij, 17 totaal.

### Eén valse zekerheid onderweg

De eerste vergelijking van de productie-steekproef met de branch-steekproef meldde `IDENTIEK`
terwijl **beide bestanden leeg waren**: de uitdraai was mislukt omdat de `--productie`-vlag
ontbrak, en `diff` op twee lege bestanden meldt gelijkheid. Er staat nu een telling voor die aan
beide kanten op 100 moet uitkomen vóór het oordeel telt. Precies de faalvorm die dit spoor
elders al beschreef: een leeg antwoord leest als goedkeuring.

## Terugdraaien, mocht het nodig zijn

Niet uitgevoerd, wel uitgeschreven. De kolommen terugzetten is één UPDATE
(`set cri = null where tier2_source->>'cri' = 'parsed-from-name'`), verliesloos omdat `publishRun`
nooit overschrijft. De hermatch raakt vier regels. Op deze branch is "Reset from parent" sowieso
de eenvoudigste weg terug.
