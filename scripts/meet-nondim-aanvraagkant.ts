// Verklaart waarom de nameting ongewijzigd is: raakt de ontkenning de AANVRAAGKANT wel?
import { assertBranchDb, logGuard } from "./branch-guard";
logGuard(await assertBranchDb(process.cwd()));
const { db } = await import("@/db/client");
const { sql } = await import("drizzle-orm");
const { NIET_DIMBAAR } = await import("@/lib/enrichment/parser");
const rows = ((await db.execute(sql`
  select fixture_code, brand_text, product_text, description, req_dimmable from spec_lines`)).rows ?? []) as any[];
let raak = 0, metEis = 0;
for (const r of rows) {
  const t = [r.description, r.product_text, r.brand_text, r.fixture_code].filter(Boolean).join(" ");
  if (!NIET_DIMBAAR.test(t)) continue;
  raak++; if (r.req_dimmable != null) metEis++;
}
console.log(`\nspec_lines totaal                       : ${rows.length}`);
console.log(`  waarvan de tekst dimbaarheid ONTKENT  : ${raak}`);
console.log(`  daarvan met een req_dimmable-eis      : ${metEis}`);
console.log(`\n→ ${raak === 0 ? "De aanvraagkant wordt door deze fix niet geraakt; 'ongewijzigd' is verklaard, niet toevallig."
  : "LET OP: de aanvraagkant wordt WEL geraakt — de nameting had moeten bewegen."}`);
