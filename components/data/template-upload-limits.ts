// Uploadgrootte-cap van het retour-pad (docs/plan-1-2-retourpad.md, besluit 7).
//
// WAAROM HIER EN NIET IN lib/excel-validate-messages.ts: een cap is geen format-oordeel.
// De validator zegt iets over de INHOUD van een bestand ("dit is ons template niet");
// de cap zegt iets over onze eigen transportgrens en zou in 4.B (merkportaal) anders
// kunnen liggen. De tekst leeft daarom bij de upload-UI.
//
// WAAROM EEN EIGEN MODULE EN NIET IN template-upload-card.tsx: de cap moet op twee
// plekken gelden — client (directe melding, geen request) én server (gezaghebbend, de
// éérste check in de action). Een "use client"-module is geen veilige importbron voor
// een server-action: over de client-grens worden exports client-referenties, geen
// waarden. Deze module heeft géén "use client" en is dus aan beide kanten gewoon data.

/** Ruim onder serverActions.bodySizeLimit ("4mb", next.config.ts) inclusief
 *  FormData-overhead. Een gevulde template is honderden KB. */
export const MAX_TEMPLATE_UPLOAD_BYTES = 3 * 1024 * 1024;

const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1);

/** Cap-melding. Engels (besluit W1: de interne UI is Engels) en met de maat erbij —
 *  "te groot" zonder getal laat iemand raden wat "kleiner" betekent. */
export function templateCapMelding(bytes: number): string {
  return `This file is ${mb(bytes)} MB — larger than the ${mb(MAX_TEMPLATE_UPLOAD_BYTES)} MB limit for a filled template. A filled template is a few hundred KB, so a file this size is usually a different document, or the template with images pasted into it. Nothing has been uploaded.`;
}

/**
 * Rij-cap: een TRANSPORTgrens naast de validator, geen format-oordeel (zelfde redenering
 * als de byte-cap hierboven — daarom leeft hij hier en niet in lib/excel-validate.ts).
 * Ruim gekozen: catalogus-formaat bestanden (18.670 rijen gemeten op 11 aug 2026, zie
 * docs/probleem-template-upload-grote-bestanden.md) zijn sinds de directe import juist
 * het doel. De cap vangt alleen het pathologische geval — een bestand dat geen catalogus
 * meer is maar een export-ongeluk. Alleen serverside te checken: de rijen zijn pas na de
 * validatie bekend, dus er is geen client-laag zoals bij de byte-cap.
 */
export const MAX_TEMPLATE_UPLOAD_ROWS = 60_000;

export function templateRijCapMelding(rijen: number): string {
  return `This file contains ${rijen.toLocaleString("en-US")} filled rows — more than the ${MAX_TEMPLATE_UPLOAD_ROWS.toLocaleString("en-US")} row limit. Even a full brand catalogue stays well below this, so a file this size is usually an export accident. Nothing has been imported.`;
}
