// De sessiepoort onder de projectacties, gemeten aan de ECHTE server-actions
// (reviewzwerm 2.5a, bevinding B12).
//
// Waarom dit bestand bestaat: `requireSession()` (lib/session.ts:10-14) is de enige
// autorisatie in de app en wordt op ~90 plekken aangeroepen, maar géén enkele test
// dreef er een lege sessie doorheen. De drie testbestanden die `@/lib/session` mocken
// gaven altijd een sessie terug — de poort was per constructie een altijd-ja. Het
// gemeten faalscenario: schrap `await requireSession();` uit app/projects/actions.ts
// en de hele suite bleef groen.
//
// Wat een poort-test moet bewijzen is dus twee dingen tegelijk:
//   1. de action breekt af met Next' NEXT_REDIRECT naar /login, en
//   2. de database is NIET geraakt.
// Alleen (1) zou ook waar zijn voor een action die zijn werk deed en daarna toevallig
// navigeerde (createDossierAction, setStatusAction en deleteLineAction redirecten of
// muteren allemaal ook in het geslaagde pad). De rij-assertie is de bewijskracht.
//
// De contra-tests ("ingelogd doet dezelfde POST het wél") staan er expres naast: zonder
// die zou een test die per ongeluk niets meet ook groen zijn.
import { expect, test, vi } from "vitest";
import { projectDossiers, specLines } from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-db";
import { seedInternLid } from "@/db/test-org";

const harnas = vi.hoisted(() => ({
  db: null as unknown,
  email: "tester@voorbeeld.nl",
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
// redirect() uit next/navigation, niet een zelfverzonnen throw. Anders test dit
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

// revalidatePath heeft buiten een request-scope geen store; de acties roepen hem wel aan.
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

const { createDossierAction, setStatusAction, deleteLineAction } = await import(
  "./actions"
);

async function verseDb() {
  const db = (await createTestDb()) as TestDb;
  harnas.db = db;
  // 3.2a: de poorten hangen aan een lidmaatschap, niet alleen aan een sessie.
  await seedInternLid(db, harnas.email);
  return db;
}

async function seedProject(db: TestDb) {
  const [dossier] = await db
    .insert(projectDossiers)
    .values({ name: "Ziekenhuis Noord", customer: "Deerns" })
    .returning();
  const [line] = await db
    .insert(specLines)
    .values({ dossierId: dossier.id, fixtureCode: "Lp301", quantity: 12 })
    .returning();
  return { dossierId: dossier.id, specLineId: line.id };
}

function post(velden: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(velden)) fd.set(k, v);
  return fd;
}

// redirect() gooit een fout met `digest` "NEXT_REDIRECT;…;/login;…". Loopt de action
// gewoon door, dan staat de poort open — dan faalt deze helper met een leesbare reden
// in plaats van pas bij de rij-assertie eronder.
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

const projecten = async (db: TestDb) =>
  (await db.select().from(projectDossiers)).map((r) => r.name);

// ── Aanmaken ─────────────────────────────────────────────────────────────────

test("uitgelogd: createDossierAction maakt geen project aan en stuurt naar /login", async () => {
  const db = await verseDb();

  const digest = await redirectVanUitgelogde(() =>
    createDossierAction(post({ name: "Ziekenhuis Noord" })),
  );
  // Beide paden redirecten; alleen de bestemming verraadt wélke. Ingelogd is dat
  // /projects/<id> (zie de contra-test hieronder).
  expect(digest).toContain("/login");

  expect(await projecten(db)).toEqual([]);
});

test("ingelogd: dezelfde POST maakt het project wél aan", async () => {
  const db = await verseDb();

  let digest = "";
  try {
    await createDossierAction(post({ name: "Ziekenhuis Noord" }));
  } catch (e) {
    digest = (e as { digest?: string }).digest ?? "";
  }
  expect(digest).toContain("/projects/");
  expect(digest).not.toContain("/login");

  expect(await projecten(db)).toEqual(["Ziekenhuis Noord"]);
});

// ── Wijzigen ─────────────────────────────────────────────────────────────────

test("uitgelogd: setStatusAction laat de status staan waar hij stond", async () => {
  const db = await verseDb();
  const { dossierId } = await seedProject(db);

  const digest = await redirectVanUitgelogde(() =>
    setStatusAction(post({ dossierId, status: "gegund" })),
  );
  expect(digest).toContain("/login");

  // 'gegund' zet ook `phase` op awarded (de veiligheidsschakelaar, regel 4) — dat is
  // precies waarom deze action achter de poort hoort te zitten.
  const [na] = await db.select().from(projectDossiers);
  expect(na.status).toBe("concept");
  expect(na.phase).toBe("tender");
});

test("ingelogd: dezelfde statuswijziging komt er wél door", async () => {
  const db = await verseDb();
  const { dossierId } = await seedProject(db);

  await setStatusAction(post({ dossierId, status: "gegund" }));

  const [na] = await db.select().from(projectDossiers);
  expect(na.status).toBe("gegund");
});

// ── Verwijderen ──────────────────────────────────────────────────────────────

test("uitgelogd: deleteLineAction laat de regel staan", async () => {
  const db = await verseDb();
  const { dossierId, specLineId } = await seedProject(db);

  const digest = await redirectVanUitgelogde(() =>
    deleteLineAction(post({ dossierId, specLineId })),
  );
  expect(digest).toContain("/login");

  expect((await db.select().from(specLines)).map((r) => r.fixtureCode)).toEqual([
    "Lp301",
  ]);
});

test("ingelogd: dezelfde POST verwijdert de regel wél", async () => {
  const db = await verseDb();
  const { dossierId, specLineId } = await seedProject(db);

  await deleteLineAction(post({ dossierId, specLineId }));

  expect(await db.select().from(specLines)).toEqual([]);
});
