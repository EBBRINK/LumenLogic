# Lumen Logic — uitwerking per onderdeel

> Vastgesteld in de grill-sessie van 2026-07-15 (Timo), op basis van code, vault en
> repo-docs. Per onderdeel: wat eronder valt, wat er al staat, en wat er vóór
> **31 augustus 2026** bij moet. Projecten in detail: `lumenlogic-projecten-volledig.md`.

## Het einddoel (31 augustus, in Timo's woorden)

1. **Intern heel snel estimates maken** — staat.
2. **Extern estimates kunnen maken** — installateurs op uitnodiging.
3. **Producten zoeken en vergelijken** — op gewone specs én op milieu/duurzaamheid.
   Géén foto's (bewust niet gewenst).
4. **Data-inzicht** — analytics intern volledig + merk-demo.
5. **Volledige overdraagbaarheid** — "dat ze nooit meer bij mij hoeven te komen":
   accounts naar Brink, runbook, rollen, backups/monitoring.

---

## 1. Projecten ✅ (vernieuwd 2026-07-14)

**Valt eronder:** projectenlijst + statusfilter · nieuw project (naam/klant/XIS-fase/org) ·
statusroute Concept → Estimate gestuurd → Offerte → Gegund/Niet gegund → Archief ·
XIS-fasen (10) met afgeleide veiligheidsschakelaar tender/awarded · tabs Regels
(PDF-upload, matcher, bestek), Review, Estimate (PDF + XIS-push), Werkvoorbereiding
(alleen gegund), Armaturenboek (+versies) · regel-detail · importrun-controlespoor ·
substitutievoorstellen.

**Bevestigd:** LL en XIS zijn losse producten; de XIS-koppeling is een *lead-seintje*
(project van externe gebruiker → automatisch melding/lead in XIS). Rollen (calculator/
werkvoorbereider/projectleider) zijn fasen van één project, geen aparte rechten.
Estimate = richtprijs; offerte-met-kortingen blijft buiten de tool.

**Nog te doen:** AI-vangnet aanzetten (key) · XIS-lead-seintje zodra schrijf-keys er
zijn · open vragen deel C van `lumenlogic-projecten-volledig.md` (trigger/inhoud
lead-seintje, tekening-bron, auto-statusovergangen, aftersales, onboarding-detail).

## 2. Catalogus & producten

**Valt eronder:** catalogus-zoeken · productpagina met disclosure-gating (tier 1/2/3,
per-veld-zichtbaarheid) · vergelijk-tray (max 4) · prijsaanvraag = lead.

**Besloten (grill):**
- **Specs-eerst zoeken erbij** — vrij zoeken over alle merken ("downlight 3000K IP44")
  naast merk-eerst; ordening blijft objectief, nooit commercieel.
- **Geen-data = grijze vlag** — product blijft zichtbaar met expliciet "geen data
  bekend"; nooit stilzwijgend uitsluiten. Motiveert merken om data te leveren.
- **Vergelijken op milieu/duurzaamheid** — duurzaamheidsvelden volwaardig in het
  vergelijk (met grijze vlag waar data mist).
- **Géén foto's/beeldmateriaal** — bewust niet.

## 3. Data (de werkbank)

**Valt eronder:** /data: inladen (blauw-wachtrij) · prijslijsten (verloop, dekking,
dagprijzen) · verrijking (+runs, steekproef) · evaluatie (hit-rate) · merkrelaties
(zie 4). Datamodel: 5 lagen, migratie 0007, prijsarchief, offerte-bevriezing.

**Besloten (grill):**
- **AI aan in week 1** — ANTHROPIC_API_KEY in .env.local + Vercel; vangnet en
  LLM-restgroep-verrijking staan klaar (suggestie-only, gebudgetteerd).
- **Retour-pad merkdata: upload → controle → goedkeuren** — ingevulde Excel-templates
  uploaden op de merkrelatie-pagina; voorstel-scherm toont gevuld/gewijzigd/conflicten;
  pas na goedkeuring naar de database. Zelfde patroon als importvoorstel/brand_uploads.
- **Evaluatieset komt er** — 50–100 échte spec-regels bij de binnendienst ophalen
  (mensenwerk, parallel starten); /data/evaluatie meet de hit-rate.

## 4. Merken (nieuw hoofdonderdeel "Merkenbeheer") + merkportaal

**Twee kanten, één motor:**

**Brink-kant — Merkenbeheer** (eigen hoofdingang in de navigatie):
- Relatiebeheer per merk: wie is benaderd, wie moet nog een mail, relatiestatus
  (niet_benaderd → benaderd → wacht_op_data → data_ontvangen → verwerkt / afgewezen),
  scorecard per bucket (must/wanna/nice), prijslijst-indicator.
- Outreach: bericht + Excel-template **klaarzetten en kopiëren** (Brink mailt zelf
  vanuit de eigen mailbox; persoonlijker, geen deliverability-risico). Geen bulk.
- Disclosure-tiers (/admin/merken, de toestemmings-as) gelinkt maar gescheiden van
  de compleetheids-as.

**Merk-kant — merkportaal** (/merk/*):
- Merken loggen zelf in, zien hun eigen data en het geaggregeerde dashboard
  (anonimiseringsgrens).
- **Self-serve upload:** merk levert eigen Excel in óns format in → directe
  format-validatie ("dit is niet ons format") → dubbelcheck-stappen → staging →
  Brink keurt goed. Zelfde upload→controle→goedkeuren-motor als het retour-pad.

## 5. Analytics

**Besloten (grill): drie smaken op één eventlaag, zichtbaarheid per accounttype.**
1. **Brink intern — alles, breed opgezet** ("liever nu groot, later korter"):
   top-overwogen producten · trends per week · datagaten & dekking (zoek-zonder-
   resultaat, blauw per merk) · afwijzingsredenen-top-10 · plus breed aanvullen:
   projectfunnel (concept→gegund), gebruik per gebruiker/org, hit-rate-ontwikkeling,
   prijslijst-gezondheid, merk-scorecard-voortgang.
2. **Merken (betaald, later):** eigen product-analytics — "dit product wordt vaak
   overwogen/aangeraden". Vóór eind aug: **één overtuigende demo-pagina** in het
   merkportaal (mv_brand_considerations bestaat al).
3. **Architecten/specifiers (later):** sturing op eigen projecten (bv. duurzaamheid
   vs. prijs). Vóór eind aug alleen als ontwerp op papier.

## 6. Instellingen

**Valt eronder:** allowlist · organisaties + rollen (petten) · LLM-budget ·
XIS-sleutel + sandbox-schakelaar.

**Besloten (grill):**
- **Externe onboarding op uitnodiging**: Brink nodigt uit (e-mail aan organisatie
  koppelen) → magic link **per mail** → **Resend koppelen is randvoorwaarde**.
- Rollen/rechten aanscherpen zodra externen binnenkomen (admin ≠ gewone gebruiker;
  externe ziet alleen eigen organisatie/projecten; fase-0: geen prijzen extern).

## 7. Admin & overdracht

**Valt eronder:** /admin: gebruikers · imports (staging goedkeuren) · merken
(disclosure) · events.

**Besloten (grill) — de overdracht is een volwaardig sprintdoel** ("nooit meer bij
mij hoeven komen"):
- **Accounts naar Brink migreren:** Vercel-project, Neon-database, GitHub-repo,
  Supabase-archief op Brink-eigen accounts (of Brink als owner); domein/DNS en
  env-keys gedocumenteerd.
- **Overdrachtsrunbook:** architectuur, deployen, migraties draaien, keys, import-
  proces — zodat een volgende ontwikkelaar (of Timo als ZZP'er) direct verder kan.
- **Rollen/rechten aangescherpt** en **backups & monitoring** (Neon-backupbeleid,
  foutmonitoring, uptime-check) vóór externe gebruikers erop werken.

---

## Externe afhankelijkheden (niet in eigen hand)

- **XIS schrijf-keys** (Lynx, taak #107781; attributenlijst ligt klaar) → lead-seintje
  en echte project-POST.
- **Resend API-key** (Brink-domein) → magic link per mail, uitnodigingsflow.
- **ANTHROPIC_API_KEY** (akkoord, alleen invoeren).
- Evaluatieset-regels van de binnendienst (mensenwerk Brink).
- OCR voor beeld-PDF's, echte facturatie: ná augustus.
