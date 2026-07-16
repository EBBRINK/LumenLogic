# Sprint 0.3 — Externe aanvragen de deur uit (tracking)

> Doel: elke externe doorlooptijd is **aantoonbaar** in gang gezet vóór sprint 0 eindigt
> (vr 17 jul 2026). Dit doc bevat de verzendklare concepten + een statuslog. Vul bij elke
> mail de verzenddatum/kanaal in, zodat "aangevraagd" hard te maken is.

## Statuslog

| # | Item | Naar | Kanaal | Verstuurd op | Status | Bewijs / referentie |
|---|------|------|--------|--------------|--------|---------------------|
| a | ~~Resend-account + DNS-records~~ | — | — | — | ❌ vervallen (2026-07-16) | Besluit: géén mailverzending vanuit Lumen Logic deze sprintperiode. Zie §A + sprintplan besluit 6 |
| b | Evaluatieset-uitvraag (50–100 spec-regels) | Binnendienst | — | 2026-07-16 | 🔄 in behandeling | Jayden pakt dit op |
| c | XIS-attributenlijst indienen + status #107781 | Lynx (Alpár Kacso) | — | 2026-07-16 | 🔄 in behandeling | Menno's team maakt/configureert de API-keys |
| d | Supabase-project → "Brinklicht" + app-check | zelf (console) | — | 2026-07-16 | ✅ afgerond | Bevestigd: Supabase wordt niet gebruikt (app draait op Neon, zie CLAUDE.md + `DATABASE_URL`). Rename toch uitgevoerd, geen impact op de app |

**In te vullen placeholders (vervang overal `<…>`):**
`<binnendienst-contact>` · `<jouw-naam>`

---

## A — Resend + DNS: vervallen (2026-07-16)

**Besluit:** géén mailverzending vanuit Lumen Logic deze sprintperiode (t/m aug 2026). Vastgelegd
in `docs/lumenlogic-sprintplan-augustus.md` (beslissingslog #6, herzien). Gevolg: sprint 3.1
(uitnodigingsflow) moet vóór sprint 3 herzien worden met een alternatief onboarding-mechanisme
zonder e-mail — dat is nog open en komt later terug.

**Aanleiding:** HD Services (Marco de Groot) stuurde i.p.v. Resend een SMTP-account
(`n8n@brinklicht`, host `smtp2.mail3000.nl`, poort 2527) dat namens heel `@brinklicht.nl` mag
mailen. Dat account is **niet gebruikt en niet nodig** nu mailverzending sowieso uit scope is.
⚠️ Het bijbehorende wachtwoord is bewust niet in dit document of in git gezet — bewaar het in
een wachtwoordmanager als het later relevant wordt.

---

## B — Evaluatieset-uitvraag bij de binnendienst

Doel: 50–100 échte spec-regels om het AI-vangnet en de matching tegen de werkelijkheid te
ijken. Schriftelijk, zodat het aantoonbaar uitstaat.

**Onderwerp:** Vraag: 50–100 échte spec-regels als testset voor de nieuwe spec-tool

> Hoi `<binnendienst-contact>`,
>
> Voor Lumen Logic (de nieuwe spec-/offertetool) wil ik de zoek- en matchingkwaliteit toetsen
> aan écht werk in plaats van verzonnen voorbeelden. Kunnen jullie me **50 à 100 echte
> spec-regels** aanleveren zoals ze in de praktijk binnenkomen?
>
> Wat ik zoek per regel:
> - de **omschrijving zoals de klant/architect hem aanlevert** (ruwe tekst, hoe rommeliger
>   hoe beter — juist de lastige zijn waardevol);
> - het **armatuur dat jullie er uiteindelijk bij kozen** (artikelcode / merk-type), als bekend;
> - eventueel de **spec-referentie** (bv. "Lp301") en het project/zone, als dat er los bij zit.
>
> Formaat maakt niet uit: Excel, export uit XIS, of geplakt in een mail. Een spreiding over
> makkelijke én moeilijke gevallen is het meest bruikbaar. Geen prijzen nodig.
>
> Zou dit vóór `<datum>` kunnen? Dan kan ik de tool ermee ijken in de volgende sprint.
>
> Dank!
> `<jouw-naam>`

---

## C — XIS-attributenlijst bij Lynx + status #107781

De attributenlijst staat kant-en-klaar (Engels, plakbaar) in
[`docs/xis-post-api-attributes.md`](xis-post-api-attributes.md). Onder de mail: plak de
volledige inhoud van dat bestand in de taak/mail, of hang het aan.

**Onderwerp:** Task #107781 — attribute list for the product/project upload API

> Hi Alpár,
>
> Following up on your request from 24 June to come back with the attribute set for the
> upload endpoint (task #107781). The full list is below / attached. Two endpoints —
> **/projects (quotations) has priority 1** for us, /products priority 2. I have also added
> a short list of open questions at the bottom that we would like to align on.
>
> Could you let me know the current status of #107781, and whether the projects/quotations
> POST can be added to the same task? Happy to jump on a short call if that is easier.
>
> [→ plak hier de inhoud van docs/xis-post-api-attributes.md]
>
> Thanks,
> `<jouw-naam>`

**Aantoonbaar-maken:** noteer in de statuslog het taaknummer + datum van je post in het
Lynx-systeem (of het mailadres waarheen). "Ingediend" = zichtbaar in de taak zelf.

---

## D — Supabase-project hernoemen → "Brinklicht"

⚠️ **Let op (uitgezocht 2026-07-15):** de app verbindt met de DB via
`@neondatabase/serverless` + `DATABASE_URL` (zie `scripts/seed-sustainability.ts`,
`drizzle.config.ts`). Runtime draait dus op **Neon**, niet op Supabase. Een projectnaam
wijzigen raakt de connectiestring (host/db/wachtwoord) bij géén enkele provider — alleen het
label verandert. Dus dit is laag-risico.

**Vóór hernoemen — 5-seconden-check:** kijk in Vercel-env / `.env.local` waar `DATABASE_URL`
op eindigt:
- `*.neon.tech` → app zit op Neon; Supabase-project is los (auth/storage/oud). Hernoemen is
  puur cosmetisch, app blijft werken.
- `*.supabase.co` → app zit tóch op Supabase; dan is de Neon-driver-keuze een aandachtspunt
  (aparte kwestie), maar de rename blijft veilig want de host verandert niet.

**Stappen:**
1. Supabase → project → Settings → General → *Project name* → "Brinklicht" → Save.
2. App-verbinding verifiëren: `bun dev` en één scherm openen dat DB-data toont, óf een read
   op productie. Verwacht: geen verandering (de string bleef gelijk).
3. Statuslog bijwerken + open punt uit 0.4 (welke Brink-accounts: Vercel/GitHub/Neon/Supabase)
   koppelen.

---

## Open punten (naar HANDOVER.md / 0.4)
- **Onboarding externen herzien zonder e-mail** — alternatief mechanisme voor externe
  gebruikers bepalen **vóór week 3 (ma 3 aug)**. Komt later terug, zie sprintplan besluit 6.
  ⚠️ *Datum gecorrigeerd 16 jul: stond op "ma 17 aug", overgenomen uit het inmiddels verouderde
  repo-sprintplan. Het geldige plan (vault) heeft week 3 op 3–7 aug — dit is dus ruim twee
  weken eerder dan gedacht.*
- Deadline evaluatieset afstemmen met binnendienst (Jayden is al bezig).
