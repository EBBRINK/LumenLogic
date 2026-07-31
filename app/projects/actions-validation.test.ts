// Invoervalidatie op de echte server actions (reviewzwerm 2.5a, A10 en volgende).
//
// Gemeten aan de ÉCHTE action, niet aan een nagebouwde helper: het punt van deze
// bevindingen is juist dat de vorm van de invoer nergens werd gecontroleerd op de plek
// waar hij binnenkomt. De conventie staat in docs/INVOERVALIDATIE.md.
//
// Harnas: PGlite in plaats van Neon, sessie gemockt, revalidatePath uitgezet — zelfde
// opzet als app/settings/settings-actions.test.ts.
import { expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { events, projectDossiers, specLines } from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-db";

const harnas = vi.hoisted(() => ({
  db: null as unknown,
  email: "eduard@brinklicht.nl",
}));

vi.mock("@/db/client", () => ({
  db: new Proxy(
    {},
    {
      get(_target, prop) {
        const echt = harnas.db as Record<string | symbol, unknown>;
        const waarde = echt[prop];
        return typeof waarde === "function" ? waarde.bind(echt) : waarde;
      },
    },
  ),
}));

vi.mock("@/lib/session", () => ({
  getSession: async () => ({ user: { email: harnas.email } }),
  requireSession: async () => ({ user: { email: harnas.email } }),
  getActor: async () => harnas.email,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

const { addSpecCsvAction, flagReviewAction, setDayPriceAction } = await import("./actions");
const { setDayPrice, SPEC_CSV_MAX_LINES } = await import("@/lib/repo/dossiers");

async function seed() {
  const db = (await createTestDb()) as TestDb;
  harnas.db = db;
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Ziekenhuis Noord" })
    .returning();
  const [line] = await db
    .insert(specLines)
    .values({ dossierId: dossier.id, fixtureCode: "Lp301", status: "groen" })
    .returning();
  return { db, dossier, line };
}

async function regel(db: TestDb, id: string) {
  const [row] = await db.select().from(specLines).where(eq(specLines.id, id));
  return row;
}

// ── C3: flagReviewAction gaf een 500 op een onbekende `kind` ─────────────────
//
// `kind` werd met `as` gecast en ging zo rechtstreeks een pgEnum in →
// `invalid input value for enum review_kind` (22P02). Met de oude versie REJECT deze
// call; nu wordt de invoer afgewezen en verandert er niets.

test("C3: een onbekende review-kind crasht niet en verandert niets", async () => {
  const { db, dossier, line } = await seed();

  for (const rommel of ["rood", "", "GEEL", "geel; drop table spec_lines"]) {
    const fd = new FormData();
    fd.set("dossierId", dossier.id);
    fd.set("specLineId", line.id);
    fd.set("kind", rommel);
    await expect(flagReviewAction(fd)).resolves.toBeUndefined();
    expect((await regel(db, line.id)).reviewKind).toBeNull();
  }
});

test("C3: een geldige review-kind zet de regel gewoon in de wachtrij", async () => {
  const { db, dossier, line } = await seed();

  for (const goed of ["geel", "variant", "onvolledig", "ocr"] as const) {
    const fd = new FormData();
    fd.set("dossierId", dossier.id);
    fd.set("specLineId", line.id);
    fd.set("kind", goed);
    await flagReviewAction(fd);
    const na = await regel(db, line.id);
    expect(na.reviewKind).toBe(goed);
    expect(na.reviewedAt).toBeNull();
  }
});

// De id's zijn nu óók gecontroleerd: een niet-uuid ging eerder een uuid-kolom in en gaf
// `invalid input syntax for type uuid` — dezelfde categorie fout, ander veld.
test("C3: een niet-uuid id crasht niet en schrijft niets", async () => {
  const { db, dossier, line } = await seed();

  const kapotteLijn = new FormData();
  kapotteLijn.set("dossierId", dossier.id);
  kapotteLijn.set("specLineId", "nope");
  kapotteLijn.set("kind", "geel");
  await expect(flagReviewAction(kapotteLijn)).resolves.toBeUndefined();

  const kapotDossier = new FormData();
  kapotDossier.set("dossierId", "nope");
  kapotDossier.set("specLineId", line.id);
  kapotDossier.set("kind", "geel");
  await expect(flagReviewAction(kapotDossier)).resolves.toBeUndefined();

  expect((await regel(db, line.id)).reviewKind).toBeNull();
});

// ── C4: setDayPrice accepteerde negatieve prijzen ────────────────────────────
//
// `numOrNull` controleerde alleen op NaN. De keten setDayPrice → numeric(12,2) →
// countedLineTotal deed nergens een tekencontrole; de enige grens stond in de UI
// (type=number min=0), en dat is uitleg voor de gebruiker, geen regel van het systeem.
// Dit raakt geld, dus het staat op twee plekken — hier allebei getest.

// De action redirect altijd (terug naar de regel), dus de digest is het signaal.
async function digestVan(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    return String((e as { digest?: string }).digest ?? "");
  }
  throw new Error("verwacht een throw (redirect/notFound), maar de call resolvede");
}

test("C4: een negatieve dagprijs wordt niet opgeslagen", async () => {
  const { db, dossier, line } = await seed();

  for (const negatief of ["-1", "-5000", "-0,01", "-0.01"]) {
    const fd = new FormData();
    fd.set("dossierId", dossier.id);
    fd.set("specLineId", line.id);
    fd.set("price", negatief);
    // De gebruiker keert terug naar dezelfde regel; er is alleen niets veranderd.
    expect(await digestVan(() => setDayPriceAction(fd))).toContain("NEXT_REDIRECT");
    expect((await regel(db, line.id)).manualPrice).toBeNull();
  }
});

test("C4: een geldige dagprijs wordt gewoon opgeslagen, nul inbegrepen", async () => {
  const { db, dossier, line } = await seed();

  const fd = new FormData();
  fd.set("dossierId", dossier.id);
  fd.set("specLineId", line.id);
  fd.set("price", "310,50");
  fd.set("validUntil", "2026-12-31");
  expect(await digestVan(() => setDayPriceAction(fd))).toContain(
    `/projects/${dossier.id}/line/${line.id}`,
  );
  const na = await regel(db, line.id);
  expect(na.manualPrice).toBe("310.50");
  expect(na.manualPriceValidUntil).toBe("2026-12-31");
  expect(na.manualPriceSetBy).toBe(harnas.email);

  // 0 is een echte uitkomst ("gratis meegeleverd") en mag niet met negatief op één hoop.
  const gratis = new FormData();
  gratis.set("dossierId", dossier.id);
  gratis.set("specLineId", line.id);
  gratis.set("price", "0");
  await digestVan(() => setDayPriceAction(gratis));
  expect((await regel(db, line.id)).manualPrice).toBe("0.00");
});

// De domeininvariant zelf, los van welk formulier er langskwam. Deze gooit wél: op dit
// punt is de invoer al door een schema geweest, dus een negatief bedrag betekent dat een
// andere aanroeper de regel omzeilt.
test("C4: setDayPrice weigert een negatief bedrag ook rechtstreeks", async () => {
  const { db, line } = await seed();

  await expect(
    setDayPrice(db, { specLineId: line.id, price: -5000, actor: harnas.email }),
  ).rejects.toThrow(/negatief/);
  await expect(
    setDayPrice(db, { specLineId: line.id, price: Number.NaN, actor: harnas.email }),
  ).rejects.toThrow();
  expect((await regel(db, line.id)).manualPrice).toBeNull();

  // En de tegenproef: 0 en positief gaan er gewoon doorheen.
  await setDayPrice(db, { specLineId: line.id, price: 0, actor: harnas.email });
  expect((await regel(db, line.id)).manualPrice).toBe("0.00");
  await setDayPrice(db, { specLineId: line.id, price: 42.5, actor: harnas.email });
  expect((await regel(db, line.id)).manualPrice).toBe("42.50");
});

// ── B6: addSpecCsvAction had geen bovengrens ─────────────────────────────────
//
// Geen cap in parseSpecCsv, niet in addSpecLines en niet in de action — en daarna één
// matcher PER REGEL. Zelf-DoS. Alles-of-niets, want half inlezen levert precies het half
// gematchte dossier op dat we willen voorkomen.

function csvBlok(aantal: number): string {
  const regels = [];
  for (let i = 0; i < aantal; i++) regels.push(`Lp${1000 + i}, 1, XAL, SASSO 100`);
  return regels.join("\n");
}

async function regelsIn(db: TestDb, dossierId: string) {
  return db.select().from(specLines).where(eq(specLines.dossierId, dossierId));
}

test("B6: een CSV-blok boven de bovengrens wordt in zijn geheel geweigerd", async () => {
  const { db, dossier } = await seed();
  const voor = (await regelsIn(db, dossier.id)).length;

  const fd = new FormData();
  fd.set("dossierId", dossier.id);
  fd.set("csv", csvBlok(SPEC_CSV_MAX_LINES + 1));
  await expect(addSpecCsvAction(fd)).resolves.toBeUndefined();

  // Niets ingelezen — geen half gematcht dossier.
  expect((await regelsIn(db, dossier.id)).length).toBe(voor);

  // En het is niet spoorloos (regel 5): er staat een event.
  const gelogd = await db
    .select()
    .from(events)
    .where(eq(events.action, "spec_csv_rejected_too_large"));
  expect(gelogd).toHaveLength(1);
  expect(gelogd[0].payload).toMatchObject({
    lines: SPEC_CSV_MAX_LINES + 1,
    max: SPEC_CSV_MAX_LINES,
  });
});

test("B6: precies op de grens gaat er nog gewoon doorheen", async () => {
  const { db, dossier } = await seed();
  const voor = (await regelsIn(db, dossier.id)).length;

  const fd = new FormData();
  fd.set("dossierId", dossier.id);
  fd.set("csv", csvBlok(SPEC_CSV_MAX_LINES));
  await addSpecCsvAction(fd);

  expect((await regelsIn(db, dossier.id)).length).toBe(voor + SPEC_CSV_MAX_LINES);
  expect(
    await db.select().from(events).where(eq(events.action, "spec_csv_rejected_too_large")),
  ).toHaveLength(0);
});
