// Welke specs vrágen de testcases eigenlijk? (meetpunt 5 uit
// docs/probleem-lege-speckolommen-xal.md) Zonder dit weten we niet of de CRI-vulling die cases
// überhaupt kan raken.
//
// STRIKT READ-ONLY: het leest de testset-PDF's via exact het parse-pad van
// scripts/eval-testset.ts (extractPagesFromPdf → parseSpecLinesFromPages) en doet één select
// op brands. Beide zijn wezenlijk: de PDF-paden komen uit GRONDWAARHEID (niet "alle PDF's in de
// map") en parseSpecLinesFromPages heeft de échte merknamenlijst nodig — met een lege lijst
// leest raadhuis 0 regels in plaats van 31.
//
//   bun --env-file=.env.branch scripts/spec-eisen-testset.ts

import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractPagesFromPdf } from "@/lib/pdf/extract";
import { parseSpecLinesFromPages } from "@/lib/pdf/armaturenboek";
import { GRONDWAARHEID } from "./eval/grondwaarheid";
import { assertBranchDb, logGuard } from "./branch-guard";

const EVAL_DIR =
  process.env.EVAL_DIR ?? path.join(os.homedir(), "Downloads", "lumenlogic-testset");

// Alleen de twee cases die zonder --ai regels opleveren; kvk en dordrecht lezen er nul.
const CASES = ["raadhuis", "tno"];

const EISEN = [
  ["reqCri", "CRI"],
  ["reqKelvin", "kelvin"],
  ["reqWatt", "watt"],
  ["reqLumen", "lumen"],
  ["reqIp", "IP"],
  ["reqBeamAngle", "beam"],
  ["reqDimmable", "dimbaar"],
] as const;

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { brands } = await import("@/db/schema");
  const brandNames = (await db.select({ name: brands.name }).from(brands)).map((b) => b.name);

  for (const key of CASES) {
    const c = GRONDWAARHEID.find((g) => g.key === key)!;
    const pages: string[] = [];
    for (const rel of c.pdfPaden) {
      const bytes = await readFile(path.join(EVAL_DIR, ...rel.split("/")));
      pages.push(...(await extractPagesFromPdf(new Uint8Array(bytes))));
    }
    const parsed = parseSpecLinesFromPages(pages, brandNames);
    const lines = parsed.lines as unknown as Record<string, unknown>[];

    const tel: Record<string, number> = {};
    for (const l of lines) {
      for (const [veld] of EISEN) {
        const v = l[veld];
        if (v != null && v !== "") tel[veld] = (tel[veld] ?? 0) + 1;
      }
    }

    console.log(`\n── ${key} · ${lines.length} regels gelezen ──`);
    for (const [veld, label] of EISEN) {
      const n = tel[veld] ?? 0;
      console.log(`  ${label.padEnd(8)} gevraagd op ${String(n).padStart(3)} regels`);
    }
    const metCri = lines.filter((l) => l.reqCri != null);
    if (metCri.length > 0) {
      // Verdeling van de gevraagde CRI-waarden — bepaalt of een gevulde kolom groen of rood wordt.
      const perWaarde = new Map<number, string[]>();
      for (const l of metCri) {
        const w = l.reqCri as number;
        perWaarde.set(w, [...(perWaarde.get(w) ?? []), String(l.fixtureCode)]);
      }
      for (const [w, codes] of [...perWaarde].sort((a, b) => a[0] - b[0])) {
        console.log(`    CRI≥${w}: ${codes.length} regels — ${codes.join(", ")}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
