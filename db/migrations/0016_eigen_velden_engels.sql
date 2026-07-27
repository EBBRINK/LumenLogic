-- Eigen velden: het formulier op /data/fields vraagt geen Nederlands meer. label_nl en
-- instructie_nl blijven bestaan als nullable legacy-kolommen (zie docs/sprint1-9-plan.md §1) —
-- niet gedropt, want dat is destructief op een database die tegelijk dev en productie is.
-- De gecombineerde (NL EN EN) CHECK-constraints van 0015 worden vervangen door EN-only
-- varianten, zodat de garantie "leeg Engels label/instructie wordt geweigerd" letterlijk blijft
-- staan zonder drieweg-NULL-logica.
ALTER TABLE custom_fields ALTER COLUMN label_nl DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE custom_fields ALTER COLUMN instructie_nl DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE custom_fields DROP CONSTRAINT custom_fields_labels_not_empty;
--> statement-breakpoint
ALTER TABLE custom_fields ADD CONSTRAINT custom_fields_label_en_not_empty
  CHECK (btrim(label_en) <> '');
--> statement-breakpoint
ALTER TABLE custom_fields DROP CONSTRAINT custom_fields_instructions_not_empty;
--> statement-breakpoint
ALTER TABLE custom_fields ADD CONSTRAINT custom_fields_instruction_en_not_empty
  CHECK (btrim(instruction_en) <> '');
