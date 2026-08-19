-- events.entity_id: uuid → text (docs/probleem-events-entity-id-uuid.md).
--
-- entity_id is een polymorfe verwijzing (entity zegt naar welke tabel), en één van die
-- doelen is `user`: Better Auth genereert user-ids met zijn default-generator — 32
-- alfanumerieke tekens, géén uuid. Elke wachtwoord-reset voor een magic-link-user
-- faalde daardoor op Neon met `invalid input syntax for type uuid`. Alle overige
-- callers geven uuid's door; die casten verliesloos naar text.
ALTER TABLE events ALTER COLUMN entity_id TYPE text USING entity_id::text;
