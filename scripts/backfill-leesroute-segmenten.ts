// Backfill (gat B, 20 jul): vult de req_*-velden van bestaande leesroute-regels
// bij uit het opgeslagen markdown-controlespoor van hun importrun — dezelfde
// deterministische segment-verrijking (lib/pdf/rijsegmenten.ts) die nieuwe
// imports nu standaard krijgen, eenmalig toegepast op een al gedane run.
//
//   bun --env-file=.env.local scripts/backfill-leesroute-segmenten.ts <runId>
//
// Gedrag, bewust smal:
//   • alleen regels van déze run (importRunId-scoped) met ≥1 leeg req_*-veld;
//   • alleen null→waarde (idempotent — herdraaien is een no-op);
//   • regels met een matchedProductId worden overgeslagen mét waarschuwing (de
//     spookmatch-machinerie van upgradeOcrLine hoort niet in een script);
//   • per bijgevulde regel: runMatcher + event leesroute_specs_backfilled
//     (regel 5 — niets stil);
//   • ankers = álle fixtureCodes uit run.rows (rijker dan alleen de spec_lines:
//     ook duplicaat-rijen begrenzen segmenten).
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { importRuns, specLines, type ImportRow } from "@/db/schema";
import { parseProductName } from "@/lib/enrichment/parser";
import { vindRijSegmenten } from "@/lib/pdf/rijsegmenten";
import { logEvent } from "@/lib/repo/events";
import { runMatcher } from "@/lib/repo/matching";

const ACTOR = "script:backfill-leesroute";

async function main() {
  const runId = process.argv[2];
  if (!runId) {
    console.error("Gebruik: bun scripts/backfill-leesroute-segmenten.ts <runId>");
    process.exit(1);
  }
  const [run] = await db
    .select()
    .from(importRuns)
    .where(eq(importRuns.id, runId));
  if (!run) {
    console.error(`importrun ${runId} niet gevonden`);
    process.exit(1);
  }
  if (!run.rawMarkdown) {
    console.error("run heeft geen rawMarkdown — niets om uit te backfillen");
    process.exit(1);
  }
  if (run.rawMarkdown.includes("> truncated at 2 MB")) {
    console.error(
      "waarschuwing: rawMarkdown is op 2 MB afgekapt — late pagina's kunnen ontbreken",
    );
  }

  // pagesToMarkdown-vorm terug naar pagina's: "## Page N" gevolgd door de tekst.
  const paginas = new Map<number, string>();
  const stukken = run.rawMarkdown.split(/^## Page (\d+)$/m);
  for (let i = 1; i < stukken.length; i += 2) {
    paginas.set(Number(stukken[i]), stukken[i + 1] ?? "");
  }
  console.error(`run ${runId}: ${paginas.size} pagina's uit rawMarkdown`);

  // Ankers per pagina uit de volledige leesgeschiedenis van de run.
  const rows = (run.rows ?? []) as ImportRow[];
  const ankersPerPagina = new Map<number, string[]>();
  for (const r of rows) {
    const p = r.page ?? 0;
    ankersPerPagina.set(p, [...(ankersPerPagina.get(p) ?? []), r.fixtureCode]);
  }

  const lines = await db
    .select()
    .from(specLines)
    .where(eq(specLines.importRunId, runId));

  const REQ_VELDEN = [
    "reqKelvin", "reqCri", "reqIp", "reqWatt", "reqLumen",
    "reqBeamAngle", "reqDimmable",
  ] as const;

  let bijgevuld = 0;
  for (const line of lines) {
    const leeg = REQ_VELDEN.filter((f) => line[f] == null);
    if (!leeg.length) continue;
    if (line.matchedProductId) {
      console.error(
        `  ~ ${line.fixtureCode}: overgeslagen (heeft al een gekozen match — handmatig beoordelen)`,
      );
      continue;
    }
    const pagina = line.sourcePage ?? 0;
    const tekst = paginas.get(pagina);
    const ankers = ankersPerPagina.get(pagina);
    if (!tekst || !ankers) continue;
    const segment = vindRijSegmenten(tekst, ankers).get(line.fixtureCode);
    if (!segment) continue;
    const specs = parseProductName(segment);
    const update: Record<string, unknown> = {};
    const gevuld: string[] = [];
    const zet = (veld: (typeof REQ_VELDEN)[number], waarde: unknown) => {
      if (line[veld] == null && waarde != null) {
        // numeric-kolommen willen strings — zelfde conventie als addSpecLines.
        update[veld] =
          veld === "reqWatt" || veld === "reqBeamAngle"
            ? String(waarde)
            : waarde;
        gevuld.push(veld);
      }
    };
    zet("reqKelvin", specs.kelvin);
    zet("reqCri", specs.cri);
    zet("reqIp", specs.ipValue);
    zet("reqWatt", specs.maxWattage);
    zet("reqLumen", specs.lumenOutput);
    zet("reqBeamAngle", specs.beamAngle);
    zet("reqDimmable", specs.dimmable);
    if (!gevuld.length) continue;

    await db
      .update(specLines)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(specLines.id, line.id));
    await logEvent(db, {
      entity: "spec_line",
      entityId: line.id,
      action: "leesroute_specs_backfilled",
      actor: ACTOR,
      payload: { fixtureCode: line.fixtureCode, pagina, gevuld },
    });
    const outcome = await runMatcher(db, line.id, ACTOR);
    bijgevuld++;
    const [na] = await db
      .select()
      .from(specLines)
      .where(eq(specLines.id, line.id));
    console.log(
      `  ✓ ${line.fixtureCode}: ${gevuld.join(", ")} → status ${line.status} → ${na.status}`,
    );
    console.log(
      `      na: kelvin=${na.reqKelvin} cri=${na.reqCri} ip=${na.reqIp} watt=${na.reqWatt} lumen=${na.reqLumen} beam=${na.reqBeamAngle} dim=${na.reqDimmable} (${outcome.provable.length} aantoonbaar / ${outcome.incomplete.length} onvolledig)`,
    );
  }
  console.log(`klaar: ${bijgevuld} regel(s) bijgevuld en gehermatcht`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
