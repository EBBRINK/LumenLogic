# Probleem: de Productnaam-kolom valt weg op de AI-leesroute

> Fase 1 van de werkwijze (probleem uitschrijven), 21 jul 2026. Gemeten op de TNO-AvB-case
> (echte klantdata, ~/Downloads/lumenlogic-testset) via het productiepad. Dit is een ANDER
> probleem dan `docs/probleem-import-leest-verkeerd.md`: dat gaat over de deterministische
> parser (`lib/pdf/armaturenboek.ts`, O1–O4); dit gaat over de **AI-leesroute** die op TNO
> daadwerkelijk liep (de spec_lines droegen `source: "ocr"`).

## De uitkomst in één regel

Het armaturenboek drukt naast `Armatuurtype` een aparte kolom `Productnaam` af — daar staat de
familienaam waarop de catalogus doorzoekbaar is (`Sasso 100`). Die kolom komt niet in
`product_text` terecht, dus de matcher zoekt op het typewoord ("Richtbare downlight") dat in
**geen enkele** XAL-productnaam voorkomt → 0 kandidaten → rood, terwijl het product ingeladen
én bereikbaar is.

## Meting die het gat aantoont (read-only, tegen onze eigen data)

- `visible_products` waar `brand ilike '%xal%'` **en** naam bevat "richtbare" of "downlight": **0**.
- `visible_products` waar `brand ilike '%xal%'` **en** naam bevat "sasso 100": **7.538**.
- Jayden's TNO-artikel `L360048-2720017F` ("SASSO 100 RD IP40 FL CRI90 ADJ") is **zichtbaar (1)**
  en draagt beam_angle 39°. Het is dus ingeladen en bereikbaar — alleen niet via de tekst die
  de matcher nu meekrijgt.

Gevolg op de vier TNO-regels Lr302/Lr303/Lr304/Lr305 (alle XAL Sasso 100): **rood, 0 kandidaten**.
Dit is de directe oorzaak van 5 van de 9 rode TNO-regels (incl. Lw201 Muuto Calm wall).

## De oorzaak, met bestand:regel

**P1 — Het extractieschema kent geen `Productnaam`-veld.** `lib/ai/ocr.ts:176` vraagt het model
per regel om `armatuurcode · merk · type · ruwe_tekst · aantal`. `type` is gedefinieerd als
"Product type/description as printed" — het model vult dat met de kolom `Armatuurtype`
("Richtbare downlight"). De kolom `Productnaam` ("Sasso 100") heeft geen eigen veld en overleeft
alleen ongestructureerd in `ruwe_tekst`.

**P2 — `product_text` krijgt alleen `type`.** `lib/repo/ocr.ts:741`: `productText: type || null`.
De familienaam in `ruwe_tekst` wordt wél meegeparsed voor de spec-velden (`parseInput`,
regel 729) maar nooit toegekend aan `product_text`. Netto: de matcher krijgt "Richtbare downlight"
als enige producttekst en gooit "Sasso 100" — het enige zoekbare woord — weg.

## Waarom dit de échte oorzaak is (en niet de vertaaltabel)

Op Raadhuis staat XAL Lr301 al op **rang 1 zonder enige vertaaltabel**, omdat daar de familienaam
(`SASSO PRO 100`) wél in de producttekst belandt en de bestaande spec-ordening hem oppakt. De
vertaaltabel (boektaal → fabrikantscode) kan een **lege** bak niet vullen — hij herordent alleen
wat er al is. Het gat op TNO is dus niet "de ordening deugt niet", maar "de bak is leeg doordat de
familienaam is weggevallen". Dat repareert P1/P2, niet een vertaaltabel.

## Meetplan (fase 3 werkwijze) — via `eval-testset.ts`, verse parse

1. **Nulmeting:** `bun --env-file=.env.local scripts/eval-testset.ts --case=tno --ai` — vastleggen dat
   Lr302–305 nu rood/0 kandidaten zijn. **Meet uitsluitend de vers-uit-de-PDF geparste regels;
   nooit de `spec_lines`-tabel** — die muteert live tijdens reviewsessies (Lr302 stond gister op
   "Richtbare downlight", nu op "Sasso 100"). `--ai` is nodig: dit is de AI-leesroute; kostenplicht
   L-06 geldt (elke call schrijft één `llm_usage`, scriptlokaal €1-plafond). Draai 2–3× — de route
   is non-deterministisch; herhaling toont of de familienaam stabiel in `ruwe_tekst` staat. Dat is
   meteen de **P2-vs-P1-beslisser**: staat "Sasso 100" er niet betrouwbaar → P2 faalt en P1 (schema-veld)
   is nodig.
2. **Na de fix:** Lr302–305 **rood → niet-rood, mét kandidaten**.
3. **Meetpunt 3 — HERGEDEFINIEERD naar familie-niveau (besluit Timo, 21 jul).** De oorspronkelijke
   vraag "komt Jayden's exacte variant boven?" is op TNO **incoherent**: het boek vraagt beam
   **51–56°**, Jayden kocht **FL (39°)**, terwijl de **WF-variant (57°)** juist ínnen de gevraagde
   band valt (176 ADJ-producten in 47–59°; Jayden's FL op 39°). Jayden's keuze een doel maken zou
   de matcher straffen voor correct bestek-volgen. Daarom: **`grondwaarheid.ts` NIET aanpassen** om
   een `keuze` te forceren. Succes = **Lr302–305 niet-rood én een SASSO 100 ADJ bovenaan (welke
   optiekvariant dan ook)**, af te lezen aan `status` + `top1Code`, zónder keuze-mapping.
   ⚠️ **Poort B, expliciet:** WF (57°) én FL (39°) dragen hun beam allebei uit `optic-code`
   (geverifieerd: 134 FL + 176 WF, alle `tier2_source.beamAngle = optic-code`). Poort B houdt beide
   uit groen. De winnende variant wordt dus **geel of open, nooit groen — en dat is het juiste
   gedrag, geen mislukking.** Wie "geen groen" als falen leest, leest de meetlat verkeerd.
4. **Regressiehek:** `--assert-nulmeting` (draait zonder `--ai`, dus deterministisch pad) mag op geen
   andere case breken. Per constructie immuun: `regelToSpecLine` zit alleen op de AI-routes.

## Winst uit de planfase (21 jul) — de vertaaltabel is voor dit doel vrijwel zeker overbodig

De planfase (twee planning-agents, tegengestelde uitgangsposities) toonde aan dat het gestelde doel
— de juiste XAL-familie bereikbaar maken — door **deze fix alleen** wordt gehaald; de vertaaltabel
(boektaal → fabrikantscode) voegt er niets aan toe. Reden: de tabel kan alleen **herordenen**, en
zelfs herordenen helpt hier niet — hij kan een 39°-product geen 51° laten matchen (dat is tolerantie,
geen zoeken). Jayden's afwijking van het bestek is bovendien een **mens-oordeel**, geen matcher-gat.
De vertaaltabel + het woordenschapboek gaan op de plank; ze worden pas opgepakt als een tóékomstige
case aantoont dat een gevulde bak wél verkeerd geordend wordt. Dat scheelt een grote bouw.

## Volgorde & scope

- **Deze fix eerst.** De vertaaltabel (`docs/`-plank, nog niet gebouwd) wacht op de uitkomst van
  meetpunt 3. Geen bouw op de tabel tot dan.
- **Buiten scope van deze fix:** de vertaaltabel, andere merken, de deterministische parser (P1/P2
  zitten niet in `lib/pdf/armaturenboek.ts`), OCR van beeld-PDF's.
- **Werkwijze:** plan met 2 agents → bouw met 2 agents, nooit direct bouwen. Geen push — de
  sprintmaster deployt (W4). Aannames en open eindes in `HANDOVER.md`.

## Open eindes

- P1 en P2 zijn twee knoppen. Eén ervan kan al genoeg zijn: als `ruwe_tekst` de familienaam
  betrouwbaar bevat, kan P2 alleen (familienaam uit `ruwe_tekst` naar `product_text` halen)
  volstaan zonder het AI-schema te wijzigen. Het plan moet meten welke van de twee nodig is —
  het schema aanpassen raakt élke leesroute, dus dat is de zwaardere ingreep.
- Raadhuis is `SASSO PRO 100`, TNO is `Sasso 100` — verwante families; de meting moet bevestigen
  dat P2 op beide de juiste familienaam oppakt.
