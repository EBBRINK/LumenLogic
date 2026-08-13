// Sprint M1 — het terugstuur-endpoint: ontvangt het antwoordcontract uit
// docs/goal-agent-matching.md (per regel) voor één geclaimde job, en schrijft het via
// de repo-laag weg (lib/repo/matchstation.ts) — nooit rechtstreeks SQL, precies wat
// docs/plan-matchstation-eigen-machine.md als "afgevallen optie" benoemt.
//
// Volgorde (docs/INVOERVALIDATIE.md): machine-auth eerst (het equivalent van
// requireSession()), dan de zod-parse, dan pas de repo. Regels worden in de
// meegegeven volgorde toegepast — dat is bewust, want het kostenplafond (M1-eis 4)
// kapt de REST van de batch af zodra het geraakt wordt, en "rest" veronderstelt een
// volgorde.
import { db } from "@/db/client";
import { logEvent } from "@/lib/repo/events";
import {
  applyMatchstationResult,
  getQueueJob,
  markJobProcessed,
  MATCHSTATION_UITKOMSTEN,
  type MatchstationLineResult,
} from "@/lib/repo/matchstation";
import { verifyMachineKey } from "@/lib/machine-auth";
import { parseJson, z, zEnumFrom, zUuid } from "@/lib/validation";

export const dynamic = "force-dynamic";

const alternatiefSchema = z.object({
  product_id: zUuid,
  artikelnummer: z.string().nullable().optional(),
  prijs: z.string().nullable().optional(),
  verschil: z.string().nullable().optional(),
});

const specGetoetstSchema = z.object({
  veld: z.string(),
  gevraagd: z.unknown().optional(),
  gevonden: z.unknown().optional(),
  oordeel: zEnumFrom(["groen", "geel", "rood", "onbekend"] as const).optional(),
});

const bewijsSchema = z.object({
  merk_bevestigd: z.string().nullable().optional(),
  naam_treffer: zEnumFrom(["exact", "bijna", "serie"] as const).nullable().optional(),
  specs_getoetst: z.array(specGetoetstSchema).max(20).optional(),
  kandidaten_over: z.number().int().nullable().optional(),
});

// specLineId (bestaande regel vullen) óf fixtureCode (regel ter plekke aanmaken) is
// verplicht — zie de kop van lib/repo/matchstation.ts voor waarom er twee paden zijn.
const regelSchema = z
  .object({
    spec_line_id: zUuid.optional(),
    fixture_code: z.string().trim().min(1).max(100).optional(),
    brand_text: z.string().trim().nullable().optional(),
    product_text: z.string().trim().nullable().optional(),
    quantity: z.number().int().positive().nullable().optional(),
    uitkomst: zEnumFrom(MATCHSTATION_UITKOMSTEN),
    product_id: zUuid.nullable().optional(),
    artikelnummer: z.string().nullable().optional(),
    prijs: z.string().nullable().optional(),
    prijs_vast: z.boolean().nullable().optional(),
    alternatieven: z.array(alternatiefSchema).max(20).optional(),
    bewijs: bewijsSchema.nullable().optional(),
    toelichting: z.string().max(2000).nullable().optional(),
    cost_eur: z.number().min(0).max(100).nullable().optional(),
  })
  .refine((v) => Boolean(v.spec_line_id || v.fixture_code), {
    message: "spec_line_id of fixture_code is verplicht",
  });

const resultaatBodySchema = z.object({
  queue_id: zUuid,
  regels: z.array(regelSchema).min(1).max(500),
});

function naarLineResult(r: z.infer<typeof regelSchema>): MatchstationLineResult {
  return {
    specLineId: r.spec_line_id ?? null,
    fixtureCode: r.fixture_code ?? null,
    brandText: r.brand_text ?? null,
    productText: r.product_text ?? null,
    quantity: r.quantity ?? null,
    uitkomst: r.uitkomst,
    productId: r.product_id ?? null,
    artikelnummer: r.artikelnummer ?? null,
    prijs: r.prijs ?? null,
    prijsVast: r.prijs_vast ?? null,
    alternatieven: (r.alternatieven ?? []).map((a) => ({
      productId: a.product_id,
      artikelnummer: a.artikelnummer ?? null,
      prijs: a.prijs ?? null,
      verschil: a.verschil ?? null,
    })),
    bewijs: r.bewijs
      ? {
          merkBevestigd: r.bewijs.merk_bevestigd ?? null,
          naamTreffer: r.bewijs.naam_treffer ?? null,
          specsGetoetst: (r.bewijs.specs_getoetst ?? []).map((s) => ({
            veld: s.veld,
            gevraagd: s.gevraagd,
            gevonden: s.gevonden,
            oordeel: s.oordeel,
          })),
          kandidatenOver: r.bewijs.kandidaten_over ?? null,
        }
      : null,
    toelichting: r.toelichting ?? null,
    costEur: r.cost_eur ?? null,
  };
}

export async function POST(request: Request) {
  const auth = await verifyMachineKey(request.headers.get("x-matchstation-key"));
  if (!auth.ok) {
    await logEvent(db, {
      entity: "matchstation",
      action: "matchstation_auth_denied",
      payload: { reason: auth.reason, route: "resultaat" },
    });
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    // Regel 3 (INVOERVALIDATIE.md): een kapotte body is invoerfout, geen 500.
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = parseJson(resultaatBodySchema, raw);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const job = await getQueueJob(db, parsed.data.queue_id);
  if (!job || job.status !== "geclaimd") {
    return Response.json({ error: "unknown_or_unclaimed_job" }, { status: 409 });
  }

  const uitkomsten: Array<{ specLineId: string | null; applied: string; status?: string; reviewKind?: string | null }> = [];
  for (const regel of parsed.data.regels) {
    const out = await applyMatchstationResult(db, {
      queueId: job.id,
      dossierId: job.dossierId,
      result: naarLineResult(regel),
    });
    uitkomsten.push(
      out.applied === "skipped"
        ? { specLineId: null, applied: out.applied }
        : { specLineId: out.specLineId, applied: out.applied, status: "status" in out ? out.status : undefined, reviewKind: "reviewKind" in out ? out.reviewKind : undefined },
    );
  }

  await markJobProcessed(db, job.id);

  return Response.json({ queueId: job.id, verwerkt: uitkomsten.length, uitkomsten });
}
