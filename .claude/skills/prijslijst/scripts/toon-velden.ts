// Print de officiële veldcatalogus van het brand-Excel (kolomkoppen + niveau per veld),
// zodat de skill exact hetzelfde werkblad bouwt als de Lumen Logic-brandportal verwacht.
//   bun run scripts/toon-velden.ts
import { FIELD_CATALOG } from "./field-catalog";
for (const bucket of FIELD_CATALOG) {
  for (const veld of bucket.fields) {
    console.log(JSON.stringify({ bucket: bucket.labelNl, bucketEn: bucket.labelEn, ...veld }));
  }
}
