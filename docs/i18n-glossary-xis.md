# English terminology glossary (XIS-aligned)

Source of truth for the Dutch → English UI translation of Lumen Logic.
Rules agreed with the user:
1. **Match XIS exactly** wherever XIS has a term (https://xis.brinklicht.nl). XIS is authoritative.
2. **American spelling** (Color, IP value, organization, meter — not Colour/IP rating/organisation/metre).
3. Rename **URL routes** to English too.
4. Code identifiers, DB column/enum names, and query-param *keys* that the server parses stay as-is unless explicitly renamed here (the codebase deliberately keeps internal names Dutch: "UI-naam Project, code-naam blijft dossier"). We translate what users *read*, plus the route folder names.
5. Dutch **code comments stay Dutch** (the team is Dutch). Out of scope.

Items marked ⚖️ have no XIS term — my judgment call; easy to change globally via this glossary.

---

## Top navigation (components/site-nav.tsx) & routes

| Dutch (label) | English label | Route now | Route → |
|---|---|---|---|
| Projecten | Projects | /projecten | /projects |
| Catalogus | Catalog | /catalogus | /catalog |
| (product detail) | Product | /producten/[id] | /products/[id] |
| Data | Data | /data | /data |
| Analytics | Analytics | /analytics | /analytics |
| Instellingen | Settings | /instellingen | /settings |
| Merk (portal) | Brand | /merk | /brand |
| Admin | Admin | /admin | /admin |

### Sub-routes

| Route now | Route → |
|---|---|
| /instellingen/organisatie | /settings/organization |
| /merk/dashboard | /brand/dashboard |
| /merk/data | /brand/data |
| /merk/prijslijsten | /brand/price-lists |
| /data/verrijking | /data/enrichment |
| /data/inladen | /data/loading ⚖️ (brand onboarding into catalog) |
| /data/merkrelaties | /data/brand-relations |
| /data/prijslijsten | /data/price-lists |
| /data/evaluatie | /data/evaluation |
| /admin/gebruikers | /admin/users |
| /admin/merken | /admin/brands |
| /admin/events | /admin/events |
| /admin/imports | /admin/imports |
| /projecten/[id]/offerte | /projects/[id]/quote |
| /projecten/[id]/armaturenboek | /projects/[id]/luminaire-schedule ⚖️ |
| /projecten/[id]/armaturenboek/versies | …/luminaire-schedule/versions |
| /projecten/[id]/werkvoorbereiding | /projects/[id]/work-prep ⚖️ |
| /projecten/[id]/substitutie | /projects/[id]/substitution |
| /projecten/[id]/review | /projects/[id]/review |
| /projecten/[id]/regel/[lineId] | /projects/[id]/line/[lineId] |
| /projecten/[id]/import | /projects/[id]/import |

---

## Match statuses (components/dossier/status.ts) — the five colors

The status "language" is literally color words, used on screen AND on the PDF. Keep them as English color words.

| Dutch | English (label & word) |
|---|---|
| Open | Open |
| Groen | Green |
| Geel | Yellow |
| Blauw | Blue |
| Rood | Red |
| Paars | Purple |

Meanings (tooltips) get translated prose, same intent (e.g. Blue = "Brand not in the catalog yet — data gap, our action").

## Commercial project status (components/dossier/project-status-badge.tsx)

| Dutch enum | Dutch label | English label |
|---|---|---|
| concept | Concept | Concept |
| estimate_gestuurd | Estimate gestuurd | Estimate sent |
| offerte | Offerte | Quote |
| gegund | Gegund | Won |
| niet_gegund | Niet gegund | Lost |
| archief | Archief | Archived |

(Won/Lost align with XIS project stages Win/Lost.)

## XIS phases — already English in code, came FROM XIS. Keep verbatim.
Start · Engineering · Calculations · Presenting · Tender · Deal making · Deliver · Aftersales · Win · Lost.
Safety phase (derived): tender → **Tender**, awarded → **Awarded** (Gegund badge → "Awarded").

---

## Product spec fields (lib/field-catalog.ts) — reconcile labelEn to XIS + American

`labelEn`/`instructionEn` already exist (British). Rewrite to American + XIS wording, then switch the internal UI to read `labelEn`/`instructionEn` instead of `labelNl`/`instructie`.

XIS product filter/column terms are authoritative:
- Article number · Brand · Supplier · Selling Price · Purchase price · Category · Subcategory · Designer · Family
- Height · Width · Length · Cross section · Stock
- **IP value** (not "IP rating") · **Fitting** (not "Lamp base") · **Max wattage** · Light source
- **Lumen output** (not "Luminous flux") · **Color Rendering Index** (CRI) · **Beam Angle** · Dimmable · Color 1 / Color 2

Key field-catalog fixes (British → American/XIS):
| key | old labelEn | new labelEn |
|---|---|---|
| color_1 | Colour (primary) | Color 1 |
| color_2 | Colour (secondary) | Color 2 |
| ip_value | IP rating | IP value |
| lamp_foot | Lamp base | Fitting |
| max_wattage | Max. wattage | Max wattage |
| lumen_output | Luminous flux (lm) | Lumen output (lm) |
| beam_angle | Beam angle (°) | Beam angle (°) → Beam Angle (°) |
| kelvin | Colour temperature (K) | Color temperature (K) |
| material_1/2 | Material (primary/secondary) | Material 1 / Material 2 |
| cri | CRI | CRI (label kept; instruction Americanized) |
Bucket labels: Basics & identity · Commercial · Dimensions · Appearance · Light source & fitting · Photometrics · Electrical / driver · Protection & compliance · Documentation / links · Sustainability / environment. Americanize instructionEn (centimetre→centimeter, colour→color, "e.g." stays).

---

## Common UI vocabulary

| Dutch | English |
|---|---|
| Aantal | Quantity |
| Merk | Brand |
| Leverancier | Supplier |
| Artikelnummer / Artikelnr. | Article number / Art. no. |
| Prijs | Price |
| Stukprijs | Unit price |
| Dagprijs | Spot price ⚖️ |
| Regeltotaal | Line total |
| Subtotaal | Subtotal |
| Klant | Customer |
| Offerte / Offertenummer | Quote / Quote number |
| Estimate | Estimate (kept) |
| Datum | Date |
| Geldig tot | Valid until |
| Opsteller | Author |
| Zoeken | Search |
| Vrije tekst | Free text |
| Alle merken / Alle statussen | All brands / All statuses |
| Geen … gevonden | No … found |
| Merkportaal | Brand portal |
| Prijslijst(en) | Price list(s) |
| Inladen | Loading ⚖️ ; "Markeer als ingeladen" → "Mark as loaded" |
| Verrijking | Enrichment |
| Merkrelaties | Brand relations |
| Evaluatie | Evaluation |
| Gebruikers | Users |
| Instellingen | Settings |
| Organisatie | Organization |
| Rollen (petten) | Roles |
| Projectleider | Project lead |
| Substitutievoorstel | Substitution proposal |
| Armaturenboek | Luminaire schedule ⚖️ |
| Werkvoorbereiding | Work preparation ⚖️ |
| Bestek / telstaat | Specification / count sheet ⚖️ |
| Spec-regel(s) | Spec line(s) |
| Kandidaat / kandidaten | Candidate(s) |
| Gekozen match | Chosen match |
| Wijzig match | Change match |
| Niet gevonden — handmatig linken | Not found — link manually |
| (product niet meer zichtbaar) | (product no longer visible) |
| Prijs via Brink aanvragen | Request price via Brink |
| Data in afwachting van merk | Data awaiting brand |
| Naamloos product | Unnamed product |
| Geen specificaties beschikbaar | No specifications available |
| Nieuw(e) … | New … |
| Verwijderen | Remove / Delete |
| Bekijk | View |
| Tonen op web | Show on web |
| Voorraad | Stock |
| Btw | VAT |
| Bruto(prijs) excl. btw | Gross (price) excl. VAT |
| p.m. / getoond, niet opgeteld | p.m. / shown, not totaled |
| Pagina X van Y | Page X of Y |

## Numeric/format
- Keep `Intl.NumberFormat("nl-NL", EUR)` for € formatting? **Decision: keep euro grouping but it's fine either way** — currency stays €. (Flag: could switch to en-* if desired.)

## Open judgment calls to confirm (⚖️)
- Armaturenboek → **Luminaire schedule** (route /luminaire-schedule)
- Werkvoorbereiding → **Work preparation** (route /work-prep)
- Inladen → **Loading** (route /data/loading)
- Dagprijs → **Spot price**; Bestek/telstaat → **Specification / count sheet**
- lib/brand-message.ts email to brands: currently Dutch. **Translate to English?** (many brands are international). Default: translate, but confirm.
