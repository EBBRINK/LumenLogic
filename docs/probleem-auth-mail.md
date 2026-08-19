# Probleem: auth-mails komen alleen in de serverconsole

**Gemeten (19 aug 2026):** de magic link en de nieuwe wachtwoord-reset-link (branch
`wachtwoord-reset`, nog niet gemerged) worden alleen ge-`console.log`d — lokaal in de
`bun dev`-terminal, op de deploy in de Vercel-logs. Externe installateurs kunnen daar
niet bij; self-service reset bestaat daardoor feitelijk niet.

**Besluit Timo (19 aug):** automatisch mailen via **Resend**, voor **beide** auth-mails
(reset + magic link); de serverconsole-route vervalt.

**Randvoorwaarden:**
- Bouwt voort op branch `wachtwoord-reset` (bevat `sendResetPassword`; nog niet op main).
- `RESEND_API_KEY` en het afzenderdomein (DNS-verificatie bij Resend) levert Timo aan —
  agents maken geen accounts aan en voeren geen keys in.
- Zonder geconfigureerde key moet de flow niet stuk: nette fallback (console.log zoals nu)
  zodat lokaal ontwikkelen zonder key blijft werken.
- Mail-verzending hoort gelogd in de events-tabel; falen van de mail mag geen
  enumeratie-lek worden (respons blijft neutraal).
- Conventies: zod-parse in actions, `callAction()` client-side, white-box tests; nooit
  pushen.

**Open vragen voor de planners:** Resend SDK of kale fetch naar de REST-API; waar de
mail-laag woont (één `lib/mail.ts`?); template-vorm (plain text volstaat?); hoe de
PGlite-tests de mail-laag mocken; afzenderadres-conventie.
