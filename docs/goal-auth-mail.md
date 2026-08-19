# Goal: auth-mails via Resend

Probleem: `docs/probleem-auth-mail.md`. Twee planners (19 aug 2026) kwamen overeen;
dit is de synthese. Bouwt voort op branch `wachtwoord-reset`.

## Beslissingen

- **Kale fetch** naar `POST https://api.resend.com/emails` (Bearer `RESEND_API_KEY`),
  géén Resend-SDK (extra dependency, react-email-typings, TS7-risico).
- **Mailer als geïnjecteerde seam**, naar het model van de database-injectie in de
  auth-factory: `lib/mail.ts` met `type Mailer = (msg: {to; subject; text}) => Promise<void>`,
  `createResendMailer()` (env-lezing `typeof process`-veilig, binnen functies — de
  vitest-browserrun importeert de factory), `consoleMailer` (byte-identiek aan de huidige
  logregels) en `defaultMailer()`: key + `MAIL_FROM` aanwezig → Resend, anders console.
  Key zónder `MAIL_FROM` → `console.error`-waarschuwing + consoleMailer (nooit stil falen).
- `CreateAuthOptions` krijgt `mailer?: Mailer`; `lib/auth.ts` geeft `defaultMailer()` door;
  tests injecteren een capture-mailer.
- **Faalgedrag:** één poging, geen retry. Bij falen: URL alsnog `console.log`en
  (Vercel-logs blijven vangnet), `auth_mail_failed`-event, nooit throwen naar Better Auth —
  respons blijft neutraal (anti-enumeratie). Succes → `auth_mail_sent`-event. Payload:
  `kind: "password_reset" | "magic_link"`, message-id resp. statuscode — **nooit de
  URL/token in de event-payload**. Loggen gebeurt in de factory-callbacks (mail.ts blijft
  database-vrij). Labels in `lib/event-labels.ts` (boekhouding in de kop meetellen).
- **Throttle:** in `sendResetPassword` eerst query op de events-tabel — bestaat er een
  `password_reset_requested` voor deze user jonger dan 10 min, dan stil overslaan (geen
  mail, geen event; respons identiek — draait alleen voor echte accounts, dus geen lek).
  Comment op de querysite dat de rem op de events-tabel leunt. Geen migratie.
- **Templates:** plain text, Engels; onderwerp + link + geldigheidsduur (reset 15 min,
  magic link 5 min). Afzender uit `MAIL_FROM`, conventie `Lumen Logic <auth@mail.…>`
  (subdomein; Timo's DNS-keuze), niet hardcoded.
- **Allowlist-poort** bij de magic link blijft onaangeraakt vóór alles staan.
- **Geaccepteerd + documenteren in HANDOVER:** timing-verschil bij bestaande accounts
  (mail-call ~100–500 ms) als theoretisch enumeratiekanaal; per-IP-edge-rate-limit blijft
  bestaand open punt.

## Bouwstappen

1. `lib/mail.ts` + `lib/mail.test.ts` (`vi.stubGlobal("fetch")`, `vi.unstubAllGlobals()`
   in afterEach): payload/headers juist, non-2xx/netwerkfout throwt uit de Resend-mailer,
   zonder key → consoleMailer gekozen.
2. `lib/auth-factory.ts`: mailer-optie, beide callbacks ombouwen (mail → events →
   console-fallback), throttle in `sendResetPassword`. Commentaar "fase zonder
   mailprovider" bijwerken.
3. `lib/event-labels.ts`: `auth_mail_sent` / `auth_mail_failed`.
4. Tests ombouwen: `captureResetLog`-monkeypatch in `lib/auth-password-reset.test.ts` en
   de console-capture in `lib/auth-activation.test.ts` vervangen door injectie-mailer.
   Nieuwe cases: throwende mailer → flow loopt door + failed-event + neutrale respons;
   tweede request binnen 10 min → geen tweede mail; onbekend adres → mailer nooit
   aangeroepen; mail bevat het token uit `verification`.
5. UI-teksten + docs: sent-meldingen ("check the server console") op /forgot-password,
   login-form en magic-link-form worden: "…a link has been sent. (Without a mail key
   configured, it appears in the server console.)" — één formulering voor beide paden,
   client is niet key-bewust. Bijbehorende test-asserts mee. CLAUDE.md-sectie "Magic link
   ophalen" bijwerken: mail eerst, serverconsole als fallback.
6. HANDOVER.md: Timo's stappen (Resend-account, domein + SPF/DKIM-DNS, verified afwachten,
   sending-only API-key, `RESEND_API_KEY` + `MAIL_FROM` in Vercel production én `.env.local`,
   proefverzending, `auth_mail_sent`-event checken) + geaccepteerde restrisico's.
7. `bun run typecheck` + volledige suite. Committen op `wachtwoord-reset`. **Nooit pushen.**
