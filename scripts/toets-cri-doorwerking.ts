// Werkt de gevulde CRI daadwerkelijk door in de matcher? STRIKT READ-ONLY.
//
//   bun --env-file=.env.branch scripts/toets-cri-doorwerking.ts
//
// Waarom dit apart moet. De nameting (scripts/eval-testset.ts --json) rapporteert per regel
// alleen status, rang en top-1. Verandert het CRI-oordeel van 'onbekend' naar 'groen' zonder dat
// de regelstatus kantelt — omdat een ánder veld al geel was en worstVerdict het slechtste veld
// neemt — dan ziet die vergelijking niets. "Geen verandering" is dan niet te onderscheiden van
// "de vulling komt niet aan".
//
// Dit script kijkt daarom naar de DEVIATIONS zelf, via exact hetzelfde pad als de eval:
// extractPagesFromPdf → parseSpecLinesFromPages → toSpecRequest → evaluateSpecLine.

import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractPagesFromPdf } from "@/lib/pdf/extract";
import { parseSpecLinesFromPages } from "@/lib/pdf/armaturenboek";
import { evaluateSpecLine, type SpecRequest } from "@/lib/matching/engine";
import { GRONDWAARHEID } from "./eval/grondwaarheid";
import { assertBranchDb, assertProductieDb, logGuard } from "./branch-guard";

const EVAL_DIR =
  process.env.EVAL_DIR ?? path.join(os.homedir(), "Downloads", "lumenlogic-testset");

// De vier raadhuis-regels met XAL-merk én CRI-eis — de enige die konden bewegen.
const CODES = ["Lr301", "Lr303", "Lw001", "Lw002"];

const naarProductie = process.argv.includes("--productie");

async function main() {
  const poort = naarProductie
    ? await assertProductieDb(process.cwd())
    : await assertBranchDb(process.cwd());
  if (naarProductie) console.log(`\n\ud83d\udd34 PRODUCTIE (read-only) — endpoint ${poort.endpoint}`);
  else logGuard(poort);
  const { db } = await import("@/db/client");
  const { brands } = await import("@/db/schema");
  const brandNames = (await db.select({ name: brands.name }).from(brands)).map((b) => b.name);

  const c = GRONDWAARHEID.find((g) => g.key === "raadhuis")!;
  const pages: string[] = [];
  for (const rel of c.pdfPaden) {
    const bytes = await readFile(path.join(EVAL_DIR, ...rel.split("/")));
    pages.push(...(await extractPagesFromPdf(new Uint8Array(bytes))));
  }
  const lines = parseSpecLinesFromPages(pages, brandNames).lines as unknown as Record<
    string,
    unknown
  >[];

  for (const code of CODES) {
    const l = lines.find((x) => x.fixtureCode === code);
    if (!l) {
      console.log(`\n${code}: niet gelezen uit de PDF`);
      continue;
    }
    const req: SpecRequest = {
      brandText: (l.brandText as string) ?? null,
      productText: (l.productText as string) ?? null,
      sku: null,
      specs: {
        kelvin: (l.reqKelvin as number) ?? null,
        cri: (l.reqCri as number) ?? null,
        ip: (l.reqIp as string) ?? null,
        watt: (l.reqWatt as number) ?? null,
        lumen: (l.reqLumen as number) ?? null,
        beamAngle: (l.reqBeamAngle as number) ?? null,
        sizeCm: null,
        shape: null,
        color: null,
        dimmable: (l.reqDimmable as string) ?? null,
      },
    };
    const uit = await evaluateSpecLine(db, req);
    // MatchOutcome kent geen `kandidaten`: lijst 1 heet `provable`, lijst 2 `incomplete`, en
    // `topDeviations` zijn de afwijkingen van de best passende kandidaat.
    const top = uit.provable[0] ?? uit.incomplete[0];
    console.log(`\n── ${code} · status ${uit.status} · vraagt CRI≥${req.specs.cri} ──`);
    console.log(`   aantoonbaar: ${uit.provable.length} · onvolledig: ${uit.incomplete.length}`);
    if (!top) {
      console.log(`   geen kandidaten in beide lijsten; topDeviations: ${uit.topDeviations.length}`);
      continue;
    }
    console.log(`   top-1: ${top.name?.slice(0, 60)} (cri-kolom: ${top.cri ?? "leeg"})`);
    const dev = (top.deviations ?? []) as { field: string; requested: unknown; delivered: unknown; verdict: string }[];
    for (const d of dev) {
      const merk = d.field === "cri" ? "   ← DIT VELD" : "";
      console.log(
        `     ${String(d.field).padEnd(11)} gevraagd ${String(d.requested).padEnd(7)} geleverd ${String(d.delivered ?? "—").padEnd(9)} → ${d.verdict}${merk}`,
      );
    }
    const criDev = dev.find((d) => d.field === "cri");
    if (!criDev) console.log("     ⚠️  GEEN cri-deviation — de matcher toetst dit veld niet");
    else if (criDev.verdict === "onbekend") console.log("     ⚠️  cri nog 'onbekend' — de vulling komt NIET aan");
    else console.log(`     ✓ cri wordt nu beoordeeld als '${criDev.verdict}' — de vulling werkt door`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
