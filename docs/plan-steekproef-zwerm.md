# Plan: de steekproefcontrole als agent-zwerm

> Fase 2, 30 jul 2026. Volgt op `docs/probleem-steekproef-zwerm.md`. Twee plan-agents met
> tegengestelde uitgangsposities (A: filter leidend, zwerm chirurgisch · B: een filter vangt
> alleen wat de schrijver bedacht, dus breed lezen) hebben gespard. Hun dragende cijfers zijn
> onafhankelijk nagemeten vóór ze in dit plan landen; twee claims zijn bevestigd, één is
> bijgesteld.

## Wat het sparren heeft opgelost

De twee posities zijn niet in het midden geëindigd maar op twee verschillende plekken in de
keten — en dat is de uitkomst.

**A's reparatie-eerst wint vóór de zwerm.** Van de 18.123 verdenkingen is het grootste deel geen
beoordelingsvraag maar een codefout of een te grove regel. Wat A's uitsplitsing zichtbaar maakte:
72 % van alle verdenkingen (13.036) is `accessoire-context`, en 3.376 zijn `NON DIM`. Die door
agents laten bevestigen kost taken en levert niets — ze moeten **gerepareerd** worden.

**B's celeenheid wint ín de zwerm.** Zijn voorstel: niet de rij en niet de naamvorm als eenheid,
maar de **cel** — `veld | naamvorm | waarde`. Dat zet de waarde terug in de sleutel en lost
daarmee precies het bezwaar op waarop groepsverwerping in het vorige plan sneuvelde (`nameShape`
maakt van elk cijfer een `#`, dus juist de beoordeelde waarde viel eruit). Nagemeten en exact
gereproduceerd:

| eenheid | alle merken | aandeel |
|---|---|---|
| landende voorstellen (rijen) | 157.682 | — |
| naamvormen (`veld\|vorm`) | 29.879 | |
| **cellen (`veld\|vorm\|waarde`)** | **41.130** | factor 3,8 compressie |
| cellen met ≥1 verdenking | 6.806 | 16,5 % |
| cellen met n=1 (de staart) | 13.449 | 32,7 % van de cellen, 8,5 % van het volume |

Distinct waarden per veld, over de hele catalogus: kelvin 14 · dimmable 6 · cri 8 · ipValue 9 ·
beamAngle 35 · maxWattage 231 · lumenOutput 389. Bij de eerste vier velden is de waardenruimte
zó klein dat één agentpas hem volledig sluit; bij lumen en wattage is vrijwel elk getal uniek en
valt er niets te groeperen.

## De beslissingen

### 1. Repareren gaat vóór beoordelen

Drie ingrepen, allemaal deterministisch en testbaar. Ze halen het leeuwendeel van de verdenkingen
weg vóór er één agent draait.

**R1 — `NON DIM` in de parser.** `parseDimmable` geeft `DIM` terug voor een naam die letterlijk
zegt dat het product niet dimbaar is (3.376 producten). Dat is geen onzekerheid maar de omgekeerde
waarde. Fix in [parser.ts:120](lib/enrichment/parser.ts:120), met hergebruik van het
`NIET_DIMBAAR`-patroon uit `verdenking.ts` zodat er één waarheid is.

⚠️ Deze fix raakt méér dan de verrijking: `parseProductName` wordt ook door de aanvraagkant
gebruikt ([armaturenboek.ts:131](lib/pdf/armaturenboek.ts:131)), dus een spec-regel die "NON DIM"
vraagt verandert mee. Dat is de bedoeling, maar het moet gemeten worden met de bestaande
nulmeting/nameting vóór en ná.

**R2 — de accessoire-vlag splitsen.** Mijn eigen regel vlagt blind élk gevuld veld zodra de naam
een accessoire-woord bevat. A stelde voor om per veld te filteren op wat een accessoire kán
dragen. Nagemeten blijkt dat óók te grof: het onderscheid zit niet in het veld maar in de
zinsbouw.

```
Side in-line 25-100, … 2700K, CRI 90, 285lm, … 4W, DRIVER EXCL.   ← armatuur; álles hoort erbij
CV Driver 35W 24V IP67                                             ← het product ís de driver
```

Gemeten met beide woordvolgordes (`excl. driver` én `driver excl.` — mijn eerste poging kende
alleen de eerste en zat er 1.400 naast): **2.700 namen noemen een accessoire als bijzin**,
**4.072 namen zijn mogelijk zélf een accessoire**. Alleen die tweede groep is een echte vraag, en
dan vooral voor wattage en IP.

**R3 — onderdrukken in plaats van gokken.** De parser overtreedt bij `2700-6500K` zijn eigen
ijzeren regel (*ontbrekend ≠ fout*) door willekeurig 6500 te nemen. Hetzelfde geldt voor
`3000K/4000K`, `CRI80/90`, een hoek naast `TILT`, en een onbekende IP-klasse — samen ~980
gevallen. Die horen géén waarde op te leveren.

Belangrijk: R3 hoort **niet** in `parser.ts` maar als voorstelpoort in `startEnrichmentRun`.
Anders verandert het ook het matchgedrag van spec-regels, en dat is een aparte meting. R1 hoort
wél in de parser, want daar is de waarde aantoonbaar verkeerd — niet slechts onzeker.

### 2. De cel is de eenheid van beoordeling

Een agent ziet per cel: veld, waarde, `n`, de naamvorm, tot drie echte productnamen, en de
vlaggen. Drie eenheden blijven gescheiden — dat was een verwarring die beide agents opmerkten:

| | eenheid | waarom |
|---|---|---|
| steekproef | naamvorm | doet `pickSampleIndices` al |
| **beoordeling** | **cel** | vorm is te grof (waarde valt eruit), rij is te duur |
| verwerping | rij | groepsverwerping op vorm sneuvelde al |
| rapportage | faalvorm-klasse `(veld, soort)` | 40 meningsverschillen zijn meestal 3 patronen |

B's eigen restrisico neem ik over als meetpunt: een cel groept rijen die in ándere cijfers
verschillen. Ziet de agent 3 van de 200, dan kan een uitzondering hem ontgaan. **Z5 toetst dat**:
vijf "goed"-cellen volledig uitdraaien en tellen of het oordeel op alle rijen houdt.

### 3. Agents krijgen geen databaseverbinding — structureel, niet afgesproken

Hier waren beide agents het eens, en A gaf het scherpste argument: schrijft een agent in
`enrichment_items.sampleVerdict`, dan is `assertSampleReviewed`
([enrichment.ts:132](lib/repo/enrichment.ts:132)) automatisch tevreden en publiceert `publishRun`.
Dat is exact de doorgeklikte poort die het vorige probleemdoc beschrijft — nu geautomatiseerd.

Daarom: agents lezen een **bestand** en schrijven JSON terug. Geen DB-client, geen credentials,
geen pad naar `publishRun`. Dat is meteen de bewezen vangrail tegen brokstukken in de prompt.

De uitkomst landt als append-only JSONL per merk en batch (`zwerm/<merk>/<batchId>.<rol>.json`)
plus één samenvattend `logEvent`. Geen schemawijziging in deze stap: het houdt de zwerm
herstartbaar en `sampleVerdict` zuiver menselijk. Wil je later een 'fout'-cel écht uit een
publicatie houden, dan doet een gepoord script ná Timo's go wat de bestaande code al kan — de
betrokken items op `inSample` + `sampleVerdict = 'fout'` zetten. Dat verhóógt de
`sampleErrorRate`, en dat is eerlijk.

### 4. Oneens is een meting, geen stem

Geen derde agent die beslist — een derde LLM is geen onafhankelijk bewijs en wekt de schijn van
beslechting. Beide 'goed' → goed. Beide 'fout' → fout, mét verplichte regel-formulering. Oneens →
`onbeslist`, en dan beslist **de populatiemeting**: reproduceert het patroon van de scepticus
deterministisch over het hele merk, dan telt het. Raakt de voorgestelde regel 2.800 rijen, dan is
het een bug; raakt hij er 1, dan is het ruis.

Het oneens-percentage is zelf een meetpunt. Boven 5 % is niet de data verdacht maar de opzet:
stoppen en de prompt inspecteren. Idem voor een rol die meer dan 40 % vlagt.

### 5. Vallen in elke batch

De sprintmaster eist dat elke agent terugmeldt hoeveel regels hij gelezen heeft. Ik neem A's
aanscherping over: **één val per 20 cellen** — een cel met een bewezen fout (een `NON DIM`-geval,
of een rij uit Timo's 100 CRI-oordelen). Daarmee is de gelezen-telling toetsbaar in plaats van
zelfgerapporteerd. Vallen-recall onder 90 % ⇒ prompt herzien, niet doorgaan.

## Uitvoering

| # | stap | meting | stop |
|---|---|---|---|
| Z0 | R1–R3 bouwen + tests | `meet-verdenking.ts` opnieuw: verdenkingen zakken van 18.123 naar ~2.800 | wijkt >20 % af ⇒ analyse |
| Z1 | nulmeting matcher vóór/ná R1 (raadhuis + tno, verse parse) | R1 raakt de aanvraagkant; tno vraagt dimbaarheid op alle 15 regels | onverklaarde verslechtering ⇒ stop |
| Z2 | cellijst + manifest voor XAL | 1.706 cellen, som n = 16.856 | ongelijk ⇒ stop |
| Z3 | 4 proefbatches, dubbel bezet, mét vallen | gelezen-telling klopt 8/8, vallen-recall ≥90 % | ≥1 mis ⇒ prompt herzien |
| Z4 | XAL volledig (~137 dubbele taken) | **vondsten buiten de 13 bekende faalvormen**; oneens-% | oneens >5 % ⇒ stop |
| Z5 | 5 "goed"-cellen volledig uitdraaien | oordeel houdt op alle rijen | breekt ⇒ celeenheid verwerpen |
| Z6 | rapport aan Timo | — | go per merk, apart |

**Z4 is de falsificatie van dit hele plan**, en B heeft hem zelf voorgesteld: levert XAL nul
vondsten op buiten de dertien faalvormen die we al kennen, dan had A gelijk en krimpt de brede
band tot een aselecte 10 %. Levert het wél iets op, dan is dat het bewijs dat een filter alleen
vangt wat de schrijver bedacht — en dan schaalt de brede opzet naar de andere merken.

## Waar beide agents zichzelf ondergroeven (en dat klopt)

- **A:** na de reparaties houdt XAL 58 verdachte rijen over. Kijkt de zwerm alleen daar, dan kijkt
  hij naar niets — alle resterende waarde zit in de aselecte greep, dus in rijen waarvan het
  filter zégt dat ze goed zijn. Wie op tokens bezuinigt, moet dat op het verdachte deel doen, niet
  op het aselecte.
- **B:** bij XAL/CRI is aantoonbaar niets te vinden (vijf tokens, nul meerdere-waarden, nul
  buiten-bereik), en 13.449 solo-cellen zijn een derde van de kosten voor 8,5 % van het volume.
  Daar is "cel" een sjiek woord voor "rij".

Beide concessies wijzen dezelfde kant op: begin bij XAL, meet Z4 eerlijk, en laat die uitkomst
bepalen hoe breed de rest wordt.

## Wat niet verandert

- Timo's go blijft. De zwerm levert bewijs, nooit toestemming.
- Publiceren blijft achter de gepoorde scripts, nooit via de UI.
- Alles op de branch tot Timo apart go geeft voor productie.
- `pickSampleIndices` en de 100 rijen van Timo blijven exact zoals ze zijn. De zwerm is een
  tweede, bredere laag ernaast — geen vervanging van de menselijke poort.
