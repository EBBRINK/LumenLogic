# Goal: wachtwoord-reset-flow

Probleem: `docs/probleem-wachtwoord-reset.md`. Twee onafhankelijke planners (19 aug 2026)
kwamen op hetzelfde uit; dit doc is de synthese en de bouwopdracht.

## Beslissing

**Better Auth core-resetflow** (`requestPasswordReset` / `resetPassword` onder
`emailAndPassword`), níét de magic link prominenter maken:
- De magic link is allowlist-gated (interne lijst); externe installateurs — de doelgroep
  van het wachtwoordpad — hebben er niets aan.
- De magic link is een sterfhuis (besluit G32/G35: weg in deploy 2).
- Better Auth 1.6.23 levert de flow in core; tokens landen in de bestaande
  `verification`-tabel → **geen migratie**. Endpoints staan al open via
  `app/api/auth/[...all]/route.ts`.
- Bezorging in de fase zonder mailprovider: `console.log` naar serverconsole/Vercel-logs,
  identiek aan de magic link. Fallback blijft: Brink geeft een nieuwe PIN uit.

## Bouwstappen

1. **`lib/auth-factory.ts`** — in `emailAndPassword`:
   - `sendResetPassword`: `console.log` van de URL + `logEvent(database, { entity: "user",
     action: "password_reset_requested", … })` (vuurt alleen voor echte accounts — geen
     enumeratie-lek). Géén allowlist-check.
   - `revokeSessionsOnPasswordReset: true` (⚠️ default staat uit; zonder dit is reset geen
     remedie — NIST SP 800-63B §5.1.1.2).
   - `onPasswordReset`: `logEvent … password_reset_completed`.
   - `resetPasswordTokenExpiresIn`: 15 min (link staat in productie-logs; operator plukt
     hem er toch direct uit).
2. **`lib/validation.ts`** — `zEmail` (trim + e-mailvorm) en `zPassword` gebonden aan
   `MIN_PASSWORD_LENGTH`/`MAX_PASSWORD_LENGTH` uit de auth-factory.
3. **`lib/event-labels.ts`** — labels voor beide nieuwe events.
4. **Server actions** — `app/forgot-password/actions.ts`: `requestPasswordResetAction`
   (geen `requireSession()` — anoniem pad; wél `parseForm` met `zEmail`; roept
   `auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } })`
   aan, `redirectTo` relatief i.v.m. originCheck; respons altijd identiek — anti-enumeratie).
   `app/reset-password/actions.ts`: `resetPasswordAction` (parse token + `zPassword`,
   `auth.api.resetPassword`, INVALID_TOKEN → één generieke melding, succes →
   `redirect("/login")`, bewust geen auto-login).
5. **UI** — `app/forgot-password/page.tsx`, `app/reset-password/page.tsx` (leest
   `?token=`/`?error=`), client-forms naar het model van `password-login-form.tsx` +
   `activate-form.tsx`: action als prop, aanroep via `callAction()`, eigen
   `…-test-stubs.tsx`. Beide pagina's in `LoginChrome`. "Forgot password?"-link onder het
   wachtwoordveld op /login. Neutrale sent-melding ("If … has access … check the server
   console"), wachtwoordbeleid (12–128) zichtbaar in het reset-form.
6. **Tests** —
   - White-box RSC-tests met screenshots (light/dark × mobile/desktop) voor beide
     pagina's, patroon `components/login/login.test.tsx`; asserts: link op /login,
     neutrale melding, INVALID_TOKEN-weergave, `aria-describedby`-koppeling.
   - PGlite-integratietest naar `lib/auth-activation.test.ts`: request → token uit
     `verification` → reset → oude sessie ingetrokken → nieuw wachtwoord werkt, oud
     faalt; onbekend adres → identieke respons, geen callback; token-hergebruik faalt;
     magic-link-only account (zonder credential) → geen gat; events-rijen aanwezig.
   - Bestaande bewakers meegroeien: `login.test.tsx`, `knophierarchie.test.tsx` (scant
     ruwe bron — geen Button-namen in commentaar), B10-focus-ring-scan (huisstijlklassen
     uit `login-chrome.tsx` overnemen).

## Randvoorwaarden

- Bouwen vanaf **origin/main** in een verse worktree (eerst `bun install` — PGlite-tests
  falen anders op "Invalid FS bundle size"). Lokale main niet aanraken.
- Committen op branch `wachtwoord-reset`. **Nooit pushen.**
- Aannames en open eindes (token-in-logs, mailprovider later) → `HANDOVER.md`.
