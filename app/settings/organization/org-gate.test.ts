// De sessiepoort onder de organisatie-acties (reviewzwerm 2.5a, bevinding B12).
//
// Deze acties schrijven de org- en lidmaatschapstabellen — de rollen waar de
// vier-rollen-boom op leunt. Tot deze pas dekte geen enkele test dat
// `await requireSession()` hier iets doet; de bestaande harnassen mockten de sessie
// juist weg met een altijd-ja. Elke test hieronder bewijst twee dingen tegelijk:
// NEXT_REDIRECT naar /login én een ONGEWIJZIGDE database — dat tweede scheidt "de
// poort weigerde" van "de action deed zijn werk en navigeerde daarna".
import { expect, test, vi } from "vitest";
import { createTestDb, type TestDb } from "@/db/test-db";
import {
  addMembership,
  createOrganization,
  listMemberships,
  listOrganizations,
} from "@/lib/repo/orgs";

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

const { createOrgAction, removeMemberAction } = await import("./actions");

async function verseDb() {
  const db = (await createTestDb()) as TestDb;
  harnas.db = db;
  return db;
}

function post(velden: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(velden)) fd.set(k, v);
  return fd;
}

// Sinds sprint 3.1 (migratie 0017) draagt élke verse database de interne organisatie
// "Brink Licht" — ook de test-DB. De organisatielijst begint dus niet leeg. Deze tests
// gaan over de sessiepoort en niet over de inhoud van de seed, dus ze meten het VERSCHIL
// vóór en ná de POST in plaats van een absolute lijst.
async function orgNamen(db: TestDb): Promise<string[]> {
  return (await listOrganizations(db)).map((o) => o.name);
}

// ⚠️ En sinds besluit G36/G39 leunt `removeMemberAction` niet meer alleen op de sessie:
// `changeMembershipAsActor()` leidt de bevoegdheid af uit de database. Zonder deze seed
// zou de uitgelogde variant hieronder ook groen blijven met een kapotte sessiepoort — de
// autorisatielaag had het dan alsnog geweigerd, en dan bewees de test niet meer wat hij
// belooft. De actor krijgt daarom een membership in de interne org (G36-regel 1: elke rol
// binnen 'intern' telt, ook géén rol), zodat het énige wat hem nog kan tegenhouden de
// sessiepoort is.
async function maakActorBevoegd(db: TestDb) {
  const orgs = await listOrganizations(db);
  const intern = orgs.find((o) => o.slug === "brink-licht");
  if (!intern) throw new Error("interne org ontbreekt — migratie 0017 niet gedraaid?");
  await addMembership(db, {
    orgId: intern.id,
    email: harnas.email,
    roles: [],
    actor: "seed",
  });
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

test("uitgelogd: createOrgAction maakt geen organisatie aan", async () => {
  const db = await verseDb();
  const voor = await orgNamen(db);

  const digest = await redirectVanUitgelogde(() =>
    createOrgAction(post({ name: "Deerns", plan: "pro" })),
  );
  expect(digest).toContain("/login");

  expect(await orgNamen(db)).toEqual(voor);
});

test("ingelogd: dezelfde POST maakt de organisatie wél aan", async () => {
  const db = await verseDb();
  const voor = await orgNamen(db);

  await createOrgAction(post({ name: "Deerns", plan: "pro" }));

  const erbij = (await orgNamen(db)).filter((n) => !voor.includes(n));
  expect(erbij).toEqual(["Deerns"]);
});

test("uitgelogd: removeMemberAction laat het lidmaatschap staan", async () => {
  const db = await verseDb();
  await maakActorBevoegd(db);
  const org = await createOrganization(db, { name: "Deerns", actor: "seed" });
  await addMembership(db, {
    orgId: org.id,
    email: "lid@deerns.nl",
    roles: ["calculator"],
    actor: "seed",
  });

  const digest = await redirectVanUitgelogde(() =>
    removeMemberAction(post({ orgId: org.id, email: "lid@deerns.nl" })),
  );
  expect(digest).toContain("/login");

  expect((await listMemberships(db, org.id)).map((m) => m.email)).toEqual([
    "lid@deerns.nl",
  ]);
});

test("ingelogd: dezelfde POST verwijdert het lidmaatschap wél", async () => {
  const db = await verseDb();
  await maakActorBevoegd(db);
  const org = await createOrganization(db, { name: "Deerns", actor: "seed" });
  await addMembership(db, {
    orgId: org.id,
    email: "lid@deerns.nl",
    roles: ["calculator"],
    actor: "seed",
  });

  await removeMemberAction(post({ orgId: org.id, email: "lid@deerns.nl" }));

  expect(await listMemberships(db, org.id)).toEqual([]);
});
