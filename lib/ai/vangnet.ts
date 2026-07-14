// AI-vangnet (plan stap 8, B4): automatische tweede pass over ónopgeloste regels na een
// import of hermatch. De AI doet uitsluitend SUGGESTIES — hij keurt nooit goed, wijzigt
// nooit status/reviewKind/matchedProductId en komt nooit voorbij de kandidaten-stap.
//
// BELANGRIJK: dit bestand importeert lib/matching/engine.ts NIET en mag dat nooit gaan
// doen. De matcher-engine blijft LLM-vrij en fase-vrij (masterplan-besluit 8); alle
// fase-logica van het vangnet leeft hier, in de vangnet-laag.
//
// Ijzeren regels die hier afgedwongen worden:
//   • Regel 2: de zoek-tool sorteert NOOIT op prijs en de toolresultaten bevatten geen
//     prijs — de AI heeft geen prijs nodig en krijgt hem dus niet.
//   • Regel 3: álle tool-queries lezen uitsluitend uit de view `visible_products`
//     (zelfde patroon als lib/repo/products.ts) — een verlopen product bestaat niet.
//   • Regel 4 (fase-grens, reviewer-bevinding 1): in tender-fase zoekt de AI uitsluitend
//     het GEVRAAGDE product — de zoek-tool wordt server-side vergrendeld op het gevraagde
//     merk van de regel (brandText) en product_detail weigert producten van een ander
//     merk. Suggesties voor andere merken bestaan alleen bij phase 'awarded'. Dit zit in
//     de tool-IMPLEMENTATIE, niet alleen in de prompt.
//   • Regel 5: elke zoekactie, suggestie, discard, skip en fout wordt gelogd in events.
import type AnthropicSdk from "@anthropic-ai/sdk";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  isNotNull,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import {
  aiSuggestions,
  llmUsage,
  projectDossiers,
  specLines,
  visibleProducts,
} from "@/db/schema";
import type { AppDb } from "@/lib/repo/db";
import { logEvent } from "@/lib/repo/events";
import { getLlmSpend, getSetting } from "@/lib/repo/settings";

// Klein en goedkoop model — het vangnet is een catalogus-zoeker, geen redeneerklus.
export const VANGNET_MODEL = "claude-haiku-4-5-20251001";
export const VANGNET_ACTOR = "ai:vangnet";
// Tokenhuishouding: bescheiden output-plafond per call en een hard plafond op het
// aantal beurten per regel — een regel kost zo hooguit enkele duizenden tokens.
const MAX_TOKENS_PER_CALL = 700;
const MAX_TURNS_PER_LINE = 6;
const MAX_SUGGESTIONS_PER_LINE = 3;
const SEARCH_LIMIT = 8;
// Tijdgrenzen: de run wordt awaited in de import-/edit-respons, dus hangen mag niet.
// Per API-call 30 s (SDK-default is ~10 min) met hooguit één retry; per run een harde
// grens — overschreden tussen regels → run stopt netjes met een skip-event, de rest
// van de regels komt bij de volgende import/hermatch vanzelf weer aan de beurt.
const CALL_TIMEOUT_MS = 30_000;
export const VANGNET_MAX_MS = 120_000;
// Kosten per miljoen tokens voor claude-haiku-4-5 ($1 in / $5 uit); we rekenen bewust
// conservatief 1 USD ≈ 1 EUR zodat de budgetteller (llm_usage.cost_eur, L-06) nooit
// te laag telt.
const EUR_PER_MTOK_IN = 1.0;
const EUR_PER_MTOK_OUT = 5.0;

// ── Injecteerbare client ─────────────────────────────────────────────────────
// Minimale doorsnede van de Anthropic Messages-API zodat tests een mock injecteren en
// de runtime de echte SDK gebruikt. Geen key → het vangnet slaat netjes over.
export type VangnetToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};
export type VangnetContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
export type VangnetMessageParam = {
  role: "user" | "assistant";
  content:
    | string
    | Array<
        | VangnetContentBlock
        | { type: "tool_result"; tool_use_id: string; content: string }
      >;
};
export type VangnetMessageParams = {
  model: string;
  max_tokens: number;
  system: string;
  tools: VangnetToolDef[];
  messages: VangnetMessageParam[];
};
export type VangnetResponse = {
  content: VangnetContentBlock[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
};
export interface VangnetClient {
  createMessage(params: VangnetMessageParams): Promise<VangnetResponse>;
}

// Echte client op basis van de SDK. Dynamische import: de SDK wordt pas geladen als er
// daadwerkelijk een key is (en dus nooit in de browser-tests, die mocken de client).
export function createAnthropicVangnetClient(apiKey: string): VangnetClient {
  let sdkClient: AnthropicSdk | null = null;
  return {
    async createMessage(params) {
      if (!sdkClient) {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        // timeout in ms (TS-SDK); maxRetries 1 — de run draait in de request-cyclus
        // van een import/edit, dus kort falen gaat boven lang wachten.
        sdkClient = new Anthropic({
          apiKey,
          timeout: CALL_TIMEOUT_MS,
          maxRetries: 1,
        });
      }
      const res = await sdkClient.messages.create({
        model: params.model,
        max_tokens: params.max_tokens,
        system: params.system,
        tools: params.tools as AnthropicSdk.Tool[],
        messages: params.messages as AnthropicSdk.MessageParam[],
      });
      return {
        content: res.content.flatMap((b): VangnetContentBlock[] => {
          if (b.type === "text") return [{ type: "text", text: b.text }];
          if (b.type === "tool_use") {
            return [
              {
                type: "tool_use",
                id: b.id,
                name: b.name,
                input: (b.input ?? {}) as Record<string, unknown>,
              },
            ];
          }
          return [];
        }),
        stop_reason: res.stop_reason,
        usage: {
          input_tokens: res.usage.input_tokens,
          output_tokens: res.usage.output_tokens,
        },
      };
    },
  };
}

function envApiKey(): string | undefined {
  // In de browser-tests bestaat `process` niet — dan is er per definitie geen key.
  if (typeof process === "undefined") return undefined;
  const key = process.env?.ANTHROPIC_API_KEY;
  return key && key.trim().length > 0 ? key : undefined;
}

// ── Tools (drie vaste, read-only) ────────────────────────────────────────────
const TOOLS: VangnetToolDef[] = [
  {
    name: "zoek_producten",
    description:
      "Zoek producten in de eigen catalogus (alleen zichtbare producten). Alle " +
      "parameters zijn optioneel; combineer merk met een korte producttekst. " +
      "Resultaten bevatten nooit prijzen.",
    input_schema: {
      type: "object",
      properties: {
        merk: { type: "string", description: "Merknaam om binnen te zoeken" },
        tekst: { type: "string", description: "Producttekst/-type, kort" },
        kelvin: { type: "integer", description: "Exacte kleurtemperatuur" },
        ip: { type: "string", description: "IP-waarde, bv. IP44" },
        watt: { type: "number", description: "Vermogen (±30% marge)" },
      },
    },
  },
  {
    name: "lijst_merken",
    description: "Alle merken met zichtbare producten in de catalogus.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "product_detail",
    description: "Technische details van één product (id uit zoek_producten).",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
];

type Phase = "tender" | "awarded";
type Line = typeof specLines.$inferSelect;

// Genormaliseerde merkvergelijking — zelfde normalisatie als searchProducts
// ("LedsC4" ≡ "LEDS-C4").
function normBrand(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Compact productbeeld voor de AI: technische velden, GEEN prijs (regel 2 — de AI
// heeft geen prijs nodig en krijgt hem dus niet).
type ToolProduct = {
  id: string;
  naam: string;
  merk: string | null;
  artikelcode: string | null;
  kelvin: number | null;
  cri: number | null;
  ip: string | null;
  lumen: number | null;
  watt: number | null;
};

// zoek_producten: geparametriseerde query uitsluitend op visible_products (regel 3),
// zelfde fuzzy-patroon als lib/repo/products.ts#searchProducts. Rangschikking is puur
// tekst (#tokens, similariteit, naam) — nergens prijs (regel 2).
async function toolZoekProducten(
  db: AppDb,
  line: Line,
  phase: Phase,
  input: Record<string, unknown>,
): Promise<{ resultaten: ToolProduct[] } | { fout: string }> {
  const requestedBrand = (line.brandText ?? "").trim();
  // Fase-grens (regel 4), SERVER-SIDE afgedwongen: in tender-fase wordt de merk-
  // parameter van het model volledig genegeerd en hard vervangen door het gevraagde
  // merk van de regel. Geen gevraagd merk → fail-closed: dan valt er in tender niets
  // fase-veiligs te zoeken.
  let brand: string;
  if (phase === "tender") {
    if (!requestedBrand) {
      return {
        fout:
          "deze regel heeft geen gevraagd merk — in tender-fase zoekt het vangnet " +
          "uitsluitend binnen het gevraagde merk, dus hier is geen zoekactie mogelijk",
      };
    }
    brand = requestedBrand;
  } else {
    brand = typeof input.merk === "string" ? input.merk.trim() : "";
  }

  const tekst = typeof input.tekst === "string" ? input.tekst.trim() : "";
  const kelvin = typeof input.kelvin === "number" ? Math.round(input.kelvin) : null;
  const ip = typeof input.ip === "string" ? input.ip.trim() : "";
  const watt = typeof input.watt === "number" && input.watt > 0 ? input.watt : null;

  const conditions = [];
  if (brand.length > 0) {
    const nb = normBrand(brand);
    if (nb.length > 0) {
      conditions.push(
        sql`regexp_replace(lower(${visibleProducts.brandName}), '[^a-z0-9]', '', 'g') like ${"%" + nb + "%"}`,
      );
    }
  }
  const tokens = tekst.split(/\s+/).filter((t) => t.length >= 2);
  let matchCount = sql<number>`0`;
  if (tokens.length > 0) {
    conditions.push(
      or(
        ...tokens.map(
          (t) => sql`${visibleProducts.name} ilike ${"%" + t + "%"}`,
        ),
      ),
    );
    matchCount = sql<number>`(${sql.join(
      tokens.map(
        (t) =>
          sql`(case when ${visibleProducts.name} ilike ${"%" + t + "%"} then 1 else 0 end)`,
      ),
      sql` + `,
    )})`;
  }
  if (kelvin != null) conditions.push(eq(visibleProducts.kelvin, kelvin));
  if (ip.length > 0)
    conditions.push(sql`${visibleProducts.ipValue} ilike ${"%" + ip + "%"}`);
  if (watt != null) {
    // ruime marge; producten zonder wattage-data blijven eerlijk zichtbaar
    conditions.push(
      sql`(${visibleProducts.maxWattage} is null or ${visibleProducts.maxWattage} between ${watt * 0.7} and ${watt * 1.3})`,
    );
  }

  const score =
    tekst.length > 0
      ? sql<number>`similarity(${visibleProducts.name}, ${tekst})`
      : sql<number>`0`;
  // ORDER BY: alleen de rangschikkers die daadwerkelijk iets meten (een kaal `0` zou
  // in Postgres als kolom-ordinaal gelezen worden). Nergens prijs (regel 2).
  const orderCols = [
    ...(tokens.length > 0 ? [desc(matchCount)] : []),
    ...(tekst.length > 0 ? [desc(score)] : []),
    asc(visibleProducts.name),
  ];
  const rows = await db
    .select({
      id: visibleProducts.id,
      name: visibleProducts.name,
      brandName: visibleProducts.brandName,
      articleCode: visibleProducts.articleCode,
      kelvin: visibleProducts.kelvin,
      cri: visibleProducts.cri,
      ipValue: visibleProducts.ipValue,
      lumenOutput: visibleProducts.lumenOutput,
      maxWattage: visibleProducts.maxWattage,
      matchCount,
      score,
    })
    .from(visibleProducts)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...orderCols)
    .limit(SEARCH_LIMIT);

  // Regel 5: elke zoekactie in het event-log, herkenbaar als vangnet-zoekactie.
  await logEvent(db, {
    entity: "spec_line",
    entityId: line.id,
    action: "search",
    actor: VANGNET_ACTOR,
    payload: { query: tekst, brand, resultCount: rows.length, bron: "ai_vangnet" },
  });

  return {
    resultaten: rows.map((r) => ({
      id: String(r.id),
      naam: String(r.name ?? ""),
      merk: (r.brandName as string | null) ?? null,
      artikelcode: (r.articleCode as string | null) ?? null,
      kelvin: (r.kelvin as number | null) ?? null,
      cri: (r.cri as number | null) ?? null,
      ip: (r.ipValue as string | null) ?? null,
      lumen: (r.lumenOutput as number | null) ?? null,
      watt: r.maxWattage != null ? Number(r.maxWattage) : null,
    })),
  };
}

async function toolLijstMerken(db: AppDb): Promise<{ merken: string[] }> {
  const rows = await db
    .selectDistinct({ brandName: visibleProducts.brandName })
    .from(visibleProducts)
    .where(isNotNull(visibleProducts.brandName))
    .orderBy(asc(visibleProducts.brandName))
    .limit(200);
  return { merken: rows.map((r) => String(r.brandName)) };
}

// product_detail: alleen zichtbare producten (regel 3); in tender-fase alleen het
// gevraagde merk (regel 4 — anders zou een geraden id de merkvergrendeling omzeilen).
async function toolProductDetail(
  db: AppDb,
  line: Line,
  phase: Phase,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { fout: "ongeldig product-id" };
  const [row] = await db
    .select({
      id: visibleProducts.id,
      name: visibleProducts.name,
      brandName: visibleProducts.brandName,
      articleCode: visibleProducts.articleCode,
      categoryPath: visibleProducts.categoryPath,
      description: visibleProducts.description,
      kelvin: visibleProducts.kelvin,
      cri: visibleProducts.cri,
      ipValue: visibleProducts.ipValue,
      lumenOutput: visibleProducts.lumenOutput,
      maxWattage: visibleProducts.maxWattage,
      beamAngle: visibleProducts.beamAngle,
      dimmable: visibleProducts.dimmable,
      color1: visibleProducts.color1,
      diameterCm: visibleProducts.diameterCm,
    })
    .from(visibleProducts)
    .where(eq(visibleProducts.id, id))
    .limit(1);
  if (!row) return { fout: "onbekend of niet (meer) zichtbaar product" };
  if (phase === "tender") {
    const requested = normBrand(line.brandText);
    const actual = normBrand(row.brandName as string | null);
    if (!requested || !actual.includes(requested)) {
      return {
        fout:
          "dit product is van een ander merk dan gevraagd — in tender-fase toont " +
          "het vangnet uitsluitend het gevraagde merk",
      };
    }
  }
  return {
    id: String(row.id),
    naam: String(row.name ?? ""),
    merk: row.brandName ?? null,
    artikelcode: row.articleCode ?? null,
    categorie: row.categoryPath ?? null,
    omschrijving:
      typeof row.description === "string" ? row.description.slice(0, 240) : null,
    kelvin: row.kelvin ?? null,
    cri: row.cri ?? null,
    ip: row.ipValue ?? null,
    lumen: row.lumenOutput ?? null,
    watt: row.maxWattage != null ? Number(row.maxWattage) : null,
    straalhoek: row.beamAngle != null ? Number(row.beamAngle) : null,
    dimbaar: row.dimmable ?? null,
    kleur: row.color1 ?? null,
    diameterCm: row.diameterCm != null ? Number(row.diameterCm) : null,
  };
}

// ── Prompt ───────────────────────────────────────────────────────────────────
function systemPrompt(phase: Phase): string {
  const faseRegel =
    phase === "tender"
      ? "Dit project is in TENDER-fase: zoek uitsluitend het GEVRAAGDE product " +
        "(zelfde merk en type). Suggesties voor andere merken of alternatieven zijn " +
        "hier niet toegestaan."
      : "Dit project is GEGUND: zoek eerst het gevraagde product; een goed " +
        "vergelijkbaar alternatief (eventueel van een ander merk) mag ook als suggestie.";
  return (
    "Je bent het AI-vangnet van Lumen Logic (Brink Licht). Eén aanvraagregel uit een " +
    "armaturenboek is niet automatisch opgelost. Zoek via de tools in de eigen " +
    "catalogus naar 0 tot 3 kandidaat-producten en stel ze voor.\n" +
    "Regels:\n" +
    "- Je doet alléén suggesties; je keurt niets goed en beslist niets.\n" +
    "- Gebruik uitsluitend product-id's die letterlijk in de toolresultaten stonden.\n" +
    "- Prijzen bestaan niet voor jou; noem of vraag er nooit naar.\n" +
    `- ${faseRegel}\n` +
    "Wees zuinig: hooguit een paar gerichte zoekacties. Sluit af met precies één " +
    'JSON-object als laatste regel: {"suggesties":[{"productId":"<id>","rationale":' +
    '"<korte Nederlandse onderbouwing>"}]} — of {"suggesties":[]} als niets past.'
  );
}

// Input per regel: fixtureCode, merk, producttekst en de gevraagde specs — nooit de
// PDF of het md-bestand (tokenzuinig).
function linePrompt(line: Line): string {
  const specs: Record<string, string | number> = {};
  if (line.reqKelvin != null) specs.kelvin = line.reqKelvin;
  if (line.reqCri != null) specs.cri = line.reqCri;
  if (line.reqIp) specs.ip = line.reqIp;
  if (line.reqWatt != null) specs.watt = Number(line.reqWatt);
  if (line.reqLumen != null) specs.lumen = line.reqLumen;
  if (line.reqBeamAngle != null) specs.straalhoek = Number(line.reqBeamAngle);
  if (line.reqSizeCm != null) specs.maatCm = Number(line.reqSizeCm);
  if (line.reqShape) specs.vorm = line.reqShape;
  if (line.reqColor) specs.kleur = line.reqColor;
  if (line.reqDimmable) specs.dimbaar = line.reqDimmable;
  return [
    "Onopgeloste aanvraagregel:",
    `- code: ${line.fixtureCode}`,
    `- gevraagd merk: ${line.brandText ?? "(onbekend)"}`,
    `- gevraagd product: ${line.productText ?? "(onbekend)"}`,
    `- huidige status: ${line.status}`,
    `- gevraagde specs: ${JSON.stringify(specs)}`,
  ].join("\n");
}

// Laatste JSON-object met "suggesties" uit de slottekst vissen. Defensief: een model
// dat geen geldige JSON teruggeeft levert gewoon nul suggesties op.
export function parseSuggestions(
  text: string,
): { productId: string; rationale: string }[] {
  const match = text.match(/\{[^{}]*"suggesties"[\s\S]*\}/);
  if (!match) return [];
  try {
    const obj = JSON.parse(match[0]) as {
      suggesties?: { productId?: unknown; rationale?: unknown }[];
    };
    if (!Array.isArray(obj.suggesties)) return [];
    return obj.suggesties
      .filter((s) => typeof s?.productId === "string" && s.productId.length > 0)
      .slice(0, MAX_SUGGESTIONS_PER_LINE)
      .map((s) => ({
        productId: String(s.productId),
        rationale:
          typeof s.rationale === "string" && s.rationale.trim().length > 0
            ? s.rationale.trim()
            : "(geen onderbouwing gegeven)",
      }));
  } catch {
    return [];
  }
}

// ── Budget & selectie ────────────────────────────────────────────────────────
async function overBudget(db: AppDb): Promise<{ over: boolean; budget: number | null; spend: number }> {
  const budget = await getSetting<number>(db, "llm_budget_eur");
  if (budget == null || !(budget > 0)) return { over: false, budget: null, spend: 0 };
  const spend = await getLlmSpend(db);
  return { over: spend >= budget, budget, spend };
}

// Selectie (tokenzuinig): status 'rood' of 'open', of 'geel' mét reviewKind en nog
// zonder besluit (dus daadwerkelijk in review); NOOIT groen; 'blauw' alléén als het
// dossier 'awarded' is (regel 4 — een blauw-suggestie is per definitie een ander merk).
// Regels met al-niet-verworpen AI-suggesties worden overgeslagen (geen dubbele kosten).
async function selectLines(db: AppDb, dossierId: string, phase: Phase) {
  const statusConds = [
    inArray(specLines.status, ["rood", "open"]),
    and(
      eq(specLines.status, "geel"),
      isNotNull(specLines.reviewKind),
      isNull(specLines.reviewedAt),
    ),
    ...(phase === "awarded" ? [eq(specLines.status, "blauw")] : []),
  ];
  return db
    .select()
    .from(specLines)
    .where(
      and(
        eq(specLines.dossierId, dossierId),
        or(...statusConds),
        notExists(
          db
            .select({ id: aiSuggestions.id })
            .from(aiSuggestions)
            .where(
              and(
                eq(aiSuggestions.specLineId, specLines.id),
                isNull(aiSuggestions.dismissedAt),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(specLines.sortOrder), asc(specLines.createdAt));
}

// ── De run ───────────────────────────────────────────────────────────────────
export type VangnetRunResult = {
  skipped?: "no_key" | "budget" | "dossier_onbekend";
  checked: string[]; // spec_line-ids die daadwerkelijk langs de AI gingen
  suggested: number;
  discarded: number;
};

export async function runVangnet(
  db: AppDb,
  dossierId: string,
  // `now` is injecteerbaar zodat de tijdsgrens-logica testbaar is met een nep-klok.
  opts: { client?: VangnetClient; actor?: string; now?: () => number } = {},
): Promise<VangnetRunResult> {
  const result: VangnetRunResult = { checked: [], suggested: 0, discarded: 0 };
  const now = opts.now ?? Date.now;
  const startMs = now();

  // Zonder key geen vangnet: netjes overslaan met een event, nooit een fout.
  const apiKey = envApiKey();
  const client =
    opts.client ?? (apiKey ? createAnthropicVangnetClient(apiKey) : null);
  if (!client) {
    await logEvent(db, {
      entity: "dossier",
      entityId: dossierId,
      action: "ai_vangnet_skipped_no_key",
      actor: opts.actor,
      payload: {},
    });
    return { ...result, skipped: "no_key" };
  }

  const [dossier] = await db
    .select({ id: projectDossiers.id, phase: projectDossiers.phase })
    .from(projectDossiers)
    .where(eq(projectDossiers.id, dossierId))
    .limit(1);
  if (!dossier) return { ...result, skipped: "dossier_onbekend" };
  const phase = dossier.phase as Phase;

  // Budgetstop vóór de run (L-06): cap overschreden → skip + event.
  const budget0 = await overBudget(db);
  if (budget0.over) {
    await logEvent(db, {
      entity: "dossier",
      entityId: dossierId,
      action: "ai_vangnet_skipped_budget",
      actor: opts.actor,
      payload: { budgetEur: budget0.budget, spendEur: budget0.spend },
    });
    return { ...result, skipped: "budget" };
  }

  const lines = await selectLines(db, dossierId, phase);

  for (const [i, line] of lines.entries()) {
    // Harde tijdsgrens per run: de vangnet-run wordt awaited in de import-/edit-
    // respons, dus na VANGNET_MAX_MS stoppen we tussen twee regels — skip-event met
    // wat er nog open stond, en de import slaagt gewoon.
    const elapsedMs = now() - startMs;
    if (elapsedMs > VANGNET_MAX_MS) {
      await logEvent(db, {
        entity: "dossier",
        entityId: dossierId,
        action: "ai_vangnet_skipped_timeout",
        actor: opts.actor,
        payload: {
          elapsedMs,
          maxMs: VANGNET_MAX_MS,
          remaining: lines.length - i,
          checked: result.checked.length,
        },
      });
      break;
    }
    // Budgetstop óók tussen regels: elke API-call schrijft llm_usage, dus de teller
    // is binnen de run actueel — een lange restlijst kan de cap niet doorbranden.
    if (result.checked.length > 0) {
      const b = await overBudget(db);
      if (b.over) {
        await logEvent(db, {
          entity: "dossier",
          entityId: dossierId,
          action: "ai_vangnet_skipped_budget",
          actor: opts.actor,
          payload: { budgetEur: b.budget, spendEur: b.spend, midRun: true },
        });
        break;
      }
    }
    try {
      const lineOutcome = await runLine(db, client, line, phase, opts.actor);
      result.checked.push(line.id);
      result.suggested += lineOutcome.suggested;
      result.discarded += lineOutcome.discarded;
    } catch (err) {
      // Eén kapotte regel mag de rest niet blokkeren; de fout is een event (regel 5).
      await logEvent(db, {
        entity: "spec_line",
        entityId: line.id,
        action: "ai_vangnet_failed",
        actor: opts.actor,
        payload: { melding: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  await logEvent(db, {
    entity: "dossier",
    entityId: dossierId,
    action: "ai_vangnet_run",
    actor: opts.actor,
    payload: {
      phase,
      checked: result.checked.length,
      suggested: result.suggested,
      discarded: result.discarded,
    },
  });
  return result;
}

// Eén regel door de tool-lus. Houdt bij welke product-ids in de toolresultaten van
// DEZE sessie voorkwamen: alleen die mogen gesuggereerd worden (server valideert).
async function runLine(
  db: AppDb,
  client: VangnetClient,
  line: Line,
  phase: Phase,
  actor?: string,
): Promise<{ suggested: number; discarded: number }> {
  const seenIds = new Set<string>();
  const messages: VangnetMessageParam[] = [
    { role: "user", content: linePrompt(line) },
  ];
  let totalIn = 0;
  let totalOut = 0;
  let finalText = "";

  for (let turn = 0; turn < MAX_TURNS_PER_LINE; turn++) {
    const res = await client.createMessage({
      model: VANGNET_MODEL,
      max_tokens: MAX_TOKENS_PER_CALL,
      system: systemPrompt(phase),
      tools: TOOLS,
      messages,
    });

    // Elke API-call → llm_usage-rij (dezelfde teller als getLlmSpend, L-06).
    totalIn += res.usage.input_tokens;
    totalOut += res.usage.output_tokens;
    const costEur =
      (res.usage.input_tokens * EUR_PER_MTOK_IN +
        res.usage.output_tokens * EUR_PER_MTOK_OUT) /
      1_000_000;
    await db
      .insert(llmUsage)
      .values({ purpose: "vangnet", costEur: costEur.toFixed(4) });

    const toolUses = res.content.filter(
      (b): b is Extract<VangnetContentBlock, { type: "tool_use" }> =>
        b.type === "tool_use",
    );
    if (res.stop_reason !== "tool_use" || toolUses.length === 0) {
      finalText = res.content
        .filter((b): b is Extract<VangnetContentBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      break;
    }

    messages.push({ role: "assistant", content: res.content });
    const toolResults: Array<{
      type: "tool_result";
      tool_use_id: string;
      content: string;
    }> = [];
    for (const tu of toolUses) {
      let out: unknown;
      if (tu.name === "zoek_producten") {
        const r = await toolZoekProducten(db, line, phase, tu.input);
        if ("resultaten" in r) for (const p of r.resultaten) seenIds.add(p.id);
        out = r;
      } else if (tu.name === "lijst_merken") {
        out = await toolLijstMerken(db);
      } else if (tu.name === "product_detail") {
        const r = await toolProductDetail(db, line, phase, tu.input);
        if (typeof r.id === "string") seenIds.add(r.id);
        out = r;
      } else {
        out = { fout: `onbekende tool ${tu.name}` };
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(out),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  // Suggesties valideren en wegschrijven. Status/reviewKind/matchedProductId worden
  // hier bewust NOOIT aangeraakt — een suggestie is geen beslissing.
  let suggested = 0;
  let discarded = 0;
  for (const s of parseSuggestions(finalText)) {
    if (!seenIds.has(s.productId)) {
      discarded++;
      await logEvent(db, {
        entity: "spec_line",
        entityId: line.id,
        action: "ai_suggestion_discarded",
        actor: actor ?? VANGNET_ACTOR,
        payload: {
          productId: s.productId,
          reden: "product-id kwam niet uit de toolresultaten van deze sessie",
        },
      });
      continue;
    }
    const [row] = await db
      .insert(aiSuggestions)
      .values({
        specLineId: line.id,
        productId: s.productId,
        rationale: s.rationale,
        model: VANGNET_MODEL,
        // sessietotalen van deze regel — samen met llm_usage het kostenspoor
        inputTokens: totalIn,
        outputTokens: totalOut,
      })
      .returning();
    suggested++;
    await logEvent(db, {
      entity: "spec_line",
      entityId: line.id,
      action: "ai_suggestion_created",
      actor: actor ?? VANGNET_ACTOR,
      payload: {
        suggestionId: row.id,
        productId: s.productId,
        model: VANGNET_MODEL,
        inputTokens: totalIn,
        outputTokens: totalOut,
      },
    });
  }
  return { suggested, discarded };
}

// Trigger-wrapper voor import/hermatch: awaited maar met vangrails — een vangnet-fout
// wordt een event (ai_vangnet_failed) en laat de import of edit nooit falen.
export async function runVangnetSafe(
  db: AppDb,
  dossierId: string,
  actor?: string,
  client?: VangnetClient,
): Promise<void> {
  try {
    await runVangnet(db, dossierId, { actor, client });
  } catch (err) {
    try {
      await logEvent(db, {
        entity: "dossier",
        entityId: dossierId,
        action: "ai_vangnet_failed",
        actor,
        payload: { melding: err instanceof Error ? err.message : String(err) },
      });
    } catch {
      // zelfs het loggen mag de aanroeper niet laten falen
    }
  }
}
