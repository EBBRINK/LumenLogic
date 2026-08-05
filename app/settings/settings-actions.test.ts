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
import { seedInternLid } from "@/db/test-org";

const harnas = vi.hoisted(() => ({
  db: null as unknown,
  email: "timo@brink.nl",
  // Schakelaar voor de sessiepoort-tests onderaan: `true` = geen sessie, en de mock
  // hieronder gedraagt zich dan als de ECHTE requireSession (redirect naar /login).
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

// Schakelbare sessie. Belangrijk: bij `uitgelogd` roept requireSession het ECHTE
// redirect() uit next/navigation aan — precies zoals lib/session.ts:12 — zodat de
// poort-test op Next' eigen NEXT_REDIRECT-signaal meet en niet op een zelfverzonnen
// throw uit deze mock.
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

const { addEmailAction, removeEmailAction } = await import("./actions");

// De sessiepoort meet je aan Next' eigen navigatiesignaal: redirect() gooit een fout
// met `digest` "NEXT_REDIRECT;…;/login;…". Loopt de action gewoon door, dan staat de
// poort open — dan faalt deze helper met een leesbare reden in plaats van pas bij de
// database-assertie eronder.
async function vangRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    const digest = (e as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return digest;
    throw e;
  }
  throw new Error(
    "de action liep door zonder redirect — de sessiepoort staat open",
  );
}

// De sessie uitzetten en gegarandeerd terugzetten; anders sleept een falende assertie
// de uitgelogde stand mee naar de volgende test in dit bestand.
async function uitgelogd<T>(run: () => Promise<T>): Promise<T> {
  harnas.uitgelogd = true;
  try {
    return await run();
  } finally {
    harnas.uitgelogd = false;
  }
}

async function stand(emails: string[]) {
  const db = (await createTestDb()) as TestDb;
  harnas.db = db;
  // 3.2a: de poorten hangen aan een lidmaatschap, niet alleen aan een sessie.
  await seedInternLid(db, harnas.email);
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

// ── De sessiepoort zelf (B12) ────────────────────────────────────────────────
// Tot deze pas gaf de mock hierboven ALTIJD een sessie terug. Daardoor bewees geen
// enkele test dat `await requireSession()` iets doet: schrap die regel uit
// app/settings/actions.ts en de hele suite bleef groen. De twee tests hieronder
// draaien exact dezelfde POST als de geslaagde tests erboven, maar uitgelogd — de
// enige juiste uitkomst is een redirect naar /login met een ONAANGERAAKTE database.
// Dat tweede is de kern: het onderscheidt "de poort weigerde" van "de action deed
// zijn werk en navigeerde daarna".

test("uitgelogd: verwijderen van andermans adres wordt geweigerd — /login, lijst intact", async () => {
  const db = await stand(["timo@brink.nl", "collega@brink.nl"]);

  // Dezelfde POST als "adres van een ander" hierboven, die ingelogd wél slaagt.
  const digest = await uitgelogd(() =>
    vangRedirect(() => removeEmailAction(post("collega@brink.nl"))),
  );
  expect(digest).toContain("/login");

  expect(await adressen(db)).toEqual(["collega@brink.nl", "timo@brink.nl"]);
});

test("uitgelogd: adres toevoegen wordt geweigerd — /login, niets geschreven", async () => {
  const db = await stand(["timo@brink.nl"]);

  const digest = await uitgelogd(() =>
    vangRedirect(() => addEmailAction(post("indringer@elders.nl"))),
  );
  expect(digest).toContain("/login");

  expect(await adressen(db)).toEqual(["timo@brink.nl"]);
});

test("laatste adres: blijft staan, ook als het niet van jou is", async () => {
  harnas.email = "iemand-anders@brink.nl";
  const db = await stand(["timo@brink.nl"]);

  await removeEmailAction(post("timo@brink.nl"));

  expect(await adressen(db)).toEqual(["timo@brink.nl"]);
  harnas.email = "timo@brink.nl";
});
