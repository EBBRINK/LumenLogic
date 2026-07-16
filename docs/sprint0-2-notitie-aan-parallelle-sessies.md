# Notitie van sprint 0.2 aan de parallelle sprint-0-sessies (0.1, 0.3, 0.4)

> ## ⚠️ ACTIE VEREIST: GEEN.
>
> **Dit document is puur ter informatie.** Je hoeft hier niets mee te doen — niet mergen,
> niet reverten, niets "repareren", geen taak overnemen. Sprint 0.2 was toevallig als eerste
> klaar; deze notitie vertelt alleen wat er in de repo veranderd is, zodat je niet schrikt
> als je iets anders aantreft dan je verwachtte. Ga gewoon door met je eigen onderdeel.

_Geschreven: 2026-07-15, aan het eind van sprint 0.2. Bron van waarheid blijft `HANDOVER.md`._

## Wat sprint 0.2 gedaan heeft

Doel was: repo synchroon, GitHub weerspiegelt wat op Neon/Vercel draait. Dat is gehaald.

- **De grote ontdekking:** de lokale `main` liep **58 commits achter** op `origin/main`.
  De i18n-slag (PR #1) en de OCR-feature (PR #2, migratie 0009) waren al geshipt. Het
  datamodel-0007-werk was de énige nog on-gemergede eenheid.
- **Geïntegreerd via [PR #3](https://github.com/Timo-AInstein/lumenlogic/pull/3)**:
  `origin/main` → revert van de ontkoppel-commit `aef5a59` (herstelt de `price-archive`-
  repolaag die daar uit gestript was) → cherry-pick van de datamodel-WIP `6dc4cef`
  (schema-kolommen + migratie 0007 + docs). Conflicten (journal, `test-db.ts`, `schema.ts`,
  docs) opgelost als semantische unie — OCR en merkrelaties bleven byte-identiek.
- **Geverifieerd, niet aangenomen:** `bunx tsc --noEmit` schoon; `bun vitest run` **509 groen,
  0 failures** (58 files); twee onafhankelijke agents (bouw + verify) bevestigden dat er niets
  van productie verloren ging. Productie-deploy geslaagd en handmatig doorgeklikt.
- **Migratie 0007 stond al op Neon** (14 jul 14:31). Zelf gecontroleerd tegen de live DB:
  `__migrations` bevat 0000 t/m 0009, alle kolommen/indexen/`archive.prices_archive` aanwezig,
  0 duplicaten op `(brand_id, supplier_article_code)`. Er is géén migratie gedraaid bij de merge.

## Wat er in de repo veranderd is (kan je opvallen)

Puur informatief — allemaal bewuste, afgestemde keuzes:

- **Branches verwijderd** (lokaal én op GitHub): `runs-4-6-vijfstatussen`, `english-xis`,
  `english-xis-ship`, `datamodel-productspecs`, `integ/datamodel-op-main`. Hun inhoud zit
  volledig in `main`.
  - ⚠️ **`english-xis-ship`**: de remote-branch is weg, maar hij staat lokaal nog checked out
    in de worktree `/private/tmp/claude-501/.../8b1d6c8d-.../scratchpad/ship-wt`. Ben jij die
    sessie? Dan: je werk zit **al volledig in `main`** (via PR #1). Een `git push` van die
    branch faalt omdat de remote weg is. **Dat hoeft niet gefixt — er gaat niets verloren.**
  - ⚠️ Let op: `datamodel-productspecs` is **ge-cherry-pickt**, dus de oude SHA `6dc4cef` is
    géén voorouder van `main`. `git merge-base --is-ancestor` meldt daardoor onterecht
    "niet gemerged". De **inhoud** zit er wel in (byte-voor-byte geverifieerd).
- **Worktree `.worktrees/ocr` verwijderd** — branch `ocr-image-pdf` was al gemerged (PR #2).
  De branch zelf bestaat nog. Gebruikte je die worktree? Maak 'm gerust opnieuw aan.
- **`/.worktrees/` toegevoegd aan `.gitignore`.**
- **`vitest.config.ts` exclude uitgebreid** naar `**/.worktrees/**` (dekte alleen
  `**/.claude/**`). Geneste worktrees lieten hun testbestanden meelopen en vervuilden de run
  met een foutenlus. Draai je tests en zie je vreemde dubbele testfiles: dit is de fix.

## Wat sprint 0.2 NIET gedaan heeft

Eerlijk, zodat niemand er overheen kijkt:

- **`price-archive` is gebouwd maar nergens aangeroepen.** `archivePriceList` /
  `replacePriceList` in `lib/repo/price-archive.ts` bestaan, zijn getest, en de tabel
  `archive.prices_archive` staat klaar — maar **geen enkele plek in de app roept ze aan**.
  Bij een nieuwe prijslijst worden oude prijsregels dus **niet automatisch gearchiveerd**.
  Het aansluiten hoort bij **sprint 1.2** (retour-pad upload → voorstel → goedkeuren); de
  beoogde stroom staat in `docs/plan-datamodel-productspecs.md` §"Prijslijst-historie".
  Timo is hiervan op de hoogte en akkoord ("voor nu prima"). **Niet jouw taak in sprint 0.**
- **De 0007-kolommen zijn grotendeels leeg** — bewust (besluit B4: "volledig schema nú,
  gefaseerd vullen"). Geen bug.
- **0.1, 0.3 en 0.4 zijn niet aangeraakt.** Die zijn helemaal van jou.
- `ocr-image-pdf` (branch) en `docs/sprint0-externe-aanvragen.md` (untracked, 0.3-werk) zijn
  bewust met rust gelaten.

## Twee dingen die jou kunnen helpen

1. **`main` beweegt tijdens je sessie.** Er draaien meerdere sessies parallel; tijdens 0.2
   zijn PR #4 en #5 er nog doorheen gekomen. Doe altijd eerst `git fetch origin` en redeneer
   tegen `origin/main` — **nooit tegen de lokale `main`**. Dat was precies de fout die 0.2
   bijna maakte: het naïeve plan zou de complete OCR-feature van productie hebben gewist.
   De plan-met-2-agents-stap ving dat op tijd.
2. **De database is één Neon-database** (dev = prod, besluit B1) en migraties 0000 t/m 0009
   staan er al op. `db/migrate.ts` is een custom migrator die per **bestandsnaam** bijhoudt
   wat gedraaid is in de tabel `__migrations`; de SQL zelf is **niet idempotent** (kale
   `ADD COLUMN` / `CREATE INDEX`). Draai dus nooit blind `bun run db:migrate` en hernummer
   geen bestaande migratiebestanden.

---

**Nogmaals: hier is geen actie op nodig.** Veel succes met je eigen onderdeel. 🚀
