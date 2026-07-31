// AI-vangnet (B4/stap 8) met een gemockte client: selectie (nooit groen; blauw alleen
// bij awarded; al-gesuggereerd overslaan), de server-side tender-merkvergrendeling in
// de tools, de budgetstop, discard van ongeldige product-ids, het wegschrijven van
// suggesties + events + llm_usage, de gebruik/verwerp-flows en het skip-event zonder
// key. De regelstatus verandert door het vangnet NOOIT — dat staat hier ook in asserts.
import { expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  aiSuggestions,
  events,
  llmUsage,
  projectDossiers,
  specLineCandidates,
  specLines,
} from "@/db/schema";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import {
  MAX_SUGGESTIONS_PER_LINE,
  parseSuggestions,
  runVangnet,
  VANGNET_MAX_MS,
  VANGNET_MODEL,
  type VangnetClient,
  type VangnetMessageParams,
  type VangnetResponse,
} from "@/lib/ai/vangnet";
import {
  dismissSuggestion,
  getOpenSuggestionsForLine,
  useAiSuggestion,
} from "@/lib/repo/ai-suggestions";
import { getLlmSpend, setSetting } from "@/lib/repo/settings";

const ACTOR = "eduard@brinklicht.nl";
const USAGE = { input_tokens: 400, output_tokens: 80 };

// ── Mock-client: script van responses; elke call wordt opgenomen ────────────
function mockClient(responses: VangnetResponse[]) {
  const calls: VangnetMessageParams[] = [];
  const client: VangnetClient = {
    async createMessage(params) {
      calls.push(JSON.parse(JSON.stringify(params)) as VangnetMessageParams);
      const next = responses.shift();
      if (!next) throw new Error("mock-client: geen respons meer in het script");
      return next;
    },
  };
  return { client, calls };
}

function finalJson(
  suggesties: { productId: string; rationale: string }[],
): VangnetResponse {
  return {
    content: [{ type: "text", text: `Klaar.\n${JSON.stringify({ suggesties })}` }],
    stop_reason: "end_turn",
    usage: USAGE,
  };
}

function toolCall(name: string, input: Record<string, unknown>): VangnetResponse {
  return {
    content: [{ type: "tool_use", id: "tu_1", name, input }],
    stop_reason: "tool_use",
    usage: USAGE,
  };
}

async function seedDossier(db: TestDb, phase: "tender" | "awarded" = "tender") {
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Vangnet", phase })
    .returning();
  return dossier;
}

type LineOverrides = Partial<typeof specLines.$inferInsert>;
async function addLine(db: TestDb, dossierId: string, over: LineOverrides) {
  const [line] = await db
    .insert(specLines)
    .values({ dossierId, fixtureCode: "Lx", ...over })
    .returning();
  return line;
}

async function getLine(db: TestDb, id: string) {
  const [row] = await db.select().from(specLines).where(eq(specLines.id, id));
  return row;
}

async function eventsByAction(db: TestDb, action: string) {
  return db.select().from(events).where(eq(events.action, action));
}

// ── Selectie ─────────────────────────────────────────────────────────────────
test("selectie: rood/open/geel-in-review; nooit groen; blauw alleen bij awarded", async () => {
  const db = await createTestDb();
  const dossier = await seedDossier(db, "tender");
  const groen = await addLine(db, dossier.id, { fixtureCode: "L1", status: "groen", sortOrder: 1 });
  const geelReview = await addLine(db, dossier.id, {
    fixtureCode: "L2", status: "geel", reviewKind: "geel", sortOrder: 2,
  });
  const geelZonder = await addLine(db, dossier.id, { fixtureCode: "L3", status: "geel", sortOrder: 3 });
  const geelBeslist = await addLine(db, dossier.id, {
    fixtureCode: "L4", status: "geel", reviewKind: "geel", reviewedAt: new Date(), sortOrder: 4,
  });
  const rood = await addLine(db, dossier.id, { fixtureCode: "L5", status: "rood", sortOrder: 5 });
  const open = await addLine(db, dossier.id, { fixtureCode: "L6", status: "open", sortOrder: 6 });
  const blauw = await addLine(db, dossier.id, { fixtureCode: "L7", status: "blauw", sortOrder: 7 });

  // Tender: geel-in-review + rood + open — géén groen, géén blauw, géén besliste geel.
  const m1 = mockClient([finalJson([]), finalJson([]), finalJson([])]);
  const r1 = await runVangnet(db, dossier.id, { client: m1.client, actor: ACTOR });
  expect(r1.skipped).toBeUndefined();
  expect(new Set(r1.checked)).toEqual(new Set([geelReview.id, rood.id, open.id]));
  expect(r1.checked).not.toContain(groen.id);
  expect(r1.checked).not.toContain(blauw.id);
  expect(r1.checked).not.toContain(geelZonder.id);
  expect(r1.checked).not.toContain(geelBeslist.id);
  expect(m1.calls.length).toBe(3);

  // Awarded: blauw komt erbij (er zijn nog geen suggesties, dus niets overgeslagen).
  await db
    .update(projectDossiers)
    .set({ phase: "awarded" })
    .where(eq(projectDossiers.id, dossier.id));
  const m2 = mockClient([finalJson([]), finalJson([]), finalJson([]), finalJson([])]);
  const r2 = await runVangnet(db, dossier.id, { client: m2.client, actor: ACTOR });
  expect(new Set(r2.checked)).toEqual(
    new Set([geelReview.id, rood.id, open.id, blauw.id]),
  );
});

// ── B8: OCR-gating ───────────────────────────────────────────────────────────
// Een regel met een ÓPEN OCR-review (reviewKind 'ocr', reviewedAt null) mag het
// vangnet nooit bereiken: het gelezen merk kan verhallucineerd zijn en zou de
// merkvergrendelde zoektool sturen vóór een mens de bron zag. Ná afronding van de
// OCR-review doet de regel gewoon weer mee.
test("B8: open OCR-review → regel uitgesloten; afgeronde OCR-review → doet weer mee", async () => {
  const db = await createTestDb();
  const dossier = await seedDossier(db, "tender");
  const ocrOpen = await addLine(db, dossier.id, {
    fixtureCode: "Lo1",
    status: "rood",
    reviewKind: "ocr",
    sortOrder: 1,
  });
  const roodGewoon = await addLine(db, dossier.id, {
    fixtureCode: "Lo2",
    status: "rood",
    sortOrder: 2,
  });

  const m1 = mockClient([finalJson([])]);
  const r1 = await runVangnet(db, dossier.id, { client: m1.client, actor: ACTOR });
  expect(r1.checked).toEqual([roodGewoon.id]); // de open OCR-review blokkeert Lo1
  expect(m1.calls.length).toBe(1);

  // OCR-review afgerond (mens zag de bron) → de regel doet weer mee. roodGewoon
  // kreeg geen suggestie en komt daardoor óók opnieuw langs — twee responses.
  await db
    .update(specLines)
    .set({ reviewedAt: new Date() })
    .where(eq(specLines.id, ocrOpen.id));
  const m2 = mockClient([finalJson([]), finalJson([])]);
  const r2 = await runVangnet(db, dossier.id, { client: m2.client, actor: ACTOR });
  expect(new Set(r2.checked)).toEqual(new Set([ocrOpen.id, roodGewoon.id]));
});

test("al-niet-verworpen suggestie → regel overgeslagen; na verwerpen weer meegenomen", async () => {
  const db = await createTestDb();
  const { productId } = await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100" });
  const dossier = await seedDossier(db);
  const line = await addLine(db, dossier.id, {
    fixtureCode: "Lr1", status: "rood", brandText: "XAL",
  });
  const [suggestion] = await db
    .insert(aiSuggestions)
    .values({
      specLineId: line.id,
      productId,
      rationale: "eerdere run",
      model: VANGNET_MODEL,
    })
    .returning();

  const m1 = mockClient([]);
  const r1 = await runVangnet(db, dossier.id, { client: m1.client });
  expect(r1.checked).toEqual([]); // geen dubbele kosten
  expect(m1.calls.length).toBe(0);

  // verworpen → de regel telt weer mee
  await dismissSuggestion(db, { suggestionId: suggestion.id, actor: ACTOR });
  const m2 = mockClient([finalJson([])]);
  const r2 = await runVangnet(db, dossier.id, { client: m2.client });
  expect(r2.checked).toEqual([line.id]);
});

// ── Fase-grens: server-side merkvergrendeling ────────────────────────────────
test("tender: zoek-tool genegeerd merk-param → alleen het gevraagde merk in de resultaten", async () => {
  const db = await createTestDb();
  const xal = await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100 SQ", kelvin: 3000 });
  const flos = await seedBrandProduct(db, { brand: "Flos", name: "Bellhop Glass", kelvin: 3000 });
  const dossier = await seedDossier(db, "tender");
  const line = await addLine(db, dossier.id, {
    fixtureCode: "Lp301", status: "rood", brandText: "XAL", productText: "SASSO",
  });

  const { client, calls } = await Promise.resolve(
    mockClient([
      // het model probeert expliciet een ÁNDER merk — de server moet dit overrulen
      toolCall("zoek_producten", { merk: "Flos", tekst: "" }),
      finalJson([
        { productId: flos.productId, rationale: "ander merk (moet gediscard)" },
        { productId: xal.productId, rationale: "gevraagd merk, past" },
        { productId: crypto.randomUUID(), rationale: "verzonnen id" },
      ]),
    ]),
  );
  const result = await runVangnet(db, dossier.id, { client, actor: ACTOR });

  // De tweede call bevat het tool_result van de zoekactie: uitsluitend XAL.
  const toolResultMsg = calls[1].messages[2];
  const blocks = toolResultMsg.content as Array<{ type: string; content: string }>;
  const parsed = JSON.parse(blocks[0].content) as {
    resultaten: { id: string; merk: string | null }[];
  };
  expect(parsed.resultaten.length).toBeGreaterThan(0);
  expect(parsed.resultaten.every((r) => r.merk === "XAL")).toBe(true);
  expect(parsed.resultaten.some((r) => r.id === flos.productId)).toBe(false);
  // en de resultaten dragen géén prijsvelden (regel 2)
  expect(blocks[0].content).not.toContain("grossPrice");
  expect(blocks[0].content).not.toContain("prijs");

  // Alleen de geziene XAL-suggestie is opgeslagen; de andere twee zijn gediscard.
  expect(result.suggested).toBe(1);
  expect(result.discarded).toBe(2);
  const rows = await db
    .select()
    .from(aiSuggestions)
    .where(eq(aiSuggestions.specLineId, line.id));
  expect(rows.length).toBe(1);
  expect(rows[0].productId).toBe(xal.productId);
  expect(rows[0].model).toBe(VANGNET_MODEL);
  expect(rows[0].rationale).toContain("past");
  expect(rows[0].inputTokens).toBeGreaterThan(0);
  expect(rows[0].outputTokens).toBeGreaterThan(0);

  expect((await eventsByAction(db, "ai_suggestion_created")).length).toBe(1);
  expect((await eventsByAction(db, "ai_suggestion_discarded")).length).toBe(2);

  // Elke API-call → llm_usage-rij; de teller telt mee voor de budgetstop.
  const usageRows = await db
    .select()
    .from(llmUsage)
    .where(eq(llmUsage.purpose, "vangnet"));
  expect(usageRows.length).toBe(2);
  expect(await getLlmSpend(db)).toBeGreaterThan(0);

  // En de regel zelf is onaangeroerd: suggesties wijzigen NOOIT de status.
  const after = await getLine(db, line.id);
  expect(after.status).toBe("rood");
  expect(after.matchedProductId).toBeNull();
  expect(after.reviewKind).toBeNull();
});

// ── A14: vergrendelen is gelijkheid, niet 'bevat' ────────────────────────────
// Reviewzwerm 2.5a. De drie lagen die regel 4 afdwingen vergeleken alle drie op
// deelstring, dus een moedermerk lekte zijn submerken. Uitgevoerd bewijs destijds:
// een dossier in tender met brandText "Delta" kreeg CONCURRENT XYZ van "Delta Light"
// in het zoekresultaat, product_detail gaf er volledige details op, en de suggestie
// werd opgeslagen (suggested: 1, discarded: 0). Deze test dekt beide serverlagen.
test("A14 tender: zoek-tool en product_detail weren een submerk van het gevraagde merk", async () => {
  const db = await createTestDb();
  const delta = await seedBrandProduct(db, { brand: "Delta", name: "ALFA 100" });
  const deltaLight = await seedBrandProduct(db, {
    brand: "Delta Light",
    name: "CONCURRENT XYZ",
  });
  const dossier = await seedDossier(db, "tender");
  const line = await addLine(db, dossier.id, {
    fixtureCode: "La14", status: "rood", brandText: "Delta", productText: "100",
  });

  const { client, calls } = mockClient([
    toolCall("zoek_producten", { merk: "Delta", tekst: "" }),
    toolCall("product_detail", { id: deltaLight.productId }),
    finalJson([
      { productId: deltaLight.productId, rationale: "submerk (moet gediscard)" },
      { productId: delta.productId, rationale: "gevraagd merk, past" },
    ]),
  ]);
  const result = await runVangnet(db, dossier.id, { client, actor: ACTOR });

  // Laag 1 — de zoektool: alleen 'Delta', geen 'Delta Light'.
  const zoekBlocks = calls[1].messages[2].content as Array<{ content: string }>;
  const parsed = JSON.parse(zoekBlocks[0].content) as {
    resultaten: { id: string; merk: string | null }[];
  };
  expect(parsed.resultaten.length).toBeGreaterThan(0);
  expect(parsed.resultaten.every((r) => r.merk === "Delta")).toBe(true);
  expect(parsed.resultaten.some((r) => r.id === deltaLight.productId)).toBe(false);

  // Laag 2 — product_detail weigert het submerk in plaats van details te geven.
  const detailBlocks = calls[2].messages[4].content as Array<{ content: string }>;
  expect(detailBlocks[0].content).toContain("ander merk");
  expect(detailBlocks[0].content).not.toContain("CONCURRENT XYZ");

  // En het submerk komt de database niet in als suggestie.
  expect(result.suggested).toBe(1);
  expect(result.discarded).toBe(1);
  const rows = await db
    .select()
    .from(aiSuggestions)
    .where(eq(aiSuggestions.specLineId, line.id));
  expect(rows.length).toBe(1);
  expect(rows[0].productId).toBe(delta.productId);
});

// De tegenproef: gelijkheid mag geen legitieme match slopen. Een merk dat in het bestek
// anders geschreven staat dan in de catalogus ("LEDS-C4" vs "LedsC4") moet gewoon door
// beide lagen komen — de normalisatie doet nog steeds haar werk.
test("A14 tender: schrijfwijze-variant van hetzelfde merk komt door beide lagen", async () => {
  const db = await createTestDb();
  const leds = await seedBrandProduct(db, { brand: "LedsC4", name: "AFRODITA RECESSED" });
  const dossier = await seedDossier(db, "tender");
  const line = await addLine(db, dossier.id, {
    fixtureCode: "La14b", status: "rood", brandText: "LEDS-C4", productText: "AFRODITA",
  });

  const { client, calls } = mockClient([
    toolCall("zoek_producten", { merk: "LEDS-C4", tekst: "AFRODITA" }),
    toolCall("product_detail", { id: leds.productId }),
    finalJson([{ productId: leds.productId, rationale: "zelfde merk, andere schrijfwijze" }]),
  ]);
  const result = await runVangnet(db, dossier.id, { client, actor: ACTOR });

  const zoekBlocks = calls[1].messages[2].content as Array<{ content: string }>;
  const parsed = JSON.parse(zoekBlocks[0].content) as { resultaten: { id: string }[] };
  expect(parsed.resultaten.some((r) => r.id === leds.productId)).toBe(true);

  const detailBlocks = calls[2].messages[4].content as Array<{ content: string }>;
  expect(detailBlocks[0].content).not.toContain("ander merk");
  expect(detailBlocks[0].content).toContain("AFRODITA RECESSED");

  expect(result.suggested).toBe(1);
  expect(result.discarded).toBe(0);
  const rows = await db
    .select()
    .from(aiSuggestions)
    .where(eq(aiSuggestions.specLineId, line.id));
  expect(rows.length).toBe(1);
  expect(rows[0].productId).toBe(leds.productId);
});

test("tender: product_detail weigert een ander merk; awarded staat het toe", async () => {
  const db = await createTestDb();
  await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100 SQ" });
  const flos = await seedBrandProduct(db, { brand: "Flos", name: "Bellhop Glass" });
  const dossier = await seedDossier(db, "tender");
  await addLine(db, dossier.id, {
    fixtureCode: "Lp302", status: "rood", brandText: "XAL",
  });

  // Tender: detail van een Flos-product → fout, id niet 'gezien' → suggestie discard.
  const m1 = mockClient([
    toolCall("product_detail", { id: flos.productId }),
    finalJson([{ productId: flos.productId, rationale: "via detail geprobeerd" }]),
  ]);
  const r1 = await runVangnet(db, dossier.id, { client: m1.client });
  expect(r1.suggested).toBe(0);
  expect(r1.discarded).toBe(1);
  const detailBlocks = m1.calls[1].messages[2].content as Array<{ content: string }>;
  expect(detailBlocks[0].content).toContain("ander merk");

  // Awarded: hetzelfde detail is nu wél toegestaan → suggestie mag (alternatief).
  await db
    .update(projectDossiers)
    .set({ phase: "awarded" })
    .where(eq(projectDossiers.id, dossier.id));
  const m2 = mockClient([
    toolCall("product_detail", { id: flos.productId }),
    finalJson([{ productId: flos.productId, rationale: "alternatief na gunning" }]),
  ]);
  const r2 = await runVangnet(db, dossier.id, { client: m2.client });
  expect(r2.suggested).toBe(1);
  expect(r2.discarded).toBe(0);
});

// ── Budgetstop ───────────────────────────────────────────────────────────────
test("budget overschreden → skip + event, geen API-calls", async () => {
  const db = await createTestDb();
  const dossier = await seedDossier(db);
  await addLine(db, dossier.id, { fixtureCode: "Lr1", status: "rood" });
  await setSetting(db, "llm_budget_eur", 1);
  await db.insert(llmUsage).values({ purpose: "import", costEur: "2.5000" });

  const { client, calls } = mockClient([]);
  const result = await runVangnet(db, dossier.id, { client, actor: ACTOR });
  expect(result.skipped).toBe("budget");
  expect(result.checked).toEqual([]);
  expect(calls.length).toBe(0);
  expect((await eventsByAction(db, "ai_vangnet_skipped_budget")).length).toBe(1);
});

// ── Tijdsgrens per run ───────────────────────────────────────────────────────
// De run wordt awaited in de import-/edit-respons: na VANGNET_MAX_MS stopt hij
// tussen twee regels met een skip-event (nep-klok geïnjecteerd via opts.now).
test("tijdsgrens overschreden tussen regels → run stopt netjes + skip-event met restant", async () => {
  const db = await createTestDb();
  const dossier = await seedDossier(db);
  const line1 = await addLine(db, dossier.id, {
    fixtureCode: "Lr1", status: "rood", sortOrder: 1,
  });
  const line2 = await addLine(db, dossier.id, {
    fixtureCode: "Lr2", status: "rood", sortOrder: 2,
  });
  const line3 = await addLine(db, dossier.id, {
    fixtureCode: "Lr3", status: "rood", sortOrder: 3,
  });

  // Nep-klok: start op 0; ná de eerste API-call springt de tijd over de grens.
  let t = 0;
  const { client: inner, calls } = mockClient([finalJson([]), finalJson([])]);
  const client: VangnetClient = {
    async createMessage(params) {
      const res = await inner.createMessage(params);
      t = VANGNET_MAX_MS + 1; // de eerste regel 'duurde' langer dan de hele grens
      return res;
    },
  };

  const result = await runVangnet(db, dossier.id, {
    client,
    actor: ACTOR,
    now: () => t,
  });

  // Alleen de eerste regel is behandeld; daarna netjes gestopt — geen fout.
  expect(result.checked).toEqual([line1.id]);
  expect(calls.length).toBe(1);
  const evts = await eventsByAction(db, "ai_vangnet_skipped_timeout");
  expect(evts.length).toBe(1);
  const payload = evts[0].payload as {
    remaining: number;
    checked: number;
    elapsedMs: number;
    maxMs: number;
  };
  expect(payload.remaining).toBe(2); // line2 + line3 stonden nog open
  expect(payload.checked).toBe(1);
  expect(payload.elapsedMs).toBeGreaterThan(VANGNET_MAX_MS);
  expect(payload.maxMs).toBe(VANGNET_MAX_MS);
  // de run-samenvatting komt gewoon nog (de aanroeper merkt niets van de stop)
  expect((await eventsByAction(db, "ai_vangnet_run")).length).toBe(1);
  // en de onbehandelde regels zijn onaangeroerd
  expect((await getLine(db, line2.id)).status).toBe("rood");
  expect((await getLine(db, line3.id)).status).toBe("rood");
});

test("binnen de tijdsgrens: alle regels behandeld, geen timeout-event", async () => {
  const db = await createTestDb();
  const dossier = await seedDossier(db);
  await addLine(db, dossier.id, { fixtureCode: "Lr1", status: "rood", sortOrder: 1 });
  await addLine(db, dossier.id, { fixtureCode: "Lr2", status: "rood", sortOrder: 2 });

  let t = 0;
  const { client: inner } = mockClient([finalJson([]), finalJson([])]);
  const client: VangnetClient = {
    async createMessage(params) {
      const res = await inner.createMessage(params);
      t += 1_000; // ruim binnen de grens per regel
      return res;
    },
  };
  const result = await runVangnet(db, dossier.id, { client, now: () => t });
  expect(result.checked.length).toBe(2);
  expect((await eventsByAction(db, "ai_vangnet_skipped_timeout")).length).toBe(0);
});

// ── Zonder key ───────────────────────────────────────────────────────────────
test("zonder key en zonder client → netjes overslaan met skip-event", async () => {
  const db = await createTestDb();
  const dossier = await seedDossier(db);
  await addLine(db, dossier.id, { fixtureCode: "Lr1", status: "rood" });

  const result = await runVangnet(db, dossier.id, { actor: ACTOR });
  expect(result.skipped).toBe("no_key");
  const evts = await eventsByAction(db, "ai_vangnet_skipped_no_key");
  expect(evts.length).toBe(1);
  expect(evts[0].entityId).toBe(dossier.id);
});

// ── Gebruik/verwerp-flows ────────────────────────────────────────────────────
test("gebruik op rood → groen via linkManualProduct + merkteken; suggestie = historie", async () => {
  const db = await createTestDb();
  const { productId } = await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100" });
  const dossier = await seedDossier(db);
  const line = await addLine(db, dossier.id, {
    fixtureCode: "Lr1", status: "rood", brandText: "XAL",
  });
  const [suggestion] = await db
    .insert(aiSuggestions)
    .values({ specLineId: line.id, productId, rationale: "past", model: VANGNET_MODEL })
    .returning();

  await useAiSuggestion(db, { suggestionId: suggestion.id, actor: ACTOR });

  const after = await getLine(db, line.id);
  expect(after.status).toBe("groen");
  expect(after.matchedProductId).toBe(productId);
  // merkteken "handmatig gekozen": de mens klikte, chosenBy = actor
  const [chosen] = await db
    .select()
    .from(specLineCandidates)
    .where(
      and(eq(specLineCandidates.specLineId, line.id), eq(specLineCandidates.chosen, true)),
    );
  expect(chosen.chosenBy).toBe(ACTOR);

  const [used] = await db
    .select()
    .from(aiSuggestions)
    .where(eq(aiSuggestions.id, suggestion.id));
  expect(used.dismissedAt).not.toBeNull();
  expect(used.dismissedBy).toBe(`gebruikt door ${ACTOR}`);
  expect((await eventsByAction(db, "ai_suggestion_used")).length).toBe(1);
  // gebruikt = niet meer open → niet meer in de UI
  expect(await getOpenSuggestionsForLine(db, line.id)).toEqual([]);
});

test("gebruik op geel-in-review → decideReview: groen + reviewedAt + merkteken", async () => {
  const db = await createTestDb();
  const { productId } = await seedBrandProduct(db, { brand: "XAL", name: "VELA ROUND 600" });
  const dossier = await seedDossier(db);
  const line = await addLine(db, dossier.id, {
    fixtureCode: "Lk410", status: "geel", reviewKind: "geel", brandText: "XAL",
  });
  const [suggestion] = await db
    .insert(aiSuggestions)
    .values({ specLineId: line.id, productId, rationale: "past", model: VANGNET_MODEL })
    .returning();

  await useAiSuggestion(db, { suggestionId: suggestion.id, actor: ACTOR });

  const after = await getLine(db, line.id);
  expect(after.status).toBe("groen");
  expect(after.matchedProductId).toBe(productId);
  expect(after.reviewedAt).not.toBeNull();
  expect(after.reviewDecision).toBe("accepteer");
  const [chosen] = await db
    .select()
    .from(specLineCandidates)
    .where(
      and(eq(specLineCandidates.specLineId, line.id), eq(specLineCandidates.chosen, true)),
    );
  expect(chosen.chosenBy).toBe(ACTOR);
});

test("verwerpen: dismissed_at/by + event; regel blijft onaangeroerd", async () => {
  const db = await createTestDb();
  const { productId } = await seedBrandProduct(db, { brand: "XAL", name: "SASSO 100" });
  const dossier = await seedDossier(db);
  const line = await addLine(db, dossier.id, {
    fixtureCode: "Lr1", status: "rood", brandText: "XAL",
  });
  const [suggestion] = await db
    .insert(aiSuggestions)
    .values({ specLineId: line.id, productId, rationale: "past", model: VANGNET_MODEL })
    .returning();

  expect((await getOpenSuggestionsForLine(db, line.id)).length).toBe(1);
  await dismissSuggestion(db, { suggestionId: suggestion.id, actor: ACTOR });

  const [dismissed] = await db
    .select()
    .from(aiSuggestions)
    .where(eq(aiSuggestions.id, suggestion.id));
  expect(dismissed.dismissedAt).not.toBeNull();
  expect(dismissed.dismissedBy).toBe(ACTOR);
  expect((await eventsByAction(db, "ai_suggestion_dismissed")).length).toBe(1);
  expect(await getOpenSuggestionsForLine(db, line.id)).toEqual([]);

  const after = await getLine(db, line.id);
  expect(after.status).toBe("rood");
  expect(after.matchedProductId).toBeNull();
});

// ── Parser (defensief) ───────────────────────────────────────────────────────
// De parser balanceert accolades en is string-bewust. parseFailed onderscheidt "het
// model gaf niets" (geldig antwoord) van "wij konden het niet lezen" (onze bug).
test("parseSuggestions: JSON uit slottekst, cap en rationale-fallback", () => {
  expect(
    parseSuggestions('Toelichting.\n{"suggesties":[{"productId":"a","rationale":"x"}]}'),
  ).toEqual({ suggesties: [{ productId: "a", rationale: "x" }], parseFailed: false });

  // meer dan het maximum → afgekapt op MAX_SUGGESTIONS_PER_LINE
  const teveel = parseSuggestions(
    JSON.stringify({
      suggesties: Array.from({ length: MAX_SUGGESTIONS_PER_LINE + 1 }, (_, i) => ({
        productId: `p${i}`,
        rationale: `${i}`,
      })),
    }),
  );
  expect(teveel.suggesties.length).toBe(MAX_SUGGESTIONS_PER_LINE);
  expect(teveel.parseFailed).toBe(false);

  // ontbrekende/lege rationale → nette fallback i.p.v. undefined
  expect(
    parseSuggestions('{"suggesties":[{"productId":"a"},{"productId":"b","rationale":"  "}]}')
      .suggesties,
  ).toEqual([
    { productId: "a", rationale: "(geen onderbouwing gegeven)" },
    { productId: "b", rationale: "(geen onderbouwing gegeven)" },
  ]);
});

// DE bug van 0.1b: de oude regex rekte gulzig tot de LAATSTE `}` in de slottekst en
// gooide dan stil — een prima antwoord verdween zo geruisloos.
test("parseSuggestions: JSON gevolgd door proza mét accolade blijft leesbaar", () => {
  expect(
    parseSuggestions(
      '{"suggesties":[{"productId":"a","rationale":"past"}]}\n' +
        "Let op: de notatie {merk, type} in het boek wijkt af.",
    ),
  ).toEqual({ suggesties: [{ productId: "a", rationale: "past" }], parseFailed: false });
});

test("parseSuggestions: accolades en escaped quotes binnen een rationale", () => {
  expect(
    parseSuggestions(
      '{"suggesties":[{"productId":"a","rationale":"boek noteert {3000K} als \\"warm\\""}]}',
    ),
  ).toEqual({
    suggesties: [{ productId: "a", rationale: 'boek noteert {3000K} als "warm"' }],
    parseFailed: false,
  });
});

// De vorm die in de 0.1b-meting live is waargenomen (Ld107, Lp601, Lr701).
test("parseSuggestions: ```json-fence eromheen (live gemeten vorm)", () => {
  expect(
    parseSuggestions(
      'Geen passend product gevonden.\n```json\n{"suggesties":[]}\n```',
    ),
  ).toEqual({ suggesties: [], parseFailed: false });
  expect(
    parseSuggestions(
      '```json\n{"suggesties":[{"productId":"a","rationale":"past"}]}\n```',
    ),
  ).toEqual({ suggesties: [{ productId: "a", rationale: "past" }], parseFailed: false });
});

test("parseSuggestions: leeg/geen JSON = geldig antwoord; onleesbaar = parseFailed", () => {
  // het model gaf netjes niets → geen fout
  expect(parseSuggestions('{"suggesties":[]}')).toEqual({
    suggesties: [],
    parseFailed: false,
  });
  expect(parseSuggestions("geen json")).toEqual({ suggesties: [], parseFailed: false });
  // sleutel aanwezig maar onleesbaar → dát is een parse-mislukking
  expect(parseSuggestions('{"suggesties":[{')).toEqual({
    suggesties: [],
    parseFailed: true,
  });
});

test("parseSuggestions: laatste bruikbare object wint", () => {
  // de prompt bedoelt het laatste JSON-object als slot
  expect(
    parseSuggestions(
      '{"suggesties":[{"productId":"oud","rationale":"eerste poging"}]}\n' +
        'Nee, toch niet.\n{"suggesties":[{"productId":"nieuw","rationale":"beter"}]}',
    ),
  ).toEqual({
    suggesties: [{ productId: "nieuw", rationale: "beter" }],
    parseFailed: false,
  });

  // kapot laatste object → terugvallen op het vorige, dat is geen mislukking
  expect(
    parseSuggestions(
      '{"suggesties":[{"productId":"goed","rationale":"past"}]}\n' +
        '{"suggesties":[{"productId":,}]}',
    ),
  ).toEqual({
    suggesties: [{ productId: "goed", rationale: "past" }],
    parseFailed: false,
  });
});

// ── Parse-mislukking laat een spoor na in de run ─────────────────────────────
test("onleesbare slottekst → parseFailed-teller + event, zonder modeltekst", async () => {
  const db = await createTestDb();
  const dossier = await seedDossier(db);
  const line = await addLine(db, dossier.id, { fixtureCode: "Lr1", status: "rood" });

  const kapot: VangnetResponse = {
    content: [{ type: "text", text: 'Hier komt het:\n{"suggesties":[{' }],
    stop_reason: "end_turn",
    usage: USAGE,
  };
  const result = await runVangnet(db, dossier.id, {
    client: mockClient([kapot]).client,
    actor: ACTOR,
  });

  expect(result.suggested).toBe(0);
  expect(result.discarded).toBe(0);
  expect(result.parseFailed).toBe(1);

  const evts = await eventsByAction(db, "ai_suggestion_parse_failed");
  expect(evts.length).toBe(1);
  expect(evts[0].entityId).toBe(line.id);
  const payload = evts[0].payload as { reden: string; tekstLengte: number };
  expect(payload.reden).toContain("suggesties");
  expect(payload.tekstLengte).toBeGreaterThan(0);
  // geen permanente opslag van modelantwoorden: de tekst zelf zit er niet in
  expect(JSON.stringify(payload)).not.toContain("Hier komt het");

  // en de run-samenvatting draagt de teller mee
  const runEvts = await eventsByAction(db, "ai_vangnet_run");
  expect((runEvts[0].payload as { parseFailed: number }).parseFailed).toBe(1);
});

test("nette lege slottekst → geen parse-mislukking, geen event", async () => {
  const db = await createTestDb();
  const dossier = await seedDossier(db);
  await addLine(db, dossier.id, { fixtureCode: "Lr1", status: "rood" });

  const result = await runVangnet(db, dossier.id, {
    client: mockClient([finalJson([])]).client,
    actor: ACTOR,
  });

  expect(result.parseFailed).toBe(0);
  expect((await eventsByAction(db, "ai_suggestion_parse_failed")).length).toBe(0);
  const runEvts = await eventsByAction(db, "ai_vangnet_run");
  expect((runEvts[0].payload as { parseFailed: number }).parseFailed).toBe(0);
});
