// DEMO-DATA (synthetisch, duidelijk gemarkeerd in HANDOVER): vult duurzaamheidsvelden
// zodat de gelijkwaardigheidsengine (run 3) zichtbaar op garantie/repareerbaarheid/EPD kan
// ranken. In productie leveren de merken deze cijfers zelf ("scheidsrechter, geen rechter").
// Deterministisch (hash van de product-id) → idempotent en stabiel over herruns.
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL ontbreekt");
const sql = neon(url);

const WARRANTY = [24, 36, 60, 84, 120]; // maanden
const REPAIR = ["A", "B", "C", "D", "E"]; // repareerbaarheidsklasse (merk-opgave)
const EPD = [25000, 35000, 50000, 75000, 100000]; // levensduur (uren, EPD)
const ORIGIN = ["Nederland", "Duitsland", "België", "Italië", "Oostenrijk"];

const PREFIXES = [
  "Binnenverlichting >> Spot%",
  "Binnenverlichting >> Wandlampen%",
  "Binnenverlichting >> Plafondlampen%",
  "Binnenverlichting >> Rails%",
];

function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

async function main() {
  let total = 0;
  for (const prefix of PREFIXES) {
    const list = (await sql.query(
      `SELECT id FROM products WHERE category_path ILIKE $1 LIMIT 4000`,
      [prefix],
    )) as { id: string }[];
    const BATCH = 1000;
    for (let i = 0; i < list.length; i += BATCH) {
      const ids = list.slice(i, i + BATCH).map((r) => r.id);
      const ws = ids.map((id) => WARRANTY[hash(id) % WARRANTY.length]);
      const reps = ids.map((id) => REPAIR[(hash(id) >> 3) % REPAIR.length]);
      const epds = ids.map((id) => EPD[(hash(id) >> 6) % EPD.length]);
      const origins = ids.map((id) => ORIGIN[(hash(id) >> 9) % ORIGIN.length]);
      await sql.query(
        `UPDATE products AS p SET
           warranty_months = d.w, repairability = d.rep,
           epd_lifetime_hours = d.epd, country_of_origin = d.origin
         FROM (SELECT
           unnest($1::uuid[]) AS id, unnest($2::int[]) AS w,
           unnest($3::text[]) AS rep, unnest($4::int[]) AS epd,
           unnest($5::text[]) AS origin) d
         WHERE p.id = d.id`,
        [ids, ws, reps, epds, origins],
      );
      total += ids.length;
    }
    console.log(`✓ ${prefix} → ${list.length} producten verrijkt`);
  }
  console.log(`Duurzaamheids-demodata gezet op ${total} producten.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed mislukt:", e);
    process.exit(1);
  });
