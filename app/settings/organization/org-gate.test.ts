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

  const digest = await redirectVanUitgelogde(() =>
    createOrgAction(post({ name: "Deerns", plan: "pro" })),
  );
  expect(digest).toContain("/login");

  expect(await listOrganizations(db)).toEqual([]);
});

test("ingelogd: dezelfde POST maakt de organisatie wél aan", async () => {
  const db = await verseDb();

  await createOrgAction(post({ name: "Deerns", plan: "pro" }));

  expect((await listOrganizations(db)).map((o) => o.name)).toEqual(["Deerns"]);
});

test("uitgelogd: removeMemberAction laat het lidmaatschap staan", async () => {
  const db = await verseDb();
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
