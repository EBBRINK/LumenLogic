// De AANVRAAGKANT: parseProductName voedt ook lib/pdf/armaturenboek.ts, en een bredere regel
// verandert dáár stil het matchgedrag. Dit script meet dat op de echte spec_lines: hoeveel
// bestaande aanvraagregels zouden een ANDERE req_kelvin/req_cri krijgen dan ze nu hebben?
//
//   bun --env-file=.env.branch scripts/meet-flos-aanvraagkant.ts
import { assertBranchDb, logGuard } from "./branch-guard";
import { parseProductName } from "@/lib/enrichment/parser";

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { specLines } = await import("@/db/schema");
  const rijen = await db
    .select({
      tekst: specLines.productText,
      omschrijving: specLines.description,
      kelvin: specLines.reqKelvin,
      cri: specLines.reqCri,
    })
    .from(specLines);
  console.log(`spec_lines: ${rijen.length} aanvraagregels\n${"═".repeat(70)}`);

  let nieuwKelvin = 0, nieuwCri = 0, andersKelvin = 0, andersCri = 0, gelijk = 0;
  const vb: string[] = [];
  for (const r of rijen) {
    const tekst = r.tekst ?? r.omschrijving ?? "";
    if (!tekst) continue;
    const p = parseProductName(tekst);
    let geraakt = false;
    if (p.kelvin !== undefined) {
      if (r.kelvin == null) { nieuwKelvin++; geraakt = true; }
      else if (r.kelvin !== p.kelvin) { andersKelvin++; geraakt = true; }
    }
    if (p.cri !== undefined) {
      if (r.cri == null) { nieuwCri++; geraakt = true; }
      else if (r.cri !== p.cri) { andersCri++; geraakt = true; }
    }
    if (!geraakt) gelijk++;
    else if (vb.length < 15) {
      vb.push(`  nu kelvin=${r.kelvin ?? "—"}/cri=${r.cri ?? "—"} → parser kelvin=${p.kelvin ?? "—"}/cri=${p.cri ?? "—"}  ${tekst.slice(0, 60).replace(/\s+/g, " ")}`);
    }
  }
  console.log(`  regels waar de parser NU een kelvin geeft en de kolom leeg was : ${nieuwKelvin}`);
  console.log(`  regels waar de parser een ANDERE kelvin geeft dan de kolom     : ${andersKelvin}`);
  console.log(`  regels waar de parser NU een cri geeft en de kolom leeg was    : ${nieuwCri}`);
  console.log(`  regels waar de parser een ANDERE cri geeft dan de kolom        : ${andersCri}`);
  console.log(`  ongewijzigd                                                    : ${gelijk}`);
  console.log(`\nvoorbeelden van geraakte regels:`);
  for (const l of vb) console.log(l);

  // Draagt enige aanvraagtekst überhaupt de korte notatie?
  const kort = rijen.filter((r) => /(?<![\d.,])\d{1,2}K(?:\s?C\d{2}|\d{2}|[^A-Za-z0-9]|$)/.test(r.tekst ?? r.omschrijving ?? ""));
  console.log(`\naanvraagregels die de KORTE notatie dragen: ${kort.length}`);
  for (const r of kort.slice(0, 10)) console.log(`  ${(r.tekst ?? r.omschrijving ?? "").slice(0, 68).replace(/\s+/g, " ")}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
