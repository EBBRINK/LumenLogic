// Weergavelabels voor het compleetheidsniveau (UX-audit 30 jul, item 4).
//
// `must` / `wanna` / `nice` is intern jargon — "wanna" is geen woord dat je een merk
// voorzet, en het stond in de scorecard, in de veldenlijst én als radiokeuze. De OPGESLAGEN
// enum blijft precies zoals hij is (db/schema.ts: CHECK in migratie 0015, en
// lib/field-catalog.ts draagt hem in elke velddefinitie): geen migratie, geen
// schema-risico, geen aanraking van de meetlogica. Alleen de weergave wisselt.
//
// EÉN PLEK, met fallback. Elke rendersite gaat via `niveauLabel()`, dus een vierde niveau
// dat ooit aan de enum wordt toegevoegd komt als "Extra"-achtig woord op het scherm en
// nooit als ruwe sleutel — dezelfde vangnetvorm als `fieldLabel()` in
// lib/matching/tolerances.ts. Voeg je een niveau toe, zet het hier erbij; vergeet je dat,
// dan lekt er nog steeds geen jargon.
import type { Compleetheidsniveau } from "@/lib/field-catalog";

const NIVEAU_LABELS: Record<Compleetheidsniveau, string> = {
  must: "Required",
  wanna: "Requested",
  nice: "Optional",
};

export function niveauLabel(niveau: string): string {
  const known = NIVEAU_LABELS[niveau as Compleetheidsniveau];
  if (known) return known;
  const word = niveau.replace(/[_-]+/g, " ").trim().toLowerCase();
  if (!word) return niveau;
  return word.charAt(0).toUpperCase() + word.slice(1);
}
