# Probleem: geen "wachtwoord vergeten"-flow

**Gemeten (19 aug 2026):** op de login-pagina van de productie-deploy staat een
e-mail + wachtwoord-formulier met daaronder "Use a magic link instead". Wie zijn
wachtwoord kwijt is (dat is nu concreet gebeurd: Timo, account timo@jouwainstein.com)
ziet alleen "Invalid email or password" en heeft géén "wachtwoord vergeten"-link.
De enige uitweg is de magic link — maar die vereist dat je weet dat die er is, en
in de fase zonder mailprovider komt de link alleen in de Vercel-logs terecht
(zie CLAUDE.md), dus voor een normale gebruiker is dat geen route.

**Gewenst:** een reset-flow passend bij Better Auth zoals het hier is opgezet
(magic link → serverconsole, nog geen mailprovider). Open vraag voor de planners:
is een aparte reset-flow nodig, of is de juiste fix de magic-link-route prominenter
maken / wachtwoord wijzigen ná magic-link-login? Beslissing met onderbouwing in
`docs/goal-wachtwoord-reset.md`.

**Randvoorwaarden (ijzeren regels + conventies):**
- Elke server action: `requireSession()` waar van toepassing → `parseForm()` (zod
  via `lib/validation.ts`) → repo.
- Client-side action-aanroepen via `callAction()` uit `lib/next-action-result.ts`.
- Reset-events loggen in de events-tabel.
- White-box RSC-test met screenshots (light/dark × mobile/desktop).
- Bouwen vanaf `origin/main` (lokale main loopt achter). Niet pushen.
