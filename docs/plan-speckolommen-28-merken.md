# Plan: spec-kolommen van 28 merken naar de catalogus

> Fase 2 (plan na sparren), 30 jul 2026. Twee plan-agents met tegengestelde uitgangsposities
> ("leverbaar nu" vs "poort eerst") lazen onafhankelijk hetzelfde probleemdoc en dezelfde code.
> Beide leverden leesverantwoording. Wat hieronder als **gemeten** staat, heb ik zelf nagerekend —
> op de Neon-branch achter `scripts/branch-guard.ts` en, sinds blokkade 1 viel, read-only op
> Supabase `uvmeytxejlzvdgjgthmr`. Probleemdoc: `docs/probleem-speckolommen-28-merken.md`.

## Waar de agents het onverwacht eens werden

Ze begonnen tegenovergesteld en kwamen samen uit op één punt, elk via zijn eigen meting:

**De volgordevraag gaat over één merk.** Agent B ging in met "ronde 3 eerst is het gevaarlijkst
wat je kunt doen — alle 150.633 vullingen worden ook door een kolomroute geclaimd" en mat toen
zijn eigen positie kapot: **118.876 van die claims (78,9 %) staat op een omschrijvingskolom** —
dezelfde parser-machinerie op een andere invoer, met dezelfde drie defecten. Bij Kreon is de
"concurrerende kolom" letterlijk `name`. Na aftrek van twee door de zwerm zélf ongeldig verklaarde
claims (Sylvania's `Energy Class → max_wattage`, TossB's `BULB`) blijft er één merk over waar de
kolomroute aantoonbaar beter is: **Prado, 23.392 vullingen, 15,5 %**.

Dat B dit zelf opschrijft, is het sterkste resultaat van de ronde. Het maakt A's "haal ronde 3 naar
voren" juist voor 84,5 % van het volume, en B's "bevries wat de kolomroute beter doet" juist voor
de rest. Ze sluiten elkaar niet uit.

## Wat er al staat (gebouwd en getest, 30 jul)

**De bundeling.** `publishRun` deed per product drie round-trips; gemeten 135–152 ms elk, dus
12,6 uur voor de hele catalogus. Nu één select plus één `UPDATE … FROM (VALUES …)` per blok van
500. Twee dingen worden er veiliger van, niet alleen sneller:

- **"nooit overschrijven" wordt door de database afgedwongen** —
  `coalesce(nullif(p.kolom,''), v.kolom)` in plaats van een geheugentoets die eerst leest en daarna
  schrijft. Dat leesvenster is precies waar een live-write op productie verloren gaat.
- **`tier2_source` krijgt per veld dezelfde voorwaarde als de vulling**, dus een veld dat niet
  landt krijgt geen herkomststempel. En `applied` telt wat de database teruggeeft, niet wat wij van
  plan waren.

Daarbij hoort de reparatie die agent B als V4 opvoerde: `toColumnValue` weigert niet-eindige
waarden op de `numeric`-kolommen (`maxWattage`, `beamAngle`). Die zit in dezelfde commit — de
bundeling is dus niet vóór maar mét de validator gebouwd.

**De prijs van bundelen, gemeten in plaats van geschat.** B's bezwaar is juist van vorm: één
slechte waarde doodt 500 goede updates. Gemeten (`scripts/meet-typerisico.ts`) op alle 150.633
landende ronde-3-voorstellen, getoetst tegen de échte kolomtypes en onder de óude
string-passthrough: **0 zouden breken.** De grootste waarden zitten ver binnen de grenzen —
maxWattage 3.000 tegen `numeric(8,2)` (max 999.999,99), beamAngle 360 tegen `numeric(6,2)`. De
naam-parser levert per constructie een getal binnen een bereik. Voor de kolomroute is het risico
wél reëel (`"OHNE LM"`), en daar vangt V4 het af.

## Het spoor

### Ronde 0 — de poort, nu
Vier ingrepen. Twee ervan zijn geen bouwwerk maar een kabel.

| | wat | waarom voorwaarde | omvang |
|---|---|---|---|
| P1 | `NON DIM` in `parseDimmable` | **3.164 landende producten** krijgen `DIM` terwijl de naam het tegendeel zegt. `judgeDimmable` doet substring in beide richtingen, dus een bestek dat "DIM" vraagt krijgt **groen** op een niet-dimbaar armatuur. Verkeerd feit, onomkeerbaar. | klein, eigen nul-/nameting (raakt de aanvraagkant) |
| P2 | `verdenking.ts` aansluiten | 201 regels getest bestaan, **aangeroepen door nul productiepaden** (zelf gegrepen: alleen `scripts/meet-verdenking.ts:75`). 17.535 landende voorstellen zijn al te vlaggen en de pijplijn kijkt er niet naar. | een kabel |
| P3 | drempel op `sampleErrorRate` | `errorRate` wordt berekend (`:629`), weggeschreven (`:650`) en gelogd (`:669`) — en **nergens afgedwongen**. 40 fouten op 100 blokkeren 40 rijen en laten de overige 150.533 ongecontroleerde voorstellen door. De poort is een telling, geen oordeel. | ~10 regels |
| P4 | `revertRun` | `enrichment_items` draagt `productId`, `field`, `value`, `source`, `applied`; `publishRun` stempelt `tier2_source[field]`. Een precieze terugdraai is dus mogelijk mits kolomwaarde én stempel nog overeenkomen. **"Onomkeerbaar" is een eigenschap van de code, niet van de data** — en élke volgordebeslissing hangt aan die aanname. | ~40 regels, geen migratie |

P4 heeft een tegenargument dat B zelf noemt en dat ik overneem: een terugdraaiknop kan de
zorgvuldigheid vóór het publiceren verlagen ("keur alles goed, we draaien het wel terug"). P3 is
het tegenwicht — een run die de drempel raakt wordt weggestuurd, zodat terugdraaien nooit het
goedkoopste pad is.

### Ronde 3 — per merk × veld, in gemeten risicovolgorde
Niet per merk maar per **veld**, want het risico zit in het veld:

| # | veld | landt | verdacht | reden |
|---|---|---|---|---|
| 1 | `cri` | 30.382 | 12,9 % | `judgeCri` is `delivered >= requested` — te laag is conservatief, nooit vals groen |
| 2 | `maxWattage` | 71.883 | **2,6 %** | laagste verdenking, grootste volume — ná P2 |
| 3 | `lumenOutput` | 2.686 | 8,9 % | klein, ruime tolerantie |
| 4 | `ipValue` | 1.456 | 15,2 % | klein; fout is hard maar P2 sluit onbekende klassen uit |
| 5 | `kelvin` | 15.115 | 20,4 % | `judgeKelvin` is exacte gelijkheid — elke fout is direct rood |
| 6 | `beamAngle` | 8.224 | **30,6 %** | hoogste verdenking |
| 7 | `dimmable` | 20.887 | 27,4 % | **verboden tot P1 er is** |

**Repetitie eerst:** Flos Architectural (1.824 vullingen, alle zeven velden op 0, geen geldige
kolomclaim) — klein genoeg om volledig door de zwerm te halen. Daarna Wever & Ducré (21.936) als
schaalproef.

**Bevroren tot de kolomroute beoordeeld is:** Prado's kelvin/cri/beamAngle/dimmable (23.392).
Prado is het enige merk waar beide routes over hetzelfde veld iets zeggen, en dus de enige
onafhankelijke kruiscontrole die dit project heeft. Prado's `maxWattage` (29) en `ipValue` (11)
worden door geen kolom geclaimd en mogen wél mee. Ook bevroren: TossB's `lumenOutput` (9 tegen 803).

**Aparte run, eigen meting:** Lombardo's `2.7K` — 26.625 namen, de parser leest er 0. Grootste
enkele kelvinwinst in de catalogus, achter één regex. Raakt de aanvraagkant, dus eerst een
nul-/nameting-paar.

### Ronde 1 en 2 — opnieuw opbouwen uit de export
`stap1Klaar` is geen werklijst: vier van de elf ingangen dragen in hun eigen kanttekening een
gemeten defect. Harde eerste stap blijft de **export per merk naar een bestand mét hash**, vóór er
één voorstel gemaakt wordt — die eis staat al in het Serien-plan en is één keer misgegaan doordat
de export niet bewaard bleef.

`KolomToewijzing` krijgt een **`rijfilter`** in plaats van de boolean `alleenGeintegreerdeLed`: een
benoemd, gecureerd predikaat met bewijsregel. Muuto wordt dan `LAMP BASE='-' AND BULB
INCLUDED='Yes'` (152 rijen), en met normalisator levert dat 435 waarden in plaats van 41.
Hetzelfde instrument dekt `serien.Schutzart` (89 accessoirerijen), `serien.Regelung` (42 retrofit)
en `tossb.LUMEN` (12 per-bron).

De overzetting krijgt een **dedup-stap** op de bronsleutel, met de negen Marset-sleutels waar de
bron zichzelf tegenspreekt bij naam in het runrapport.

## De zwerm-controle

Overgenomen uit `docs/plan-steekproef-zwerm.md` (de cel — `veld | naamvorm | waarde` — is de juiste
eenheid), met drie aanscherpingen. Agents krijgen een **bestandspad**, nooit data in de prompt, en
**geen databaseverbinding**: schrijft een agent in `sampleVerdict`, dan is `assertSampleReviewed`
automatisch tevreden en publiceert `publishRun` — dat is de doorgeklikte poort, geautomatiseerd.

Vier sloten die voorkomen dat een leeg antwoord als "goedgekeurd" leest:

1. **Geen default, geen null.** `oordeel` is een verplichte enum. Een ontbrekende cel is
   `ontbrekend`, niet `goed`.
2. **Sluitende telling.** Elke `celId` uit het manifest exact één keer terug, plus een kloppende
   `manifestHash`. Ontbreekt er één ⇒ de héle batch ongeldig, niet "de rest is goed".
3. **Geen `goed` zonder citaat.** Elk `goed`-oordeel eist een letterlijke productnaam uit die cel,
   en de verwerker toetst dat die string werkelijk in het manifest staat. **Een agent die niets las
   kan dit niet verzinnen.** Dit is het sterkste slot en het staat in geen bestaand doc.
4. **Vallen: één per 20 cellen, 100 % recall per batch** (een bewezen `NON DIM`-cel). Daarmee is
   "hoeveel regels heb je gelezen" toetsbaar in plaats van zelfgerapporteerd.

`goedgekeurd` vereist positieve bevestiging op alle vier. Alles anders — leeg, ontbrekend, oneens,
ongeldige JSON, hash-mismatch — is `onbeslist`. **Er bestaat geen codepad waarlangs de afwezigheid
van een oordeel tot publiceren leidt.** De zwerm levert bewijs, nooit toestemming: Timo's 100 rijen
blijven de enige sleutel.

## Meten

Twee meetlatten, want de eerste kan dit werk maar deels zien.

1. **`scripts/eval-testset.ts`**, verse parse. Nulmeting staat vast in
   `docs/metingen/nulmeting-branch-28merken.json` (rev `500e4b0`). Gemeten grens: van de 28 merken
   worden er 9 gevraagd, samen 70 regels, waarvan 5 blauw/open. Per ronde hoort hardop in het
   rapport wélke merken per constructie onmeetbaar zijn — anders leest "0 verschil" als "geen
   effect" terwijl het "niet gevraagd" betekent.
2. **Dekking en juistheid**: gevulde cellen per veld per merk (`scripts/meet-bestemming.ts`), en
   het aandeel waarden dat klopt tegen de bron. `getTier2Coverage` alleen is te grof — Kreon heeft
   13.111 van 13.998 producten al met ≥1 veld, dus 11.587 nieuwe cellen bewegen die meter met
   hooguit 887.

## Vangrails, ongewijzigd

Alles eerst op de branch · geen merge terug · geen tweede guard · agents zonder schrijftoegang ·
zwerm-data via een bestand · een productie-run wacht op Timo's **eigen** go per merk, met gelijke
run-vingerafdruk over `(productId, field, value)` plus bron-hash · niet pushen (W4).
