# Sprint 3.1 — Onboarding externen: PIN → wachtwoord

*Briefing voor de bouwsessie. Zelfvoorzienend: je hebt dit document, de repo en `CLAUDE.md`
nodig — verder niets. Opgesteld door de week-3-sprintmaster op 30 jul 2026 na een grill-sessie
met Timo; alle keuzes hieronder zijn zíjn besluiten (G26/G27, G29 t/m G34), niet die van de
bouwsessie.*

---

## 1. Wat je bouwt

Brink maakt in `/admin` een account aan met een **tijdelijke PIN**. Die PIN mailt Brink zélf,
handmatig, vanuit de eigen mailbox — **de app verstuurt niets** (besluit 6: geen mailprovider;
besluit G26). De gebruiker vult de PIN in, kiest direct een wachtwoord, en zit daarna in de
juiste organisatie. Wachtwoord vergeten = Brink geeft een **nieuwe PIN**, geen apart
resetmechanisme (besluit C10).

**Klaar wanneer:** een testaccount loopt het hele rondje **zelfstandig** door — PIN aanmaken,
PIN invullen, wachtwoord kiezen, uitloggen, opnieuw inloggen met dat wachtwoord, en het ziet
zijn eigen organisatie. Uitdrukkelijk niet: een echte installateur die er die week doorheen loopt.

### Wat er NIET bij hoort
- **3.2a** (route-allowlist + org-scoping over alle 37 routes) is een apart item. Jij maakt de
  organisatie en de memberships aan; het afdwingen van "extern ziet alleen eigen spullen" is
  niet van jou.
- **3.2b** (prijsloze estimate) idem.
- Vind je een bug in bestaande code: **melden met bewijs, niet repareren.** Anders is niet meer
  te zien wat dit item veranderde.

---

## 2. De gemeten uitgangsstand (30 jul 2026, zelf nagemeten — vertrouw geen ouder cijfer)

| Wat | Stand | Waar gemeten |
|---|---|---|
| Organisaties | **0** | productie-Neon, `select count(*) from organizations` |
| Memberships | **0** | idem |
| Users | **3** | `hello@noplasticfloralfoam.com`, `timo@jouwainstein.com`, `e.brink@brinklicht.nl` |
| Accounts mét wachtwoord | **0 van 3** | `account.password is not null` |
| Allowlist | **2** adressen | `timo@jouwainstein.com`, `e.brink@brinklicht.nl` |
| Projecten | **13**, allemaal `org_id IS NULL` | `project_dossiers` |
| Tests die Better Auth raken | **0** | geen `.test.ts` noemt `better-auth`/`auth.api`/`authClient` |
| `input-otp` in het project | **nee** | staat niet in `package.json`; `components/ui/` heeft er 6 |

Twee dingen die hieruit volgen en die je niet mag vergeten:
1. `hello@noplasticfloralfoam.com` heeft wél een user-record maar staat **niet** in de allowlist.
   Onder de huidige magic-link-poort (`lib/auth.ts`, `isAllowed`) kan dat account dus niet
   inloggen. Beslis bewust wat er met dat account gebeurt en meld het — repareer het niet stil.
2. `db/schema.ts:457` declareert `orgId: uuid("org_id")` op `project_dossiers` **zonder**
   `.references()`, terwijl `db/migrations/0005_h2_h3.sql:34-35` de FK wél aanlegt en de live
   database hem heeft (`project_dossiers_org_id_fkey`). **Fix dit niet** — het staat bij 3.2a.
   Weet alleen dat de database een bestaande organisatie eist zodra je een `org_id` zet.

---

## 3. De kwaliteitslat (besluit G29)

Dit is geen "maak het mooi". De critic toetst hiertegen, letterlijk.

### 3a. De harde lat — mechanisme en veiligheid

Referentie: **Microsoft Entra "Temporary Access Pass"**
(<https://learn.microsoft.com/en-us/entra/identity/authentication/howto-authentication-temporary-access-pass>),
dat exact hetzelfde mechanisme is als C10, en **NIST SP 800-63A**
(<https://pages.nist.gov/800-63-3/sp800-63a.html#sec4>) voor enrollment & recovery.

Afvinklijst — elk punt is een test, geen mening:

- [ ] PIN is **8 cijfers** (besluit G34). Past op `InputOTP` met `REGEXP_ONLY_DIGITS`.
- [ ] PIN staat **gehasht** in de database. Nergens leesbaar terug te halen.
- [ ] PIN is **eenmalig**: na één geslaagde activatie ongeldig.
- [ ] PIN **verloopt na 7 dagen** (besluit G34 — bewust langer dan Entra's 1 uur omdat Brink
      handmatig mailt en de ontvanger later kijkt; Entra staat tot 30 dagen toe).
- [ ] **Max 5 foute pogingen**, daarna is de PIN dood en moet Brink een nieuwe genereren.
- [ ] **Eén actieve PIN per gebruiker**: een nieuwe overschrijft de oude, geldig of verlopen
      (Entra-regel, en het is precies C10's "vergeten = nieuwe PIN").
- [ ] PIN is **één keer zichtbaar** voor Brink, bij aanmaken. Daarna nooit meer — Entra zegt
      letterlijk *"You can't view this value after you select Ok."*
- [ ] **Geen account-enumeratie**: het login- én activatiescherm mogen niet verraden of een
      e-mailadres bestaat. Dat principe staat al in `lib/auth.ts` bij de magic-link-poort;
      neem het over.
- [ ] De **sessie ontstaat pas ná** het succesvol zetten van het wachtwoord, niet bij het
      invoeren van de PIN.
- [ ] Een ingelogde gebruiker kan **zelf zijn wachtwoord wijzigen** met opgave van zijn huidige
      wachtwoord (besluit G34). Better Auth heeft dit in de core.

### 3b. De visuele lat

- **De code-invoer**: shadcn `InputOTP`
  (<https://ui.shadcn.com/docs/components/base/input-otp>) — segmented vakjes, plak-ondersteuning,
  foutstaat via `aria-invalid`. Zit **nog niet in het project**; toevoegen is onderdeel van het werk.
- **De rest**: het bestaande `/settings`-scherm is de maatstaf. Timo's huisstijl is in 2.0b
  goedgekeurd (`docs/DESIGN.md`, O1–O13) en de opdracht is "onderscheidbaar even goed als dit".
  **Neem géén vreemde tool als visuele referentie** — dan bouwt de builder die na en botst het
  met de brand kit.
- Screenshots light/dark × mobile/desktop, zoals `components/settings/settings.test.tsx` het doet.

---

## 4. Besluiten waar je je aan houdt

| # | Besluit | Bron |
|---|---|---|
| **6** | Geen mailverzending vanuit Lumen Logic | plan |
| **C10** | Onboarding = PIN → wachtwoord; vergeten = nieuwe PIN | plan |
| **G26** | De app toont de PIN in `/admin` met kopieerknop + kopieerbaar tekstsjabloon. **Brink mailt zelf.** De app verstuurt niets | Timo, 30 jul |
| **G27** | **Iedereen** gaat over naar wachtwoord; magic link verdwijnt. Geen tweede inlogpad | Timo, 30 jul |
| **G29** | De kwaliteitslat is tweelaags: Entra TAP + NIST hard, `InputOTP` + eigen `/settings` visueel | Timo, 30 jul |
| **G30** | `lib/auth.ts` wordt testbaar gemaakt (`createAuth(db)`) zodat de flow op PGlite draait | Timo, 30 jul |
| **G31** | Accounttype komt op de **organisatie**: `organizations.type` = `intern` \| `extern` \| `brand` | Timo, 30 jul |
| **G32** | **Twee deploys**: wachtwoord-auth eerst ernáást, magic link pas eruit als Timo én Eduard bewezen met wachtwoord binnenkomen | Timo, 30 jul |
| **G33** | Gauntlet loop in twee golven, met een stopconditie (zie §6) | Timo, 30 jul |
| **G34** | PIN = 8 cijfers · 7 dagen geldig · eenmalig · max 5 pogingen · één actieve per gebruiker. Wachtwoord wijzigen mag, met huidig wachtwoord | Timo, 30 jul |

### De rollen-mismatch die je moet oplossen (besluit G31)

Er bestaan twee rollenmodellen die niet op elkaar aansluiten:

- **Database** — `membership_role` (`db/schema.ts:124-129`): `calculator`, `werkvoorbereider`,
  `projectleider`, `org_admin`. Dat zijn *petten binnen een organisatie*.
- **De G21-kaart** (`docs/rol-schermen-kaart-2.0a.md:12-17`): `Intern`, `Intern super admin`,
  `User`, `Brand`. Dat zijn *inlogtypen*.

Die assen staan haaks op elkaar. G31 lost het op: het **inlogtype** wordt een eigenschap van de
**organisatie** (`organizations.type`), en `membership_role` blijft ongewijzigd als "welke pet
draag je binnen je org". "Intern super admin" = een `org_admin`-membership in de interne org.
Brink wordt één `intern`-org, elke klant een `extern`-org, elk merk een `brand`-org.
De 13 bestaande dossiers krijgen de Brink-org.

---

## 5. De zes stukken

1. **Auth-fundament** — `lib/auth.ts` van module naar `createAuth(db)`; `emailAndPassword`
   erbij (zit in de core van `better-auth ^1.6.23`, géén extra plugin). `account.password`
   bestaat al in `db/auth-schema.ts:36-50` — **geen migratie nodig voor die kolom**. Levert de
   eerste auth-test die dit project ooit heeft.
2. **PIN-laag** — datamodel + genereren, hashen, geldigheid, eenmalig, pogingenteller.
   Eigen repo-laag, volledig testbaar op PGlite.
3. **Org & rollen** — migratie `organizations.type`, Brink-org aanmaken, 13 dossiers koppelen,
   memberships voor de 3 bestaande users.
4. **Admin-scherm** — PIN aanmaken/tonen/kopieerbaar mailsjabloon in `/admin/users`.
5. **Activatiescherm** — nieuw `/activate`: `InputOTP` + wachtwoord kiezen.
6. **Loginscherm** — `app/login/page.tsx` van magic link naar wachtwoord.

Stuk 1–3 is het fundament. 4, 5 en 6 leunen erop en zijn onderling wél onafhankelijk.

---

## 6. Hoe je bouwt: de gauntlet loop (besluit G33)

Methode: **builder bouwt, een aparte critic beoordeelt.** De builder beoordeelt zijn eigen werk
nooit — een agent die iets gemaakt heeft is beter in het verdedigen van zijn keuzes dan in het
objectief beoordelen ervan. De critic zoekt de **grootste zwakte**, stuurt die terug, de builder
repareert, de critic kijkt opnieuw.

**Golf 1 — fundament.** Eén builder + één critic op stuk 1, 2 en 3, tot de harde lat (§3a)
volledig groen is. Dit is de riskantste code van de week; hij krijgt een eigen, onverdeelde loop.

**Golf 2 — schermen.** Drie builders parallel op stuk 4, 5 en 6, elk met een eigen critic tegen
de visuele lat (§3b). Deze drie raken verschillende bestanden en kunnen dus echt naast elkaar.

**Stopconditie — belangrijk, hier ontspoort zo'n loop:**
- **Harde lat: objectief.** De loop stopt vanzelf zodra alle tests groen zijn en §3a is afgevinkt.
  Geen plafond nodig; er valt niet over te twisten.
- **Visuele lat: max 3 rondes.** Daarna gaan de screenshots naar Timo, wat de critic er ook nog
  van vindt. Zonder plafond blijft een critic altijd "de grootste zwakte" vinden en loopt het
  eeuwig door op smaak.

---

## 7. Harde grenzen

- **Eerst `git fetch origin`; redeneer tegen `origin/main`, nooit tegen lokale main.** Er draaien
  parallelle sessies in dezelfde werkdirectory.
- **Pushen gaat UITSLUITEND via `bash scripts/safe-push.sh <sha>`.** Een kale `git push origin main`
  wordt door een pre-push-hook geweigerd — terecht: hij zou élke commit op de lokale main
  meesturen, ook die van een andere sessie.
- **`git add` met expliciete bestandsnamen, nooit `-A`.** `.claude/launch.json` hoort niet in een commit.
- ⚠️ **Je doet géén productie-deploy.** Elke push naar main deployt live. Het akkoord daarvoor moet
  van Timo zélf komen, in zijn eigen kanaal — een akkoord dat via deze briefing of via een andere
  sessie wordt doorgegeven telt **niet**. Dit is in week 2 terecht een keer geweigerd door een
  bouwsessie. G32 betekent bovendien dat er **twee** losse deploy-akkoorden nodig zijn.
- **IJzeren regels 1–5 uit `CLAUDE.md` gelden altijd.**
- De testset in `~/Downloads/lumenlogic-testset/` is echte klantdata: **nooit in git**.

### Valkuilen die week 1 en 2 hebben opgeleverd
- **`bun install` in elke verse worktree.** Anders vallen ~275 db-tests om op een ontbrekende
  PGlite ("Invalid FS bundle size") — dat is geen codefout.
- **Screenshots uit een volle testrun kunnen stil blanco zijn** (2 KB in plaats van 60+ KB).
  Regenereer per testbestand geïsoleerd vóór je ze beoordeelt, en kíjk ernaar.
- **Await je een server action vanuit een client component?** Via `callAction()` uit
  `lib/next-action-result.ts`, nooit met een kale `await` in een `try/catch`. Een action die
  `redirect()` aanroept laat zijn client-promise **rejecten** met `NEXT_REDIRECT` — dat is Next'
  navigatiesignaal, geen fout. Een lege `catch` maakt van elk succes een mislukking. Dat is
  precies één keer gebeurd; zie `HANDOVER.md`.
- **Regelnummers verouderen snel.** Grep en meet vóór je een pad, getal of regelnummer claimt —
  ook die in deze briefing.

---

## 8. Wat je oplevert

- De zes stukken, gebouwd en getest.
- Een acceptatietest die de héle flow op PGlite doorloopt: PIN aanmaken → invullen → wachtwoord
  zetten → inloggen → uitloggen → opnieuw inloggen. Plus de faalpaden: verkeerde PIN, verlopen
  PIN, tweede keer gebruiken, zesde poging.
- Screenshots light/dark × mobile/desktop van `/login`, `/activate` en het admin-scherm.
- Een kort verslag: wat gebouwd is, wat de critic gevonden heeft en hoe dat is opgelost, en
  welke aannames je hebt moeten doen. Aannames en open eindes ook in `HANDOVER.md`.
- **Niet gepusht naar main zonder Timo's expliciete akkoord.**
