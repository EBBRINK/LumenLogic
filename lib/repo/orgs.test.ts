// B7 (reviewzwerm 2.5a): `removeMembership` was de destructieve tegenhanger van
// `addMembership` zonder event en zonder actor — iemand kon uit een organisatie
// verdwijnen zonder spoor van wie het deed of welke rollen hij droeg. Deze test pint
// de spiegeling: loggen VÓÓR het deleten, mét de rollen van het lid.
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { events, memberships } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import {
  addMembership,
  createOrganization,
  removeMembership,
} from "@/lib/repo/orgs";

const ACTOR = "timo@brink.nl";

test("removeMembership: event mét actor, adres en de rollen die het lid had", async () => {
  const db = await createTestDb();
  const org = await createOrganization(db, { name: "Aannemer Zuid" });
  await addMembership(db, {
    orgId: org.id,
    email: "Eduard@AannemerZuid.NL",
    roles: ["calculator", "projectleider"],
    actor: ACTOR,
  });

  await removeMembership(db, org.id, " EDUARD@aannemerzuid.nl ", ACTOR);

  // Het lid is weg…
  expect(
    await db.select().from(memberships).where(eq(memberships.orgId, org.id)),
  ).toHaveLength(0);

  // …en er staat precies één spoor van, met alles wat er verloren ging.
  const gelogd = await db
    .select()
    .from(events)
    .where(eq(events.action, "membership_removed"));
  expect(gelogd).toHaveLength(1);
  expect(gelogd[0].entity).toBe("organization");
  expect(gelogd[0].entityId).toBe(org.id);
  expect(gelogd[0].actor).toBe(ACTOR);
  expect(gelogd[0].payload).toEqual({
    email: "eduard@aannemerzuid.nl", // genormaliseerd, zoals de rij zelf
    roles: ["calculator", "projectleider"],
  });
});

test("removeMembership: een lid dat er niet is levert geen event op", async () => {
  const db = await createTestDb();
  const org = await createOrganization(db, { name: "Bouw Noord" });
  await removeMembership(db, org.id, "niemand@bouwnoord.nl", ACTOR);
  expect(
    await db.select().from(events).where(eq(events.action, "membership_removed")),
  ).toHaveLength(0);
});
