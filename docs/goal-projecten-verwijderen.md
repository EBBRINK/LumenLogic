# Goal: projecten kunnen verwijderen

**Aanleiding** (Timo, 20 aug 2026): de projectenlijst staat vol identieke testprojecten
("d" / "Timo" / no lines yet) en er is geen manier om ze op te ruimen. Archiveren bestaat
al en blijft het omkeerbare pad; dit is de onomkeerbare.

## Keuzes

1. **Repo**: nieuw `lib/repo/dossier-delete.ts` met `getDossierDeleteImpact()` (scalaire
   subquery's, model van `getBrandDeleteImpact` in `lib/repo/brands.ts`) en
   `deleteDossiers(db, scope, toegang, ids, actor)`. Eén functie voor enkel én bulk.
2. **Cascade**: de DB doet het werk — `spec_lines` (+kandidaten, ai_suggestions, reviews
   als kolommen op de regel), `quotes` (+quote_lines), `import_runs` (+ocr_page_images,
   en na de merge van 0024 ook `import_source_files`), `xis_exports`,
   `armaturenboek_versions`, `substitution_proposals`, `matchstation_queue` hangen al
   met ON DELETE CASCADE aan `dossier_id`. Geen nieuwe migratie nodig.
3. **Leads**: `leads.dossier_id` heeft géén ON DELETE en zou de delete blokkeren (zelfde
   reden waarom `scripts/cleanup-testdata.ts` leads eerst opruimt). Een lead is
   commercieel spoor, geen projectinhoud → wij zetten `dossier_id` op NULL (lead blijft
   bestaan, verliest zijn projectlink); het aantal staat in de event-payload.
4. **Geen transactie**: `db/client.ts` is neon-http en kan er geen. Volgorde
   leads-detach → DELETE → logEvent, met try/catch op de DELETE (patroon `deleteBrand`).
   Faalt de DELETE, dan zijn hooguit leads al losgekoppeld — geen dataverlies.
5. **Rechten**: er is geen owner-rol in het schema. "Super admin" = `toegang.soort ===
   "intern"` (mag alles); daarnaast mag een **org-admin van de org van het project**
   (`toegang.adminOrgIds` bevat `dossier.orgId`). Projecten zonder org: alleen intern.
   Niet-verwijderbaar = knop/checkbox afwezig (niet uitgegrijsd), en de repo controleert
   het nogmaals.
6. **Server action**: eigen bestand `app/projects/delete-actions.ts` (afgesproken met de
   parallelle upload-sessie die ongecommit in `actions.ts` werkt). Begint met
   `bewaakProject(formData)` (vorm-test `projects-poort.test.ts`), dan `parseForm`
   (dossierIds komma-gescheiden, zelfde vorm als de brand-relations-bulk), dan repo.
7. **Events** (ijzeren regel 5): per project één event `dossier_deleted`, entity
   `dossier`, `entityId` = project-uuid (kolom is text sinds 0023), actor verplicht,
   payload = volledige dossierrij van vóór de delete + cascade-aantallen +
   leads-detach-aantal. Label in `lib/event-labels.ts`.
8. **UI**:
   - Projectpagina (layout-header): "Delete"-knop naast de statuscontrols, alleen als
     verwijderbaar. `ConfirmActionDialog` noemt naam en inhoud ("d — 21 lines,
     1 estimate. Delete?") en wijst op Archiveren als het omkeerbare alternatief.
   - Projectenlijst: checkboxes naast de kaarten (buiten de kaart-anchor — checkbox ín
     de anchor nest interactieve elementen) + balk "N selected" met "Delete selected",
     blauwdruk `components/data/brand-relations-table.tsx`. Alleen verwijderbare
     projecten krijgen een checkbox.
9. **Geen soft delete**: verwijderen = echt weg; Archiveren is en blijft het omkeerbare
   pad en de dialoog benoemt dat verschil.

## Testnaden

- `lib/repo/dossier-delete.test.ts` (PGlite): cascade écht weg (regels, kandidaten,
  quotes, import runs), leads losgekoppeld i.p.v. verwijderd, één event per project met
  actor + volledige rij, buiten-scope-id overgeslagen zonder event, extern-zonder-admin
  geweigerd, tweede delete logt niets.
- `components/dossier/projectlijst-delete-ux.test.tsx`: white-box RSC-test met
  screenshots light/dark × mobile/desktop van lijst-met-selectie en de dialoog.
- `projects-poort.test.ts` dekt de nieuwe action automatisch.
