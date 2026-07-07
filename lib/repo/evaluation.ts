// Evaluatieset-harness (H-07, K-06): de meetlat van de matcher.
//
// Een evaluatieset is een verzameling échte spec-regels (brand/product/specs) met een
// door mensen vastgestelde VERWACHTE status. `measureHitRate` draait de matcher
// (lib/matching/engine.ts) voor elke regel tegen de HUIDIGE catalogus, vergelijkt de
// uitkomst met de verwachte status, en legt de score + per-regel-diff vast in
// evaluation_runs. Zo zie je bij elke wijziging aan de tolerantietabel of de zoeklaag
// of de kwaliteit vooruit of achteruit ging — de "score over tijd".
//
// De harness leest alleen (matcher + catalogus) en schrijft alleen naar de eval-tabellen;
// hij raakt nooit spec_lines of de statustoekenning aan.

import { asc } from "drizzle-orm";
import { evaluationLines, evaluationRuns } from "@/db/schema";
import type { AppDb } from "./db";
import {
  evaluateSpecLine,
  type MatchStatus,
  type SpecRequest,
} from "@/lib/matching/engine";
import type { RequestedSpecs } from "@/lib/matching/tolerances";

export type EvaluationLineInput = {
  fixtureCode: string;
  brandText?: string | null;
  productText?: string | null;
  // vrije jsonb met gevraagde specs; numerieke velden mogen als getal of string binnenkomen
  specs?: Record<string, string | number> | null;
  expectedStatus: MatchStatus;
  note?: string | null;
};

export type EvaluationResult = {
  lineId: string;
  expected: string;
  got: string;
  hit: boolean;
};

// De numerieke vs. tekstuele gevraagde velden (spiegelt RequestedSpecs uit tolerances.ts).
const NUMERIC_SPEC_FIELDS = [
  "kelvin",
  "cri",
  "watt",
  "lumen",
  "beamAngle",
  "sizeCm",
] as const;
const STRING_SPEC_FIELDS = ["ip", "shape", "color", "dimmable"] as const;

// De losse jsonb-specs van een evaluatieregel omzetten naar het strakke RequestedSpecs-type
// dat de matcher verwacht. Onbekende sleutels worden genegeerd; lege/ongeldige waarden
// vallen weg (een leeg veld is geen matcheis).
function toRequestedSpecs(
  specs: Record<string, string | number> | null | undefined,
): RequestedSpecs {
  const out: Record<string, number | string> = {};
  if (!specs) return out as RequestedSpecs;
  for (const f of NUMERIC_SPEC_FIELDS) {
    const v = specs[f];
    if (v == null || v === "") continue;
    const n = Number(v);
    if (!Number.isNaN(n)) out[f] = n;
  }
  for (const f of STRING_SPEC_FIELDS) {
    const v = specs[f];
    if (v == null || v === "") continue;
    out[f] = String(v);
  }
  return out as RequestedSpecs;
}

// Regels aan de evaluatieset toevoegen. Retourneert de opgeslagen rijen.
export async function addEvaluationLines(
  db: AppDb,
  lines: EvaluationLineInput[],
) {
  if (lines.length === 0) return [];
  return db
    .insert(evaluationLines)
    .values(
      lines.map((l) => ({
        fixtureCode: l.fixtureCode,
        brandText: l.brandText ?? null,
        productText: l.productText ?? null,
        specs: l.specs ?? null,
        expectedStatus: l.expectedStatus,
        note: l.note ?? null,
      })),
    )
    .returning();
}

// Alle evaluatieregels (in aanmaakvolgorde).
export async function listEvaluationLines(db: AppDb) {
  return db
    .select()
    .from(evaluationLines)
    .orderBy(asc(evaluationLines.createdAt));
}

// De meting: draai de matcher voor elke evaluatieregel tegen de huidige catalogus,
// vergelijk met de verwachte status, bereken de hit-rate en leg een evaluation_runs-rij vast.
//
// 'open'-behandeling (belangrijk): de matcher geeft status 'open' wanneer er alleen
// data-onvolledige kandidaten zijn (mens moet met reden kiezen) — dus "geen eenduidige
// match". We vergelijken statussen STRIKT op gelijkheid: een regel telt alleen als hit
// wanneer expected === got exact. 'open' wordt dus niet stilzwijgend op een andere
// status geplooid: een 'open'-uitkomst tegen een concrete verwachte status (groen/geel/…)
// is altijd een miss, en 'open' telt alleen als hit als de regel expliciet 'open' verwacht.
export async function measureHitRate(
  db: AppDb,
  label: string,
): Promise<{ hitRate: number; results: EvaluationResult[] }> {
  const lines = await listEvaluationLines(db);

  const results: EvaluationResult[] = [];
  let hits = 0;
  for (const line of lines) {
    const req: SpecRequest = {
      brandText: line.brandText,
      productText: line.productText,
      specs: toRequestedSpecs(line.specs),
    };
    const outcome = await evaluateSpecLine(db, req);
    const expected = line.expectedStatus as string;
    const got = outcome.status as string;
    const hit = got === expected; // strikte gelijkheid — zie 'open'-notitie hierboven
    if (hit) hits++;
    results.push({ lineId: line.id, expected, got, hit });
  }

  const total = lines.length;
  const hitRate = total > 0 ? hits / total : 0;

  await db.insert(evaluationRuns).values({
    label,
    hitRate: hitRate.toFixed(4), // numeric(5,4) → als string opslaan
    results,
  });

  return { hitRate, results };
}

// Alle metingen, oudste eerst — voor de "score over tijd"-weergave.
export async function listEvaluationRuns(db: AppDb) {
  return db
    .select()
    .from(evaluationRuns)
    .orderBy(asc(evaluationRuns.createdAt));
}
