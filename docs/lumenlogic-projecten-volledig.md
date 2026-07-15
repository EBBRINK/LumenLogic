# Projecten — volledig uitgeschreven

> De complete Projecten-flow van Lumen Logic, uit de code gelezen op 2026-07-15.
> Let op: routes in de code staan in het Engels (`/projects`, `/quote`, `/line`,
> `/work-prep`, `/luminaire-schedule`, `/substitution`); de UI-naam is overal
> "Projecten". De datalaag heet bewust nog `dossier`.
>
> Onderaan (§ B) staan de **open punten** — daar grillen we op door.

---

## A. Wat er nu is

### A0. Het model — velden, statussen, fasen

**Een project (`projectDossiers`) heeft:**
`id` · `name` (projectnaam) · `customer` (klant, mag leeg) · `status` (commercieel) ·
`xisPhase` (fase in XIS-taal) · `phase` (afgeleide veiligheidsschakelaar `tender`/`awarded`,
nooit los instelbaar) · `archivedReason` + `archivedAt` · `createdAt`/`updatedAt`.
Deprecated/genegeerd: `lifecycle`, `deliveredAt`.

**Commerciële statussen (6):**

| DB-waarde | UI-label | Betekenis |
|---|---|---|
| `concept` | Concept | Work in progress, niets verstuurd |
| `estimate_gestuurd` | Estimate sent | Estimate verstuurd; kopblok + aantallen bevriezen |
| `offerte` | Quote | Offerte loopt buiten de tool (in XIS) |
| `gegund` | Won | Gewonnen → alternatieven mogen aan (phase `awarded`) |
| `niet_gegund` | Lost | Verloren, blijft bewerkbaar |
| `archief` | Archived | Read-only, met verplichte reden |

**XIS-fasen (10):** start → engineering → calculations → presenting → tender →
deal_making → deliver → aftersales → win → lost.

**Afgeleide fase (veiligheidsschakelaar):** `awarded` als status = `gegund` óf xisPhase ∈
{deal_making, deliver, aftersales, win}; anders `tender` (default = veilig). Bepaalt of
werkvoorbereiding/alternatieven zichtbaar zijn. Read-only geldt alléén bij `archief`.

**Match-status per spec-regel (6):** open · groen · geel · blauw · rood · paars
(groen/geel tellen mee in totaal, paars getoond als p.m., blauw/rood niet opgeteld).

### A1. Projectenlijst — `/projects`

- Statusfilter-tabs (`?filter=`): alle (default = alles behalve archief) · concept ·
  estimate_gestuurd · offerte · gegund · niet_gegund · archief.
- Lijst met per project een kaart: naam, klant, kleurtelling (StatusTally), commerciële
  statusbadge + fasebadge (tender/awarded). Klik → projectdetail.
- Kaart **Nieuw project**: projectnaam (verplicht), klant (optioneel), XIS-fase (default
  `start`), organisatie (default "Intern (Brink)"). Knop **Project aanmaken** → status
  `concept`, logt `dossier_created`, redirect naar het project.
- Link rechtsboven **Analytics →**.

### A2. Projectdetail — gedeelde kop + tabs

Elke projectpagina zit in een layout met:
- Terug-link **← Projecten**.
- Header: naam, statusbadge, fasebadge, klant, kleurtelling.
- **Statusbesturing**: dropdown Status (6) + select XIS-fase (10). "Archief" kiezen opent
  een dialoog met **verplichte reden**. Bij `estimate_gestuurd` wordt de lopende offerte
  bevroren (`frozenAt`, event `quote_frozen`). Alles wordt gelogd.
- Bij archief: read-only-melding + "Gearchiveerd: {reden}".
- **Tabs** (vaste volgorde): Regels · Review (badge = aantal wachtend) · Estimate ·
  Werkvoorbereiding (**alleen in awarded-stand**) · Armaturenboek.

### A3. Tab Regels — `/projects/[id]`

De werkplek van het project.
1. **Import-terugmelding** na een PDF-upload ("{n} regels geïmporteerd", link naar de
   importrun/brontekst).
2. **PDF uploaden** (hoofdingang): PDF wordt in de browser gelezen, alleen tekst gaat naar
   de server, deterministisch geparst naar spec-regels + direct gematcht. Legt altijd een
   importrun vast (controlespoor). Cap 5 MB tekst.
3. **Regeltabel**: Code · Zone · Aantal · Gevraagd (merk+type) · Match · Status · Actie.
   Actieknop is contextueel: geel → **Review**, blauw → **Inladen**, rest → **Open**
   (→ regel-detail). Prullenbak verwijdert de regel. Onder een regel: afwijkingen +
   labels "automatisch geaccepteerde bijna-match" / "handmatig gekozen".
4. **Regels toevoegen**: handmatige regel, CSV-plak (>10 regels → wordt een importvoorstel),
   en **Bestek / telstaat** (textarea "code aantal" → koppelt aantallen op fixture-code;
   onbekende codes worden overgeslagen).

### A4. Tab Review — `/projects/[id]/review`

Het review-station: mens beslist bij ambiguïteit. Kop "Review — X wachtend, Y afgerond".
Wachtende kaarten per soort (`reviewKind`):
- **geel**: bij ≥2 schone kandidaten een keuzekaart ("welke van deze N?"); anders
  **Accepteer als voorstel** / **Andere match** / **Wijs af → rood** (verplichte reden).
- **variant**: kleurvarianten kiezen (echte varianten, anders kandidaten).
- **onvolledig**: **Bevestig** (optionele reden) / Andere match.
- **ocr**: **Gecontroleerd** / Andere match.
- Bovenaan eventueel een **AI-suggestie** (fase-guard: in tender geen ander-merk-suggesties).

Daaronder **Niet gevonden — handmatig linken** (rode regels): zelf zoeken in de catalogus
(ijzeren regel 4: mens zoekt), knop **Link dit product**. En een **Afgerond**-lijst met
audit-spoor (wie, wanneer, welke beslissing).

### A5. Tab Estimate — `/projects/[id]/quote`

- **Kopblok** (alleen zolang niet bevroren): offertenummer, datum, geldig tot, klant,
  contactpersoon, adres, project, opsteller. **Kopblok opslaan**.
- **Genereer/Ververs estimate**: bouwt de offerte uit groen+geel-regels met geldige prijs;
  offertenummer `BL-{jaar}-{4 cijfers}`; bevroren offerte wordt niet overschreven.
- Blauw/rood/paars lopen zichtbaar mee als **p.m.** (niet opgeteld).
- **Print / PDF** + **Download PDF**.
- **→ Naar XIS**: dialoog met pre-flight (artikelregels, nieuwe producten, tekstregels,
  totaal), sandbox default. **Verstuur naar XIS** is idempotent (herzenden = geen duplicaat).

### A6. Tab Werkvoorbereiding — `/projects/[id]/work-prep`

**Alleen in gegund-stand** (in tender: nette melding "pas na gunning"). Per gematchte regel
gelijkwaardige alternatieven (score, rationale, techniek, duurzaamheid, prijs alleen als
tekst — prijs weegt nooit mee in de ordening). Knop **Genereer substitutievoorstel** per
regel → los document. Link naar **Armaturenboek-versies**.

### A7. Regel-detail — `/projects/[id]/line/[lineId]`

- **Regel bewerken**: alle velden (code, aantal, zone, merk/type, en gevraagde specs:
  kelvin, CRI, IP, watt, lumen, stralingshoek, maat, vorm, kleur, dimbaar). **Opslaan &
  opnieuw matchen** (draait matcher + AI-vangnet).
- Kolommen **Gevraagd** vs **Gekozen match** (merk, naam, artikelcode, prijs; **Wijzig
  match**, **Maak los** met verplichte reden).
- **AI-suggesties**, **Afwijkingen** (elk veld met oordeel, ook wat klopt), **Kandidaten**
  (twee lijsten: "voldoet aantoonbaar" / "mogelijk — data onvolledig").
- **Eerlijk afronden zonder match**: Zet op rood / op inlaadlijst (blauw) / op paars, plus
  **Dagprijs op deze regel** (prijs + geldig tot).

### A8. Substitutievoorstel — `/projects/[id]/substitution/[proposalId]`

Print-baar document: referentie vs alternatief, veldvergelijking, besparingsnotitie
(prijsverschil alleen als tekst), datum.

### A9. Importrun / controlespoor — `/projects/[id]/import/[runId]`

- CSV-voorstel: aanvinkbaar controle-scherm (per rij checkbox) → **aangevinkte regels
  toevoegen** of **Annuleer import**.
- PDF: tekst-controlespoor (deterministisch, direct bevestigd).
- Altijd: inklapbaar **markdown-controlespoor** met download. OCR/LLM-herkomst krijgt een
  waarschuwing en staat standaard uit.

### A10. Armaturenboek — `/projects/[id]/luminaire-schedule`

Overdrachtsdocument voor de bouwplaats: álle regels (ook onopgeloste), met code, aantal,
merk, product, artikelcode, kleurtemp/CRI/IP, status. **Print / PDF**.

### A11. Armaturenboek-versies — `/projects/[id]/luminaire-schedule/versions`

- **Nieuwe versie vastleggen** (bevriest de huidige regels als genummerde snapshot +
  notitie).
- **Diff** tussen twee versies (gewijzigd/toegevoegd/verwijderd per veld).
- Laatste snapshot als tabel (incl. datasheet-links). Lijst van alle versies met
  **Vergelijk met vorige**.

---

## B. Bevestigde bedoeling (uit vault + grill, 2026-07-15)

- **LL en XIS zijn losse producten.** XIS is Brinks interne CRM. De enige koppeling: als
  (externe) gebruikers zelf snel projecten aanmaken, schiet dat automatisch als *seintje/lead*
  in XIS zodat Brink het ziet en contact kan opnemen. Geen diepe commerciële sync; verder
  staan ze los. De "→ Naar XIS"-knop is dus een lead-notificatie, geen tweerichtings-sync.
- **Prijzen gefaseerd.** Fase 0: niemand ziet prijzen. Later: verkoopadviesprijzen, zichtbaar
  afhankelijk van accounttype. De échte offerte met Brink-kortingen blijft een apart, later
  onderdeel búiten deze Projecten-flow.
- **Accounttypes:** Brink intern (binnendienst) · installateur (extern) · specifier/architect ·
  merk-account (apart merkportaal, geen projecttoegang).
- **Rollen als fasen, niet als aparte projecten.** Eén project, één waarheid; de fase-bewuste
  engine past het gedrag aan: calculator (tender) → werkvoorbereider (value-engineering ná
  gunning) → projectleider (armaturenboek/overdracht). Bevestigd door de podcast/briefing.
  De huidige `phase`-schakelaar (tender/awarded) is precies dit mechanisme.
- **Estimate = richtprijs**, de echte offerte-met-kortingen is een los toekomstig onderdeel.

## C. Écht nog open — prompt voor Timo (vault)

> Deze staan noch in de code, noch in de vault. Beantwoorden en het antwoord terug hierin.

1. **XIS-lead-seintje — trigger & inhoud.** Wanneer schiet een project automatisch als lead
   in XIS? (Bij aanmaken door een externe gebruiker, of pas bij "estimate versturen"?) En
   welke gegevens gaan mee — alleen projectnaam + klant + wie het aanmaakte, of ook de regels?
   Is het strikt één kant op (LL → XIS) en komt er niets terug?
2. **Derde bron: tekening (`waar`).** Nu is locatie/zone een handmatig tekstveld per regel.
   Wil je dat een tekening/plattegrond aan regels gekoppeld kan worden (locatie per armatuur),
   of blijft locatie voorlopig gewoon een tekstveld?
3. **Statusovergangen automatisch of handmatig?** Moet de status meebewegen met acties
   (bv. estimate genereren + versturen → status automatisch "estimate gestuurd"), of blijft
   het bewust een handmatige keuze in de dropdown?
4. **Na gunning: aftersales / revisies / heropenen.** Werkvoorbereiding gaat open bij gegund.
   Wil je in de deliver/aftersales-fase nog iets in de tool (nazorg, revisies, herbestellen),
   en moet een gearchiveerd project weer te heropenen zijn?
5. **Externe onboarding (raakt "wie maakt een project aan").** Hoe komt een installateur
   binnen — zelf registreren of op uitnodiging? Nu is het een magic-link-allowlist.
```
