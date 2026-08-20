// Import-laag (functioneel ontwerp §3.5, B-06/B-07). CSV/LLM-imports landen éérst als
// voorstel in `import_runs` — geparste regels zijn pas spec_lines ná menselijke
// bevestiging. PDF (deterministisch geparst) gaat direct het dossier in met de run als
// controlespoor. OCR óók direct (bewust besluit Timo 2026-07-15, plan-ocr-beeld-pdf):
// geen voorstel-scherm, maar élke OCR-regel krijgt een VERPLICHTE review (reviewKind
// 'ocr', het Tinder-deck met paginabeeld) — zo blijft "niets stilzwijgend weglaten"
// waar zonder dat de mens twee keer hetzelfde beoordeelt. De OCR-flow leeft in
// lib/repo/ocr.ts.
import { and, eq, inArray, isNull } from "drizzle-orm";
import { importRuns, specLines, type ImportRow } from "@/db/schema";
import { triggerVangnet } from "@/lib/ai/vangnet";
import { addSpecLines, type SpecLineInput } from "@/lib/repo/dossiers";
import { runMatcher } from "@/lib/repo/matching";
import type { AppDb } from "./db";
import { logEvent } from "./events";

// Alleen deze bronnen zijn een geldige spec_source (schema-enum). 'bestek' is een
// aantallen-koppeling, geen herkomst van een spec-regel → val terug op 'csv'.
const SPEC_SOURCES = new Set(["manual", "csv", "pdf", "ocr", "llm", "tabel"]);
type SpecSource = "manual" | "csv" | "pdf" | "ocr" | "llm" | "tabel";
function toSpecSource(s: string): SpecSource {
  return SPEC_SOURCES.has(s) ? (s as SpecSource) : "csv";
}

// Een voorstel-run aanmaken (status 'voorstel'). Niets wordt nog een spec-regel; de rows
// blijven als jsonb-snapshot bewaard tot de mens bevestigt.
export async function createImportRun(
  db: AppDb,
  input: {
    dossierId: string;
    source: string; // 'pdf' | 'ocr' | 'llm' | 'csv' | 'bestek'
    filename?: string | null;
    rows: ImportRow[];
    confidence?: string | null; // 'hoog' | 'middel' | 'laag'
    actor?: string;
  },
) {
  const rows = input.rows ?? [];
  const [run] = await db
    .insert(importRuns)
    .values({
      dossierId: input.dossierId,
      source: input.source,
      filename: input.filename ?? null,
      confidence: input.confidence ?? null,
      status: "voorstel",
      rows,
      counts: {
        total: rows.length,
        checked: rows.filter((r) => r.checked).length,
      },
      actor: input.actor ?? null,
    })
    .returning();
  await logEvent(db, {
    entity: "dossier",
    entityId: input.dossierId,
    action: "import_run_created",
    actor: input.actor,
    payload: {
      runId: run.id,
      source: input.source,
      rows: rows.length,
    },
  });
  return run;
}

// B2/stap 5: een PDF-import is géén voorstel — de regels zijn deterministisch geparst en
// gaan direct het dossier in (bestaand gedrag). De run bestaat als vaste plek voor het
// controlespoor: rows-snapshot, counts, bestandsnaam en de volledige tekstlaag als
// markdown (`raw_markdown`, cap ~2 MB). Status direct 'bevestigd'; de CSV-voorstel-flow
// (createImportRun + confirmImportRun) blijft ongewijzigd.
export async function recordPdfImport(
  db: AppDb,
  input: {
    dossierId: string;
    filename?: string | null;
    lines: SpecLineInput[];
    rawMarkdown: string;
    actor?: string;
  },
) {
  // Dunne wrapper sinds goal-import-meer-formaten: het gedeelde werk zit in
  // recordImport hieronder. Gedrag is bewust byte-identiek aan vóór de
  // generalisatie (run-insert, addSpecLines, matcher-lus, event, vangnet — in
  // precies die volgorde); lib/repo/imports.test.ts bewijst het.
  return recordImport(db, {
    ...input,
    source: "pdf",
    reviewKind: null,
    vangnet: true,
  });
}

// Tabel-import (xlsx/csv/docx-tabellen): zelfde directe route als PDF — de rijen
// zijn deterministisch gelezen, geen voorstel-scherm — maar élke regel krijgt een
// VERPLICHTE review (reviewKind 'tabel', "Read from row N"), zoals de OCR-flow.
// Daarom óók geen vangnet-trigger hier (B8-redenering uit lib/repo/ocr.ts): geen
// machinaal gelezen merk mag de merkvergrendelde zoektool sturen vóór een mens de
// bron zag. rawMarkdown = de rijen als markdown-tabel (lib/table/parse-rows.ts).
//
// existingRunId: het gechunkte pad heeft de run al bij startTableImport aangemaakt
// (status 'voorstel' = upload loopt); dan vullen we díe run en zetten hem op
// 'bevestigd'. Zonder existingRunId (het >15 MB-pad met client-gelezen rijen)
// ontstaat de run hier, zoals bij PDF.
export async function recordTableImport(
  db: AppDb,
  input: {
    dossierId: string;
    filename?: string | null;
    lines: SpecLineInput[];
    rawMarkdown: string;
    existingRunId?: string;
    actor?: string;
  },
) {
  const result = await recordImport(db, {
    ...input,
    source: "tabel",
    reviewKind: "tabel",
    vangnet: false,
  });
  await logEvent(db, {
    entity: "import_run",
    entityId: result.run.id,
    action: "tabel_import_done",
    actor: input.actor,
    payload: {
      dossierId: input.dossierId,
      filename: input.filename ?? null,
      rows: input.lines.length,
    },
  });
  return result;
}

// Het gedeelde werk van de directe importroutes (pdf/tabel). Volgorde is dezelfde
// als het oorspronkelijke recordPdfImport en om dezelfde reden als confirmImportRun
// (A9): eerst de run onomkeerbaar, dan de regels, dan pas de matcher — er is geen
// transactie om op terug te vallen (neon-http).
async function recordImport(
  db: AppDb,
  input: {
    dossierId: string;
    source: "pdf" | "tabel";
    filename?: string | null;
    lines: SpecLineInput[];
    rawMarkdown: string;
    existingRunId?: string;
    // 'tabel' → elke nieuwe regel ZONDER bestaand reviewKind krijgt deze verplichte
    // review (B7-regel: één regel draagt hooguit één review-reden — een matcher-geel
    // of variant-flag die de matcher-lus net zette blijft staan).
    reviewKind: "tabel" | null;
    vangnet: boolean;
    actor?: string;
  },
) {
  const rows: ImportRow[] = input.lines.map((l) => ({
    fixtureCode: l.fixtureCode,
    quantity: l.quantity ?? null,
    brandText: l.brandText ?? null,
    productText: l.productText ?? null,
    reqArticleCode: l.reqArticleCode ?? null,
    zone: l.zone ?? null,
    specs: {
      ...(l.reqKelvin != null ? { kelvin: l.reqKelvin } : {}),
      ...(l.reqCri != null ? { cri: l.reqCri } : {}),
      ...(l.reqIp != null ? { ip: l.reqIp } : {}),
      ...(l.reqWatt != null ? { watt: l.reqWatt } : {}),
      ...(l.reqLumen != null ? { lumen: l.reqLumen } : {}),
      ...(l.reqBeamAngle != null ? { beamAngle: l.reqBeamAngle } : {}),
      ...(l.reqDimmable != null ? { dimmable: l.reqDimmable } : {}),
    },
    // sourcePage (bij tabel: het rijnummer) mee in het snapshot, zodat het
    // controlespoor per rij blijft tonen waar hij vandaan kwam (B-07).
    ...(l.sourcePage != null ? { page: l.sourcePage } : {}),
    source: input.source,
    checked: true, // deterministisch geparst → alles telt als bevestigd
  }));

  let run: typeof importRuns.$inferSelect;
  if (input.existingRunId) {
    // Gechunkt pad: de run bestaat al (startTableImport, status 'voorstel' zolang
    // de upload loopt) — hier wordt hij gevuld en onomkeerbaar 'bevestigd'.
    const [updated] = await db
      .update(importRuns)
      .set({
        status: "bevestigd",
        rows,
        counts: { total: rows.length, checked: rows.length },
        rawMarkdown: input.rawMarkdown,
        actor: input.actor ?? null,
        updatedAt: new Date(),
      })
      .where(eq(importRuns.id, input.existingRunId))
      .returning();
    if (!updated) throw new Error(`import run ${input.existingRunId} not found`);
    run = updated;
  } else {
    const [inserted] = await db
      .insert(importRuns)
      .values({
        dossierId: input.dossierId,
        source: input.source,
        filename: input.filename ?? null,
        status: "bevestigd",
        rows,
        counts: { total: rows.length, checked: rows.length },
        rawMarkdown: input.rawMarkdown,
        actor: input.actor ?? null,
      })
      .returning();
    run = inserted;
  }

  const created = input.lines.length
    ? await addSpecLines(
        db,
        input.dossierId,
        input.lines.map((l) => ({
          ...l,
          source: input.source,
          importRunId: run.id,
        })),
      )
    : [];
  for (const line of created) {
    await runMatcher(db, line.id, input.actor);
  }

  // Verplichte review (tabel): NÁ de matcher-lus, alleen op regels die dan nog géén
  // reviewKind dragen — een matcher-geel of variant-flag blijft staan en dekt beide
  // besluiten (B7-regel, zelfde constructie als de OCR-flow).
  if (input.reviewKind && created.length) {
    await db
      .update(specLines)
      .set({ reviewKind: input.reviewKind, updatedAt: new Date() })
      .where(
        and(
          inArray(
            specLines.id,
            created.map((l) => l.id),
          ),
          isNull(specLines.reviewKind),
        ),
      );
  }

  await logEvent(db, {
    entity: "dossier",
    entityId: input.dossierId,
    action: "import_run_created",
    actor: input.actor,
    payload: {
      runId: run.id,
      source: input.source,
      rows: rows.length,
      status: "bevestigd",
    },
  });

  // AI-vangnet (stap 8): tweede pass over de restregels. In een Next-request draait het
  // via after() ná de response (import blokkeert er niet meer op); in tests/scripts
  // awaited met vangrails — fouten worden een ai_vangnet_failed-event, zonder key een
  // skip-event; de import faalt er nooit door. Bij de tabel-route staat hij UIT
  // (B8-redenering: eerst de mens, zie recordTableImport).
  if (input.vangnet) {
    await triggerVangnet(db, input.dossierId, input.actor);
  }

  return { run, created };
}

export async function getImportRun(db: AppDb, runId: string) {
  const [row] = await db
    .select()
    .from(importRuns)
    .where(eq(importRuns.id, runId))
    .limit(1);
  return row ?? null;
}

// Eén ImportRow → SpecLineInput. Herkomst (source/confidence/page) wordt overgenomen zodat
// de regel op het scherm blijft tonen waar hij vandaan komt (B-07).
function rowToSpecLine(
  row: ImportRow,
  runId: string,
  confidence: string | null,
): SpecLineInput {
  const s = row.specs ?? {};
  return {
    fixtureCode: row.fixtureCode,
    quantity: row.quantity ?? null,
    zone: row.zone ?? null,
    brandText: row.brandText ?? null,
    productText: row.productText ?? null,
    reqArticleCode: row.reqArticleCode ?? null,
    reqKelvin: s.kelvin ?? null,
    reqCri: s.cri ?? null,
    reqIp: s.ip ?? null,
    reqWatt: s.watt ?? null,
    reqLumen: s.lumen ?? null,
    reqBeamAngle: s.beamAngle ?? null,
    reqSizeCm: s.sizeCm ?? null,
    reqShape: s.shape ?? null,
    reqColor: s.color ?? null,
    reqDimmable: s.dimmable ?? null,
    source: toSpecSource(row.source),
    sourceConfidence: confidence,
    sourcePage: row.page ?? null,
    importRunId: runId,
  };
}

// Bevestigen: maak spec_lines van de AANGEVINKTE rows (indices in run.rows), draai de
// matcher per nieuwe regel, en zet de run op 'bevestigd'. Idempotent: een run die al
// bevestigd/geannuleerd is doet niets meer (re-run is veilig).
export async function confirmImportRun(
  db: AppDb,
  runId: string,
  checkedIndices: number[],
  actor?: string,
) {
  const run = await getImportRun(db, runId);
  if (!run) throw new Error(`import run ${runId} not found`);
  // Atomaire claim (fix 20 aug 2026): de status-check was lees-dan-schrijf, dus twee
  // gelijktijdige bevestigingen (dubbelklik, twee tabbladen) lazen allebei 'voorstel'
  // en maakten allebei regels aan. Eén UPDATE met de status in de WHERE is per
  // statement atomair in Postgres — geen transactie nodig (db.transaction() gooit op
  // neon-http, zie A9 hieronder). Alleen de aanroep die daadwerkelijk de rij raakte
  // (RETURNING niet leeg) maakt regels; de verliezer krijgt dezelfde nette
  // "al bevestigd"-uitkomst als het sequentiële pad. Crasht addSpecLines ná de claim,
  // dan blijft de run bewust op 'bevestigen_bezig' hangen — geen automatische reset,
  // want een herpoging die regels dubbel aanmaakt is duurder dan een run die een
  // beheerder moet losmaken (verdubbelde aantallen zijn wat de klant betaalt).
  const claimed = await db
    .update(importRuns)
    .set({ status: "bevestigen_bezig", updatedAt: new Date() })
    .where(and(eq(importRuns.id, runId), eq(importRuns.status, "voorstel")))
    .returning({ id: importRuns.id });
  if (claimed.length === 0) {
    return { created: [] as Awaited<ReturnType<typeof addSpecLines>> };
  }

  const rows = (run.rows ?? []) as ImportRow[];
  // gesorteerd + uniek + binnen bereik → aanvraagvolgorde blijft behouden (regel: nooit
  // hersorteren), dubbele aanvinkingen tellen één keer.
  const picked = [...new Set(checkedIndices)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < rows.length)
    .sort((a, b) => a - b)
    .map((i) => rows[i]);

  const inputs = picked.map((r) => rowToSpecLine(r, runId, run.confidence));
  const created = inputs.length
    ? await addSpecLines(db, run.dossierId, inputs)
    : [];

  // A9 (reviewzwerm 2.5a, bewezen): de run gaat op 'bevestigd' zodra de regels bestáán,
  // NIET pas na de matcher-lus. De volgorde was andersom, en er is geen transactie om
  // op terug te vallen — db.transaction() gooit op neon-http (zie price-archive.ts:
  // "groene tests, kapotte app"). Crashte runMatcher halverwege (reëel: engine.ts
  // documenteert zelf "invalid input syntax for type integer" en `ORDER BY 0`), dan
  // stonden de tien regels er al terwijl de run op 'voorstel' bleef staan — en de
  // gebruiker die nogmaals op Bevestigen klikte kreeg er tien bij. Gemeten: 1 regel na
  // de crash, 2 na de tweede poging. Verdubbelde aantallen zijn wat de klant betaalt.
  // De idempotentie-poort is dus alleen iets waard als de vlag valt op het moment dat
  // de regels onomkeerbaar zijn. De atomaire claim hierboven ('bevestigen_bezig') staat
  // daar als extra poort vóór: hij wint de race, deze update sluit hem af.
  await db
    .update(importRuns)
    .set({ status: "bevestigd", actor: actor ?? run.actor, updatedAt: new Date() })
    .where(eq(importRuns.id, runId));

  await logEvent(db, {
    entity: "dossier",
    entityId: run.dossierId,
    action: "import_run_confirmed",
    actor,
    payload: { runId, added: created.length, ofRows: rows.length },
  });

  // Pas hierna matchen. Een matcher-fout laat de aanroeper nog steeds klappen — dat
  // mag luidruchtig blijven — maar kost geen regels meer: ze staan er één keer, met
  // status 'open', en zijn opnieuw te matchen vanaf het regel-detail.
  for (const line of created) {
    await runMatcher(db, line.id, actor);
  }

  // AI-vangnet (stap 8): zelfde niet-blokkerende trigger als bij de PDF-import.
  await triggerVangnet(db, run.dossierId, actor);

  return { created };
}

// Annuleren: run op 'geannuleerd', er ontstaat geen enkele spec-regel.
export async function cancelImportRun(db: AppDb, runId: string, actor?: string) {
  const run = await getImportRun(db, runId);
  if (!run) throw new Error(`import run ${runId} not found`);
  await db
    .update(importRuns)
    .set({ status: "geannuleerd", updatedAt: new Date() })
    .where(eq(importRuns.id, runId));
  await logEvent(db, {
    entity: "dossier",
    entityId: run.dossierId,
    action: "import_run_cancelled",
    actor,
    payload: { runId },
  });
}

export type { ImportRow };
