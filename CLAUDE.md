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

Magic link ophalen (fase zonder mailprovider) — lokaal staat hij in de `bun dev`-terminal,
op de deploy in de Vercel-logs:
- `vercel logs --environment production --since 15m --expand --no-branch`
- `--expand` is verplicht, anders zie je alleen de POST-regel en blijft de `console.log`
  eronder verborgen. Link is 5 min geldig (Better Auth-default, geen `expiresIn` gezet).

## Werkwijze
Elke feature: white-box RSC-test met screenshots (light/dark × mobile/desktop) vóór hij af
heet. Kleine commits op main — ⚠️ **elke push naar main deployt automatisch naar productie**
(geverifieerd 17 jul: deployment 3 s na push; er is géén aparte preview-stap). Aannames en open
eindes altijd in `HANDOVER.md`. Brondata in `data/` is read-only en staat niet in git.

⚠️ **Elke server action begint met een schema-parse** (zod, via `lib/validation.ts`) —
nooit een kale `String(formData.get(…))` of een `as`-cast een db-kolom in. Volgorde:
`requireSession()` → `parseForm()` → repo. De repo-laag vertrouwt daarna zijn invoer;
alleen domeinregels die geld of een klantdocument raken staan óók in de repo. De conventie
en het waarom staan in `docs/INVOERVALIDATIE.md`. Een action die je aanraakt, zet je om.

⚠️ **Pushen naar main gaat UITSLUITEND via `bash scripts/safe-push.sh`.** Een kale
`git push origin main` stuurt élke commit op de lokale main mee — ook die van een parallelle
sessie in dezelfde werkdirectory — en die deployt dan ongevraagd naar productie. Een pre-push-hook
weigert de kale push daarom (installeer eenmalig per clone met `bash scripts/install-git-hooks.sh`;
worktrees delen de hook). `safe-push.sh <sha>` pusht exact die commit(s), rebased op de actuele
origin/main, via een wegwerp-worktree — het raakt je lokale main nooit aan. Zonder argument pusht
het HEAD; `DRY_RUN=1` toont wat er zou gaan zonder te pushen. Ging in week 1 vier keer mis vóór dit
er was; zie het beslissingslog in `docs/lumenlogic-sprintplan-augustus.md`.

⚠️ **Await je een server action vanuit een client component?** Doe dat via `callAction()`
uit `lib/next-action-result.ts`, nooit met een kale `await` in een `try/catch`. Een action
die `redirect()` aanroept laat zijn client-promise **rejecten** met `NEXT_REDIRECT` — dat
is Next' navigatiesignaal, geen fout — en `requireSession()` redirect altijd naar `/login`,
dus dat kanaal draagt zowel succes als "je bent uitgelogd". Een lege `catch` maakt van elke
geslaagde import een mislukking (dat is precies één keer gebeurd; zie `HANDOVER.md`).
