// De sessiepoort onder de werkbank-acties van Admin (reviewzwerm 2.5a, bevinding B12).
// Stond tot 12 aug als app/data/data-gate.test.ts onder de Data-werkbank; die is met de
// IA-opschoning opgeheven en de twee acties staan sindsdien naast hun eigen scherm.
//
// De acties in app/admin/{loading,evaluation}/actions.ts muteren de gedeelde catalogus-administratie
// (inlaadwachtrij, metingen). Tot deze pas bewees geen enkele test dat
// `await requireSession()` hier iets doet. Elke test hieronder bewijst twee dingen
// tegelijk: NEXT_REDIRECT naar /login én een ONGEWIJZIGDE database — dat tweede
// scheidt "de poort weigerde" van "de action deed zijn werk en navigeerde daarna".
import { expect, test, vi } from "vitest";
import { brandLoadQueue } from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-db";
import { listEvaluationRuns } from "@/lib/repo/evaluation";
import { seedInternLid } from "@/db/test-org";

const harnas = vi.hoisted(() => ({
  db: null as unknown,
  email: "timo@brink.nl",
  // De schakelaar: `true` = geen sessie.
  uitgelogd: false,
}));

// db/client.ts praat met Neon en gooit al bij import zonder DATABASE_URL; hier komt de
// PGlite-testdatabase ervoor in de plaats. De proxy bindt methodes aan de échte
// drizzle-instantie, anders verliezen ze hun `this`.
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

// De mock volgt lib/session.ts regel voor regel: bij een lege sessie het ECHTE
// redirect() uit next/navigation, niet een zelfverzonnen throw — anders test dit
// bestand zijn eigen mock in plaats van Next' navigatiesignaal.
vi.mock("@/lib/session", async () => {
  const { redirect } = await import("next/navigation");
  const sessie = () =>
    harnas.uitgelogd ? null : { user: { email: harnas.email } };
  return {
    getSession: async () => sessie(),
    requireSession: async () => {
      const s = sessie();
      if (!s) redirect("/login");
      return s;
    },
    getActor: async () => sessie()?.user.email ?? "anoniem",
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

const { markLoadedAction } = await import("./loading/actions");
const { measureAction } = await import("./evaluation/actions");

async function verseDb() {
  const db = (await createTestDb()) as TestDb;
  harnas.db = db;
  // 3.2a: de poorten hangen aan een lidmaatschap, niet alleen aan een sessie.
  await seedInternLid(db, harnas.email);
  return db;
}

async function seedWachtrij(db: TestDb) {
  const [row] = await db
    .insert(brandLoadQueue)
    .values({ brandKey: "xal", displayName: "XAL", frequency: 3 })
    .returning();
  return row.id;
}

function post(velden: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(velden)) fd.set(k, v);
  return fd;
}

// redirect() gooit een fout met `digest` "NEXT_REDIRECT;…;/login;…". Loopt de action
// gewoon door, dan staat de poort open — dan faalt deze helper met een leesbare reden.
async function redirectVanUitgelogde(run: () => Promise<unknown>): Promise<string> {
  harnas.uitgelogd = true;
  try {
    await run();
  } catch (e) {
    const digest = (e as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return digest;
    throw e;
  } finally {
    harnas.uitgelogd = false;
  }
  throw new Error(
    "de action liep door zonder redirect — de sessiepoort staat open",
  );
}

const wachtrijStatus = async (db: TestDb) =>
  (await db.select().from(brandLoadQueue)).map((r) => r.status);

test("uitgelogd: markLoadedAction laat het merk op 'wachtend' staan", async () => {
  const db = await verseDb();
  const queueId = await seedWachtrij(db);

  const digest = await redirectVanUitgelogde(() =>
    markLoadedAction(post({ queueId })),
  );
  expect(digest).toContain("/login");

  expect(await wachtrijStatus(db)).toEqual(["wachtend"]);
});

test("ingelogd: dezelfde POST markeert het merk wél als ingeladen", async () => {
  const db = await verseDb();
  const queueId = await seedWachtrij(db);

  await markLoadedAction(post({ queueId }));

  expect(await wachtrijStatus(db)).toEqual(["ingeladen"]);
});

test("uitgelogd: measureAction schrijft geen meting weg", async () => {
  const db = await verseDb();

  const digest = await redirectVanUitgelogde(() =>
    measureAction(post({ label: "meting van een vreemde" })),
  );
  expect(digest).toContain("/login");

  expect(await listEvaluationRuns(db)).toEqual([]);
});

test("ingelogd: dezelfde POST schrijft de meting wél weg", async () => {
  const db = await verseDb();

  await measureAction(post({ label: "meting van Timo" }));

  expect((await listEvaluationRuns(db)).map((r) => r.label)).toEqual([
    "meting van Timo",
  ]);
});
