// De twee vangrails onder de allowlist, gemeten aan de ECHTE server-action
// (herstel 2026-07-30).
//
// De eigen-adres-vangrail bestond tot vandaag alleen als `disabled` knop in
// components/settings/allowed-emails-block.tsx. Een `disabled` attribuut is uitleg,
// geen poort: een kale POST met je eigen adres slaagde gewoon zolang er twee adressen
// waren — en daarna kwam je niet meer bij het énige scherm waarlangs je jezelf weer kon
// toevoegen. De laatste-adres-vangrail stond wél al serverkant; die pinnen we hier mee,
// zodat hij niet sneuvelt bij een volgende pas.
import { expect, test, vi } from "vitest";
import { allowedEmails } from "@/db/schema";
import { createTestDb, type TestDb } from "@/db/test-db";
import { addAllowedEmail, listAllowedEmails } from "@/lib/repo/settings";

const harnas = vi.hoisted(() => ({
  db: null as unknown,
  email: "timo@brink.nl",
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

vi.mock("@/lib/session", () => ({
  getSession: async () => ({ user: { email: harnas.email } }),
  requireSession: async () => ({ user: { email: harnas.email } }),
  getActor: async () => harnas.email,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

const { removeEmailAction } = await import("./actions");

async function stand(emails: string[]) {
  const db = (await createTestDb()) as TestDb;
  harnas.db = db;
  // Migratie 0002 zet er twee echte adressen in; die zouden de tellingen hieronder
  // vertroebelen (de laatste-adres-vangrail telt de hele lijst).
  await db.delete(allowedEmails);
  for (const e of emails) await addAllowedEmail(db, e, "seed");
  return db;
}

function post(email: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  return fd;
}

const adressen = async (db: TestDb) =>
  (await listAllowedEmails(db)).map((r) => r.email).sort();

test("eigen adres: de POST slaagt niet, ook niet met twee adressen in de lijst", async () => {
  const db = await stand(["timo@brink.nl", "collega@brink.nl"]);

  await removeEmailAction(post("timo@brink.nl"));

  // Niets weg — dit is precies de lock-out die de knop moest voorkomen.
  expect(await adressen(db)).toEqual(["collega@brink.nl", "timo@brink.nl"]);
});

test("eigen adres met andere schrijfwijze: zelfde normalisatie als de repo, dus ook geweigerd", async () => {
  const db = await stand(["timo@brink.nl", "collega@brink.nl"]);

  // De repo bewaart genormaliseerd (trim + lowercase); zonder dezelfde normalisatie in
  // de action glipt "  TIMO@Brink.NL " langs de vergelijking en ben je alsnog buiten.
  await removeEmailAction(post("  TIMO@Brink.NL "));

  expect(await adressen(db)).toEqual(["collega@brink.nl", "timo@brink.nl"]);
});

test("adres van een ander: verwijderen werkt gewoon — de vangrail mag niet alles blokkeren", async () => {
  const db = await stand(["timo@brink.nl", "collega@brink.nl"]);

  await removeEmailAction(post("collega@brink.nl"));

  expect(await adressen(db)).toEqual(["timo@brink.nl"]);
});

test("laatste adres: blijft staan, ook als het niet van jou is", async () => {
  harnas.email = "iemand-anders@brink.nl";
  const db = await stand(["timo@brink.nl"]);

  await removeEmailAction(post("timo@brink.nl"));

  expect(await adressen(db)).toEqual(["timo@brink.nl"]);
  harnas.email = "timo@brink.nl";
});
