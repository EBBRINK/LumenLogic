// B6 + stap 4: het status- en fasemodel, bewezen op een echte (PGlite) database met
// dezelfde migraties als productie. `phase` is AFGELEID (regel 4: default veilig) en
// kent één schrijver; elke wijziging staat in het event-log (regel 5). Read-only is
// er alléén bij archief — niet_gegund blijft bewerkbaar (een verloren tender is data).
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import { events, projectDossiers, quotes } from "@/db/schema";
import { createDossier, generateQuote } from "@/lib/repo/dossiers";
import {
  derivePhase,
  isReadOnly,
  listDossiersFiltered,
  setStatus,
  setXisPhase,
  type ProjectStatus,
  type XisPhase,
} from "@/lib/repo/project-status";

async function getDossierRow(db: Awaited<ReturnType<typeof createTestDb>>, id: string) {
  const [row] = await db
    .select()
    .from(projectDossiers)
    .where(eq(projectDossiers.id, id));
  return row;
}

// ── derivePhase: de matrix ───────────────────────────────────────────────────
// awarded alléén bij status 'gegund' óf xis_phase ∈ {deal_making, deliver, aftersales,
// win}; alles anders = tender. Representatieve combinaties, incl. de twee expliciete
// reviewer-gevallen (concept+deal_making → awarded; niet_gegund+tender → tender).
test("derivePhase: awarded alléén bij gegund of een post-tender XIS-fase", () => {
  const matrix: [ProjectStatus, XisPhase, "tender" | "awarded"][] = [
    // default veilig
    ["concept", "start", "tender"],
    ["concept", "engineering", "tender"],
    ["concept", "tender", "tender"],
    ["estimate_gestuurd", "calculations", "tender"],
    ["estimate_gestuurd", "presenting", "tender"],
    ["offerte", "tender", "tender"],
    // reviewer-geval: status concept maar XIS zegt deal_making → awarded-gedrag
    ["concept", "deal_making", "awarded"],
    // status gegund wint altijd, ongeacht de XIS-fase
    ["gegund", "start", "awarded"],
    ["gegund", "tender", "awarded"],
    ["gegund", "lost", "awarded"],
    // post-tender XIS-fasen → awarded, ook zonder status gegund
    ["offerte", "deliver", "awarded"],
    ["estimate_gestuurd", "aftersales", "awarded"],
    ["concept", "win", "awarded"],
    // reviewer-geval: niet gegund + tender → tender-gedrag (geen suggesties)
    ["niet_gegund", "tender", "tender"],
    ["niet_gegund", "lost", "tender"],
    // lost is GEEN awarded-fase; archief volgt gewoon de regel
    ["concept", "lost", "tender"],
    ["archief", "tender", "tender"],
    ["archief", "deal_making", "awarded"],
  ];
  for (const [status, xisPhase, expected] of matrix) {
    expect(derivePhase(status, xisPhase), `${status} × ${xisPhase}`).toBe(expected);
  }
});

test("isReadOnly: alléén archief; niet_gegund blijft bewerkbaar", () => {
  expect(isReadOnly("archief")).toBe(true);
  for (const s of [
    "concept",
    "estimate_gestuurd",
    "offerte",
    "gegund",
    "niet_gegund",
  ] as ProjectStatus[]) {
    expect(isReadOnly(s), s).toBe(false);
  }
});

// ── createDossier: altijd concept, phase afgeleid ────────────────────────────
test("createDossier: status concept, phase afgeleid van de XIS-fase", async () => {
  const db = await createTestDb();
  const veilig = await createDossier(db, { name: "Nieuw", actor: "timo@brink" });
  expect(veilig.status).toBe("concept");
  expect(veilig.xisPhase).toBe("start");
  expect(veilig.phase).toBe("tender"); // default = veilig (regel 4)

  // Wie een project ná gunning invoert (xis deal_making) krijgt meteen awarded.
  const laat = await createDossier(db, {
    name: "Laat ingevoerd",
    xisPhase: "deal_making",
  });
  expect(laat.status).toBe("concept");
  expect(laat.phase).toBe("awarded");
});

// ── setStatus: status + phase in één beweging, gelogd ────────────────────────
test("setStatus gegund: phase gaat mee naar awarded + status_changed-event met phase_changed", async () => {
  const db = await createTestDb();
  const d = await createDossier(db, { name: "Ziekenhuis Noord" });
  await setStatus(db, d.id, "gegund", "timo@brink");

  const row = await getDossierRow(db, d.id);
  expect(row.status).toBe("gegund");
  expect(row.phase).toBe("awarded");
  // Bewust besluit: deliveredAt hoort bij het oude lifecycle-"opgeleverd", niet bij
  // gunning — blijft leeg (deprecated, net als de lifecycle-kolom zelf).
  expect(row.deliveredAt).toBeNull();

  const logged = await db.select().from(events).where(eq(events.action, "status_changed"));
  expect(logged).toHaveLength(1);
  expect(logged[0].actor).toBe("timo@brink");
  expect(logged[0].payload).toMatchObject({
    from: "concept",
    to: "gegund",
    phase_changed: { from: "tender", to: "awarded" },
  });
});

test("setStatus niet_gegund ná gegund: phase valt terug naar tender en blijft bewerkbaar", async () => {
  const db = await createTestDb();
  const d = await createDossier(db, { name: "Kantoor Zuid" });
  await setStatus(db, d.id, "gegund", "timo@brink");
  await setStatus(db, d.id, "niet_gegund", "timo@brink");

  const row = await getDossierRow(db, d.id);
  expect(row.status).toBe("niet_gegund");
  expect(row.phase).toBe("tender"); // suggesties weer dicht (regel 4)
  expect(isReadOnly(row.status)).toBe(false);
});

test("setStatus zonder fasewissel: event zónder phase_changed in de payload", async () => {
  const db = await createTestDb();
  const d = await createDossier(db, { name: "School West" });
  await setStatus(db, d.id, "offerte", "timo@brink");
  const [e] = await db.select().from(events).where(eq(events.action, "status_changed"));
  expect(e.payload).toMatchObject({ from: "concept", to: "offerte" });
  expect((e.payload as Record<string, unknown>).phase_changed).toBeUndefined();
});

// ── setXisPhase ──────────────────────────────────────────────────────────────
test("setXisPhase deal_making bij status concept: phase awarded + xis_phase_changed-event", async () => {
  const db = await createTestDb();
  const d = await createDossier(db, { name: "Museum Oost" });
  await setXisPhase(db, d.id, "deal_making", "timo@brink");

  const row = await getDossierRow(db, d.id);
  expect(row.status).toBe("concept"); // status blijft — alleen de XIS-fase wijzigde
  expect(row.xisPhase).toBe("deal_making");
  expect(row.phase).toBe("awarded"); // reviewer-geval: awarded-gedrag zónder gegund

  const logged = await db
    .select()
    .from(events)
    .where(eq(events.action, "xis_phase_changed"));
  expect(logged).toHaveLength(1);
  expect(logged[0].actor).toBe("timo@brink");
  expect(logged[0].payload).toMatchObject({
    from: "start",
    to: "deal_making",
    phase_changed: { from: "tender", to: "awarded" },
  });

  // Terug naar tender-fase → phase weer veilig.
  await setXisPhase(db, d.id, "tender", "timo@brink");
  expect((await getDossierRow(db, d.id)).phase).toBe("tender");
});

// ── archief: reden verplicht + read-only + heropenen wist markeringen ────────
test("archief vereist een reden; zet archivedReason/archivedAt en is read-only", async () => {
  const db = await createTestDb();
  const d = await createDossier(db, { name: "Verloren tender" });

  await expect(setStatus(db, d.id, "archief", "timo@brink")).rejects.toThrow(
    /Reason required/,
  );
  await expect(
    setStatus(db, d.id, "archief", "timo@brink", { reason: "   " }),
  ).rejects.toThrow(/Reason required/);
  // geweigerd → niets veranderd
  expect((await getDossierRow(db, d.id)).status).toBe("concept");

  await setStatus(db, d.id, "archief", "timo@brink", { reason: "verloren tender" });
  const row = await getDossierRow(db, d.id);
  expect(row.status).toBe("archief");
  expect(row.archivedReason).toBe("verloren tender");
  expect(row.archivedAt).toBeInstanceOf(Date);
  expect(isReadOnly(row.status)).toBe(true);

  // Heropenen (terug naar concept) wist de archiveringsmarkeringen.
  await setStatus(db, d.id, "concept", "timo@brink");
  const heropend = await getDossierRow(db, d.id);
  expect(heropend.status).toBe("concept");
  expect(heropend.archivedReason).toBeNull();
  expect(heropend.archivedAt).toBeNull();
});

// ── estimate_gestuurd: koppelt de quote-freeze (I-06) ────────────────────────
test("estimate_gestuurd freezet een bestaande, niet-bevroren quote + quote_frozen-event", async () => {
  const db = await createTestDb();
  const d = await createDossier(db, { name: "Hotel Centrum" });
  const quote = await generateQuote(db, d.id, "timo@brink");
  expect(quote.frozenAt).toBeNull();

  await setStatus(db, d.id, "estimate_gestuurd", "timo@brink");
  const [frozen] = await db.select().from(quotes).where(eq(quotes.id, quote.id));
  expect(frozen.frozenAt).toBeInstanceOf(Date);

  const logged = await db.select().from(events).where(eq(events.action, "quote_frozen"));
  expect(logged).toHaveLength(1);
  expect(logged[0].payload).toMatchObject({
    dossierId: d.id,
    trigger: "status_estimate_gestuurd",
  });

  // Nog een keer estimate_gestuurd: al bevroren → geen tweede freeze-event.
  await setStatus(db, d.id, "concept", "timo@brink");
  await setStatus(db, d.id, "estimate_gestuurd", "timo@brink");
  const again = await db.select().from(events).where(eq(events.action, "quote_frozen"));
  expect(again).toHaveLength(1);
});

test("estimate_gestuurd zonder quote: status wijzigt gewoon, geen freeze-event", async () => {
  const db = await createTestDb();
  const d = await createDossier(db, { name: "Zonder estimate" });
  await setStatus(db, d.id, "estimate_gestuurd", "timo@brink");
  expect((await getDossierRow(db, d.id)).status).toBe("estimate_gestuurd");
  expect(
    await db.select().from(events).where(eq(events.action, "quote_frozen")),
  ).toHaveLength(0);
});

// ── listDossiersFiltered: statusfilter, default verbergt archief ─────────────
test("listDossiersFiltered: zonder filter alles behálve archief; per-statusfilter werkt", async () => {
  const db = await createTestDb();
  const a = await createDossier(db, { name: "A concept" });
  const b = await createDossier(db, { name: "B gegund" });
  const c = await createDossier(db, { name: "C archief" });
  await setStatus(db, b.id, "gegund", "timo@brink");
  await setStatus(db, c.id, "archief", "timo@brink", { reason: "vervallen" });

  const alle = await listDossiersFiltered(db);
  expect(alle.map((d) => d.name).sort()).toEqual(["A concept", "B gegund"]);

  const gegund = await listDossiersFiltered(db, "gegund");
  expect(gegund.map((d) => d.name)).toEqual(["B gegund"]);

  const archief = await listDossiersFiltered(db, "archief");
  expect(archief.map((d) => d.name)).toEqual(["C archief"]);

  const concept = await listDossiersFiltered(db, "concept");
  expect(concept.map((d) => d.name)).toEqual(["A concept"]);

  const nietGegund = await listDossiersFiltered(db, "niet_gegund");
  expect(nietGegund).toHaveLength(0);
});

// Volgordebehoud (zelfde gedrag als het oude filter): recentst bijgewerkt bovenaan.
test("listDossiersFiltered: recentst bijgewerkt eerst", async () => {
  const db = await createTestDb();
  const a = await createDossier(db, { name: "Oud" });
  const b = await createDossier(db, { name: "Nieuw" });
  // a expliciet later bijwerken → bovenaan
  await db
    .update(projectDossiers)
    .set({ updatedAt: new Date(Date.now() + 60_000) })
    .where(eq(projectDossiers.id, a.id));
  const rows = await listDossiersFiltered(db);
  expect(rows[0].id).toBe(a.id);
  expect(rows[1].id).toBe(b.id);
});
