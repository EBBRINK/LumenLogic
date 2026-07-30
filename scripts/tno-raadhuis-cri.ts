// Twee populaties, twee rollen — en ze geven andere cijfers. STRIKT READ-ONLY.
//
//   bun --env-file=.env.branch scripts/tno-raadhuis-cri.ts
//
// 1. VERSE PARSE uit de PDF (extractPagesFromPdf → parseSpecLinesFromPages). Dit is wat
//    scripts/eval-testset.ts doet en dus wat de nul- en nameting meten. Voor de vraag "beweegt
//    tno?" is uitsluitend deze populatie relevant.
// 2. OPGESLAGEN spec_lines in de database. Dit is wat publishRun daadwerkelijk hermatcht en wat
//    een gebruiker in de app ziet. Voor de vraag "wat raakt de publish?" telt deze populatie.
//
// Ze lopen uiteen omdat de verse parse regels mist die wél zijn opgeslagen (via de AI-route of
// met de hand), en omdat opgeslagen regels muteren als iemand ze in de UI aanpast.

import { inArray } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { specLines } from "@/db/schema";
import { extractPagesFromPdf } from "@/lib/pdf/extract";
import { parseSpecLinesFromPages } from "@/lib/pdf/armaturenboek";
import { GRONDWAARHEID } from "./eval/grondwaarheid";
import { assertBranchDb, logGuard } from "./branch-guard";

const EVAL_DIR =
  process.env.EVAL_DIR ?? path.join(os.homedir(), "Downloads", "lumenlogic-testset");

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { brands } = await import("@/db/schema");
  const brandNames = (await db.select({ name: brands.name }).from(brands)).map((b) => b.name);

  for (const key of ["raadhuis", "tno"] as const) {
    const c = GRONDWAARHEID.find((g) => g.key === key)!;

    // ── 1. verse parse ────────────────────────────────────────────────────────
    const pages: string[] = [];
    for (const rel of c.pdfPaden) {
      const bytes = await readFile(path.join(EVAL_DIR, ...rel.split("/")));
      pages.push(...(await extractPagesFromPdf(new Uint8Array(bytes))));
    }
    const vers = parseSpecLinesFromPages(pages, brandNames).lines as unknown as Record<
      string,
      unknown
    >[];
    const versCri = vers.filter((l) => l.reqCri != null);
    const versDim = vers.filter((l) => l.reqDimmable != null);

    // ── 2. opgeslagen regels, PER DOSSIER ──────────────────────────────────────
    // Niet op fixtureCode filteren: codes als 'Lr301' komen in meerdere dossiers voor, dus dat
    // telt vreemde projecten mee (eerste versie van dit script deed dat en gaf 76 tno-regels
    // in plaats van het werkelijke aantal). Elke spec-regel hangt aan één projectDossier
    // (schema.ts:470); we kiezen het dossier waar de meeste codes van deze case in zitten.
    const codes = [...c.codes, ...(c.bekendeExtraCodes ?? [])];
    const kandidaten = await db
      .select({
        dossierId: specLines.dossierId,
        fixtureCode: specLines.fixtureCode,
        reqCri: specLines.reqCri,
        reqDimmable: specLines.reqDimmable,
        status: specLines.status,
      })
      .from(specLines)
      .where(inArray(specLines.fixtureCode, codes));

    const perDossier = new Map<string, typeof kandidaten>();
    for (const l of kandidaten) {
      const k = String(l.dossierId);
      perDossier.set(k, [...(perDossier.get(k) ?? []), l]);
    }
    const gesorteerd = [...perDossier].sort((a, b) => b[1].length - a[1].length);
    console.log(
      `\n[${key}] dossiers met deze codes: ${gesorteerd.length}` +
        ` (${gesorteerd.map(([, v]) => v.length).join(", ")} regels) — grootste telt als de case`,
    );
    const opgeslagen = gesorteerd[0]?.[1] ?? [];
    const opgCri = opgeslagen.filter((l) => l.reqCri != null);
    const opgDim = opgeslagen.filter((l) => l.reqDimmable != null);

    console.log(`\n══ ${key} ══`);
    console.log(
      `  verse parse    : ${vers.length} regels · CRI-eis op ${versCri.length} · dimbaar op ${versDim.length}`,
    );
    console.log(
      `  opgeslagen     : ${opgeslagen.length} regels · CRI-eis op ${opgCri.length} · dimbaar op ${opgDim.length}`,
    );
    if (opgCri.length > 0) {
      const per = new Map<number, string[]>();
      for (const l of opgCri) {
        const w = l.reqCri as number;
        per.set(w, [...(per.get(w) ?? []), `${l.fixtureCode}(${l.status})`]);
      }
      for (const [w, cs] of [...per].sort((a, b) => a[0] - b[0])) {
        console.log(`    opgeslagen CRI≥${w}: ${cs.join(", ")}`);
      }
    }
    // Regels die alleen in één populatie zitten — daar zit de verklaring van het verschil.
    const versCodes = new Set(vers.map((l) => String(l.fixtureCode)));
    const opgCodes = new Set(opgeslagen.map((l) => String(l.fixtureCode)));
    const alleenOpg = [...opgCodes].filter((x) => !versCodes.has(x));
    if (alleenOpg.length) console.log(`    alleen opgeslagen (niet in verse parse): ${alleenOpg.join(", ")}`);
  }
  console.log();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
