# Lumen Logic

Spec-, calculatie- en offertetool voor de professionele verlichtingsmarkt (Brink Licht).
Lees `docs/BUILD-PLAN.md` vóór je iets bouwt; achtergrond in `docs/lumenlogic-briefing.md`.

## IJzeren regels (elke sessie, elke feature)
1. Dit is GEEN webshop. Geen winkelwagen, geen checkout, geen publieke prijzen.
2. Geld beïnvloedt nooit de ranking. Matching-logica strikt gescheiden van commercie.
3. Verlopen prijslijst = product onzichtbaar in álle zoekresultaten (centraal afgedwongen).
4. Fase-aware: default = veilig. Tender-stand toont nooit alternatieven-suggesties.
5. Elke zoekactie/match/offerte wordt gelogd in de events-tabel.

## Stack & commando's
Next.js 16 (App Router, RSC) · TypeScript · Drizzle + Neon · Better Auth (magic link →
serverconsole) · Tailwind 4 + shadcn/ui · Bun · Vercel.
- `bun dev` — dev-server
- `bun vitest run` — tests incl. screenshots (PNG's naast de testfile — bekijk ze!)
- `bunx drizzle-kit generate` / `migrate` — schema-migraties
- `bun run import` — brondata (`data/source/*.csv`) → database

## Werkwijze
Elke feature: white-box RSC-test met screenshots (light/dark × mobile/desktop) vóór hij af
heet. Kleine commits op main, regelmatig pushen (= preview-deploy). Aannames en open eindes
altijd in `HANDOVER.md`. Brondata in `data/` is read-only en staat niet in git.
