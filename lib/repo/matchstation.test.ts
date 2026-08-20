// Sprint M1 (docs/plan-matchstation-eigen-machine.md) — de repo-laag onder de twee
// machine-endpoints. Getest tegen PGlite, geen mocks: dezelfde db-code als productie.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";
import { events, llmUsage, matchstationQueue, projectDossiers, specLineCandidates, specLines } from "@/db/schema";
import { createTestDb, seedBrandProduct, type TestDb } from "@/db/test-db";
import {
  applyMatchstationResult,
  claimNextDossier,
  enqueueDossierForMatching,
  findDeadAlerts,
  getLastHeartbeat,
  markJobProcessed,
  registerHeartbeat,
  sendDeadAlert,
} from "./matchstation";
import { recordPdfImport } from "./imports";

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
  delete process.env.MATCHSTATION_MAX_EUR_PER_RUN;
  delete process.env.MATCHSTATION_ALERT_WEBHOOK_URL;
});

async function seedDossier(name = "Ziekenhuis Noord") {
  const [row] = await db.insert(projectDossiers).values({ name }).returning();
  return row;
}

// ── Wachtrij: enqueue + claim ──────────────────────────────────────────────────

describe("enqueueDossierForMatching", () => {
  test("zet een dossier op 'wachtend' en logt een event", async () => {
    const dossier = await seedDossier();
    const res = await enqueueDossierForMatching(db, dossier.id, "eduard@brinklicht.nl");
    expect(res.queued).toBe(true);

    const [row] = await db.select().from(matchstationQueue);
    expect(row.status).toBe("wachtend");
    expect(row.dossierId).toBe(dossier.id);

    const [ev] = await db.select().from(events).where(eq(events.action, "matchstation_enqueued"));
    expect(ev.entityId).toBe(dossier.id);
  });

  test("een dossier dat al wachtend/geclaimd is, komt niet dubbel in de wachtrij", async () => {
    const dossier = await seedDossier();
    await enqueueDossierForMatching(db, dossier.id);
    const tweede = await enqueueDossierForMatching(db, dossier.id);
    expect(tweede).toEqual({ queued: false, reason: "already_queued" });

    const rows = await db.select().from(matchstationQueue);
    expect(rows).toHaveLength(1);
  });

  // Besluit Timo 20 aug: elke geslaagde import enqueuet automatisch, met bron
  // 'auto_import' in het event (ijzeren regel 5) — de knop blijft 'handmatig'.
  test("bron komt in het event: 'auto_import' bij de import, 'handmatig' als default", async () => {
    const dossier = await seedDossier();
    await enqueueDossierForMatching(db, dossier.id, "eduard@brinklicht.nl", "auto_import");
    const [ev] = await db.select().from(events).where(eq(events.action, "matchstation_enqueued"));
    expect((ev.payload as { bron?: string }).bron).toBe("auto_import");

    const ander = await seedDossier("Ander dossier");
    await enqueueDossierForMatching(db, ander.id, "eduard@brinklicht.nl");
    const evs = await db.select().from(events).where(eq(events.action, "matchstation_enqueued"));
    const evAnder = evs.find((e) => e.entityId === ander.id);
    expect((evAnder?.payload as { bron?: string }).bron).toBe("handmatig");
  });

  // Het 0-regels-geval: een import zonder herkende regels (recordPdfImport met een lege
  // lines-array, run wél 'bevestigd') enqueuet gewoon — het matchstation leest de bron
  // zelf. En de auto-enqueue is idempotent: een tweede import erna maakt geen tweede rij.
  test("import met 0 regels enqueuet alsnog, en een tweede import erna niet dubbel", async () => {
    const dossier = await seedDossier();
    await recordPdfImport(db, {
      dossierId: dossier.id,
      filename: "leeg.pdf",
      lines: [],
      rawMarkdown: "",
      actor: "eduard@brinklicht.nl",
    });
    const eerste = await enqueueDossierForMatching(db, dossier.id, "eduard@brinklicht.nl", "auto_import");
    expect(eerste.queued).toBe(true);

    const tweede = await enqueueDossierForMatching(db, dossier.id, "eduard@brinklicht.nl", "auto_import");
    expect(tweede).toEqual({ queued: false, reason: "already_queued" });
    const rows = await db.select().from(matchstationQueue);
    expect(rows).toHaveLength(1);
  });
});

describe("claimNextDossier", () => {
  test("claimt de oudste wachtende rij en zet de lease", async () => {
    const oud = await seedDossier("Oud dossier");
    const nieuw = await seedDossier("Nieuw dossier");
    const oudeRij = await enqueueDossierForMatching(db, oud.id);
    // handmatig een oudere enqueuedAt zetten zodat de volgorde ondubbelzinnig is
    await db
      .update(matchstationQueue)
      .set({ enqueuedAt: new Date(Date.now() - 60_000) })
      .where(eq(matchstationQueue.id, (oudeRij as { id: string }).id));
    await enqueueDossierForMatching(db, nieuw.id);

    const claim = await claimNextDossier(db);
    expect(claim?.dossierId).toBe(oud.id);
    expect(claim?.leaseUntil.getTime()).toBeGreaterThan(Date.now());

    const [row] = await db
      .select()
      .from(matchstationQueue)
      .where(eq(matchstationQueue.dossierId, oud.id));
    expect(row.status).toBe("geclaimd");
  });

  test("een tweede claim tijdens een geldige lease levert niets op — nooit twee machines op hetzelfde dossier", async () => {
    const dossier = await seedDossier();
    await enqueueDossierForMatching(db, dossier.id);
    const eerste = await claimNextDossier(db);
    expect(eerste).not.toBeNull();

    const tweede = await claimNextDossier(db);
    expect(tweede).toBeNull();
  });

  test("na verval van de lease is het dossier weer opnieuw claimbaar", async () => {
    const dossier = await seedDossier();
    await enqueueDossierForMatching(db, dossier.id);
    const eerste = await claimNextDossier(db, 15);
    expect(eerste).not.toBeNull();

    // lease kunstmatig laten verlopen
    await db
      .update(matchstationQueue)
      .set({ leaseUntil: new Date(Date.now() - 1000) })
      .where(eq(matchstationQueue.dossierId, dossier.id));

    const tweede = await claimNextDossier(db, 15);
    expect(tweede?.dossierId).toBe(dossier.id);
  });

  test("geen wachtende rijen → null, geen crash", async () => {
    const claim = await claimNextDossier(db);
    expect(claim).toBeNull();
  });
});

describe("markJobProcessed", () => {
  test("zet de job op 'verwerkt' met een tijdstip", async () => {
    const dossier = await seedDossier();
    await enqueueDossierForMatching(db, dossier.id);
    const claim = await claimNextDossier(db);
    await markJobProcessed(db, claim!.id);

    const [row] = await db.select().from(matchstationQueue).where(eq(matchstationQueue.id, claim!.id));
    expect(row.status).toBe("verwerkt");
    expect(row.resultReceivedAt).not.toBeNull();
  });
});

// ── Het antwoordcontract → statusmapping ────────────────────────────────────────

async function seedLine(dossierId: string, fixtureCode = "Lp301") {
  const [line] = await db
    .insert(specLines)
    .values({ dossierId, fixtureCode, brandText: "Flos" })
    .returning();
  return line;
}

async function seedJob(dossierId: string) {
  await enqueueDossierForMatching(db, dossierId);
  const claim = await claimNextDossier(db);
  return claim!;
}

describe("applyMatchstationResult — statusmapping (één test per uitkomst)", () => {
  test("gevonden → groen, product vastgezet, chosenBy = system:matchstation", async () => {
    const dossier = await seedDossier();
    const line = await seedLine(dossier.id);
    const job = await seedJob(dossier.id);
    const { productId } = await seedBrandProduct(db, { brand: "Flos", name: "Bellhop Glass C2", price: "845.00" });

    const out = await applyMatchstationResult(db, {
      queueId: job.id,
      dossierId: dossier.id,
      result: {
        specLineId: line.id,
        uitkomst: "gevonden",
        productId,
        toelichting: "Exacte naam- en merktreffer, één kandidaat.",
        bewijs: { merkBevestigd: "Flos", naamTreffer: "exact", kandidatenOver: 1 },
      },
    });

    expect(out).toMatchObject({ applied: "result", status: "groen", reviewKind: null });
    const [row] = await db.select().from(specLines).where(eq(specLines.id, line.id));
    expect(row.matchedProductId).toBe(productId);
    expect(row.status).toBe("groen");

    const [cand] = await db.select().from(specLineCandidates).where(eq(specLineCandidates.specLineId, line.id));
    expect(cand.chosen).toBe(true);
    expect(cand.chosenBy).toBe("system:matchstation");
    expect(cand.chosenReason).toBe("Exacte naam- en merktreffer, één kandidaat.");
  });

  test("gevonden met een niet-zichtbaar product_id zakt terug naar onzeker — nooit een spookmatch", async () => {
    const dossier = await seedDossier();
    const line = await seedLine(dossier.id);
    const job = await seedJob(dossier.id);

    const out = await applyMatchstationResult(db, {
      queueId: job.id,
      dossierId: dossier.id,
      result: { specLineId: line.id, uitkomst: "gevonden", productId: crypto.randomUUID() },
    });

    expect(out).toMatchObject({ applied: "result", status: "open", reviewKind: "onzeker" });
    const [row] = await db.select().from(specLines).where(eq(specLines.id, line.id));
    expect(row.matchedProductId).toBeNull();

    const [ev] = await db
      .select()
      .from(events)
      .where(eq(events.action, "matchstation_product_not_visible"));
    expect(ev).toBeTruthy();
  });

  test("meerdere → geel, review_kind 'geel' (besluit 13 aug, niet 'open' zoals de contracttabel zegt), alternatieven als onvolledig-kandidaten", async () => {
    const dossier = await seedDossier();
    const line = await seedLine(dossier.id);
    const job = await seedJob(dossier.id);
    const { productId: p1 } = await seedBrandProduct(db, { brand: "Wever & Ducré", name: "SCAVA WALL SURF 1.0", price: "226.00" });

    const out = await applyMatchstationResult(db, {
      queueId: job.id,
      dossierId: dossier.id,
      result: {
        specLineId: line.id,
        uitkomst: "meerdere",
        alternatieven: [{ productId: p1, verschil: "90 graden hoek" }],
      },
    });

    expect(out).toMatchObject({ applied: "result", status: "geel", reviewKind: "geel" });
    const [row] = await db.select().from(specLines).where(eq(specLines.id, line.id));
    expect(row.matchedProductId).toBeNull();
    const [cand] = await db.select().from(specLineCandidates).where(eq(specLineCandidates.specLineId, line.id));
    expect(cand.list).toBe("onvolledig");
    expect(cand.chosen).toBe(false);
    expect(cand.chosenReason).toBe("90 graden hoek");
  });

  test("bestaat_niet → rood, geen review_kind", async () => {
    const dossier = await seedDossier();
    const line = await seedLine(dossier.id);
    const job = await seedJob(dossier.id);
    const out = await applyMatchstationResult(db, {
      queueId: job.id,
      dossierId: dossier.id,
      result: { specLineId: line.id, uitkomst: "bestaat_niet", toelichting: "40W bestaat niet in deze serie" },
    });
    expect(out).toMatchObject({ status: "rood", reviewKind: null });
    const [row] = await db.select().from(specLines).where(eq(specLines.id, line.id));
    expect(row.noMatchReason).toBe("40W bestaat niet in deze serie");
  });

  test("merk_ontbreekt → blauw, geen review_kind, merk op de inlaadwachtrij", async () => {
    const dossier = await seedDossier();
    const line = await seedLine(dossier.id, "Ls099");
    const job = await seedJob(dossier.id);
    const out = await applyMatchstationResult(db, {
      queueId: job.id,
      dossierId: dossier.id,
      result: { specLineId: line.id, uitkomst: "merk_ontbreekt", toelichting: "Zumtobel niet in de catalogus" },
    });
    expect(out).toMatchObject({ status: "blauw", reviewKind: null });
    const wachtrij = await db.select().from((await import("@/db/schema")).brandLoadQueue);
    expect(wachtrij.some((w) => w.displayName === "Flos")).toBe(true);
  });

  test("geen_verlichting → paars, geen review_kind", async () => {
    const dossier = await seedDossier();
    const line = await seedLine(dossier.id);
    const job = await seedJob(dossier.id);
    const out = await applyMatchstationResult(db, {
      queueId: job.id,
      dossierId: dossier.id,
      result: { specLineId: line.id, uitkomst: "geen_verlichting", toelichting: "Dit is een stoel" },
    });
    expect(out).toMatchObject({ status: "paars", reviewKind: null });
  });

  test("onzeker → open + review_kind 'onzeker'", async () => {
    const dossier = await seedDossier();
    const line = await seedLine(dossier.id);
    const job = await seedJob(dossier.id);
    const out = await applyMatchstationResult(db, {
      queueId: job.id,
      dossierId: dossier.id,
      result: { specLineId: line.id, uitkomst: "onzeker", toelichting: "Twijfel tussen twee varianten" },
    });
    expect(out).toMatchObject({ status: "open", reviewKind: "onzeker" });
  });

  test("elke uitkomst logt een matchstation_result_applied-event (ijzeren regel 5)", async () => {
    const dossier = await seedDossier();
    const line = await seedLine(dossier.id);
    const job = await seedJob(dossier.id);
    await applyMatchstationResult(db, {
      queueId: job.id,
      dossierId: dossier.id,
      result: { specLineId: line.id, uitkomst: "bestaat_niet" },
    });
    const rows = await db.select().from(events).where(eq(events.action, "matchstation_result_applied"));
    expect(rows).toHaveLength(1);
    expect(rows[0].entityId).toBe(line.id);
  });

  test("fixtureCode zonder specLineId maakt de regel ter plekke aan (source 'llm')", async () => {
    const dossier = await seedDossier();
    const job = await seedJob(dossier.id);
    const out = await applyMatchstationResult(db, {
      queueId: job.id,
      dossierId: dossier.id,
      result: { fixtureCode: "Lp900", brandText: "Flos", uitkomst: "bestaat_niet" },
    });
    expect(out.applied).toBe("result");
    const rows = await db.select().from(specLines).where(eq(specLines.dossierId, dossier.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].fixtureCode).toBe("Lp900");
    expect(rows[0].source).toBe("llm");
  });

  test("een specLineId van een ander dossier wordt geweigerd", async () => {
    const dossierA = await seedDossier("A");
    const dossierB = await seedDossier("B");
    const lineB = await seedLine(dossierB.id);
    const job = await seedJob(dossierA.id);
    const out = await applyMatchstationResult(db, {
      queueId: job.id,
      dossierId: dossierA.id,
      result: { specLineId: lineB.id, uitkomst: "bestaat_niet" },
    });
    expect(out).toEqual({ applied: "skipped", reason: "wrong_dossier" });
  });
});

// ── Kostenplafond ────────────────────────────────────────────────────────────

describe("applyMatchstationResult — kostenplafond", () => {
  test("plafond geraakt → resterende regel krijgt niet_beoordeeld, nooit een kale open", async () => {
    process.env.MATCHSTATION_MAX_EUR_PER_RUN = "1.00";
    const dossier = await seedDossier();
    const lineA = await seedLine(dossier.id, "Lp001");
    const lineB = await seedLine(dossier.id, "Lp002");
    const job = await seedJob(dossier.id);

    const eerste = await applyMatchstationResult(db, {
      queueId: job.id,
      dossierId: dossier.id,
      result: { specLineId: lineA.id, uitkomst: "bestaat_niet", costEur: 0.7 },
    });
    expect(eerste.applied).toBe("result");

    const tweede = await applyMatchstationResult(db, {
      queueId: job.id,
      dossierId: dossier.id,
      result: { specLineId: lineB.id, uitkomst: "bestaat_niet", costEur: 0.5 },
    });
    expect(tweede).toEqual({ applied: "niet_beoordeeld", specLineId: lineB.id, reason: "budget" });

    const [rowB] = await db.select().from(specLines).where(eq(specLines.id, lineB.id));
    expect(rowB.status).toBe("open");
    expect(rowB.reviewKind).toBe("niet_beoordeeld");

    const usage = await db.select().from(llmUsage).where(eq(llmUsage.matchstationJobId, job.id));
    expect(usage).toHaveLength(1); // de tweede (geweigerde) kost is niet geboekt
  });

  test("een uitkomst 'gevonden' die door het plafond wordt afgekapt, koppelt geen product", async () => {
    process.env.MATCHSTATION_MAX_EUR_PER_RUN = "0.10";
    const dossier = await seedDossier();
    const line = await seedLine(dossier.id);
    const job = await seedJob(dossier.id);
    const { productId } = await seedBrandProduct(db, { brand: "Flos", name: "Bellhop", price: "800" });

    await applyMatchstationResult(db, {
      queueId: job.id,
      dossierId: dossier.id,
      result: { specLineId: line.id, uitkomst: "gevonden", productId, costEur: 5 },
    });

    const [row] = await db.select().from(specLines).where(eq(specLines.id, line.id));
    expect(row.matchedProductId).toBeNull();
    expect(row.reviewKind).toBe("niet_beoordeeld");
  });
});

// ── Heartbeat + dood-melding ─────────────────────────────────────────────────

describe("heartbeat", () => {
  test("registerHeartbeat/getLastHeartbeat rondtrip", async () => {
    expect(await getLastHeartbeat(db)).toBeNull();
    const t = new Date("2026-08-13T10:00:00Z");
    await registerHeartbeat(db, t);
    expect((await getLastHeartbeat(db))?.toISOString()).toBe(t.toISOString());
  });
});

describe("findDeadAlerts", () => {
  test("een claim >15 min zonder resultaat meldt zich, met dead_alert_sent_at als debounce", async () => {
    const dossier = await seedDossier();
    await enqueueDossierForMatching(db, dossier.id);
    const claim = await claimNextDossier(db);
    await db
      .update(matchstationQueue)
      .set({ claimedAt: new Date(Date.now() - 20 * 60_000) })
      .where(eq(matchstationQueue.id, claim!.id));

    const alerts = await findDeadAlerts(db);
    expect(alerts).toEqual([
      { kind: "claim_stale", queueId: claim!.id, dossierId: dossier.id, claimedAt: expect.any(Date) },
    ]);

    await sendDeadAlert(db, alerts[0]);
    // tweede check: geen herhaalde melding voor dezelfde claim
    const alertsNa = await findDeadAlerts(db);
    expect(alertsNa).toEqual([]);
  });

  test("een verse claim (<15 min) meldt zich niet", async () => {
    const dossier = await seedDossier();
    await enqueueDossierForMatching(db, dossier.id);
    await claimNextDossier(db);
    expect(await findDeadAlerts(db)).toEqual([]);
  });

  test("verouderde heartbeat mét wachtend werk meldt zich; zonder wachtend werk niet", async () => {
    const dossier = await seedDossier();
    await enqueueDossierForMatching(db, dossier.id);
    await registerHeartbeat(db, new Date(Date.now() - 10 * 60_000));

    const alerts = await findDeadAlerts(db);
    expect(alerts).toEqual([
      { kind: "heartbeat_stale", lastHeartbeat: expect.any(Date), pendingWork: 1 },
    ]);

    // werk claimen (niet meer 'wachtend') → geen alarm meer over ontbrekend werk
    await claimNextDossier(db);
    expect(await findDeadAlerts(db)).toEqual([]);
  });

  test("sendDeadAlert logt een event en respecteert de cooldown voor heartbeat-meldingen", async () => {
    const dossier = await seedDossier();
    await enqueueDossierForMatching(db, dossier.id);
    await registerHeartbeat(db, new Date(Date.now() - 10 * 60_000));

    const [alert] = await findDeadAlerts(db);
    await sendDeadAlert(db, alert);

    const logged = await db.select().from(events).where(eq(events.action, "matchstation_dead_alert"));
    expect(logged).toHaveLength(1);

    // binnen de cooldown geen tweede melding, ook al is de heartbeat nog steeds oud
    expect(await findDeadAlerts(db)).toEqual([]);
  });

  test("geen heartbeat ooit ontvangen, mét wachtend werk → alarm", async () => {
    const dossier = await seedDossier();
    await enqueueDossierForMatching(db, dossier.id);
    const alerts = await findDeadAlerts(db);
    expect(alerts).toEqual([
      { kind: "heartbeat_stale", lastHeartbeat: null, pendingWork: 1 },
    ]);
  });
});
