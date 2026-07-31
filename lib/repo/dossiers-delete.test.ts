// B7 (reviewzwerm 2.5a): `deleteSpecLine` was de énige destructieve handeling op een
// spec-regel zónder event, zónder actor en zónder test — de rij was wég en er bleef
// niets over om te laten zien wát er weg was. De niet-destructieve buren in hetzelfde
// bestand (setQuantity, setDayPrice) logden wél. Deze test pint de reparatie:
// ijzeren regel 5 (élke handeling gelogd) + FUNCTIONEEL-ONTWERP §6 ("élke schrijfactie
// draagt de actor"), mét de VOLLEDIGE regelinhoud van vóór de verwijdering zodat de
// handeling reconstrueerbaar blijft.
import { expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { events, specLines } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { addSpecLines, createDossier, deleteSpecLine } from "@/lib/repo/dossiers";

const ACTOR = "eduard@brinklicht.nl";

test("deleteSpecLine: event mét actor en de volledige regelinhoud van vóór de verwijdering", async () => {
  const db = await createTestDb();
  const dossier = await createDossier(db, { name: "Raadhuis" });

  const [line] = await addSpecLines(db, dossier.id, [
    {
      fixtureCode: "Lp301",
      quantity: 12,
      zone: "Raadzaal",
      description: "Inbouw downlight boven de tribune",
      brandText: "XAL",
      productText: "SASSO 100",
      reqKelvin: 3000,
      reqCri: 90,
      reqIp: "IP20",
      reqWatt: 17.9,
      reqLumen: 2810,
      reqDimmable: "DALI",
      source: "pdf",
      sourceConfidence: "middel",
      sourcePage: 7,
    },
  ]);

  await deleteSpecLine(db, line.id, ACTOR);

  // De rij is écht weg (dat was al zo — dit blijft de bedoeling).
  expect(
    await db.select().from(specLines).where(eq(specLines.id, line.id)),
  ).toHaveLength(0);

  // …maar er is nu precies één spoor van, mét actor.
  const gelogd = await db
    .select()
    .from(events)
    .where(eq(events.action, "spec_line_deleted"));
  expect(gelogd).toHaveLength(1);
  const [evt] = gelogd;
  expect(evt.entity).toBe("spec_line");
  expect(evt.entityId).toBe(line.id);
  expect(evt.actor).toBe(ACTOR);

  // Kop van de payload: wat het event-logscherm toont (die labels bestaan al).
  expect(evt.payload).toMatchObject({
    dossierId: dossier.id,
    fixtureCode: "Lp301",
    quantity: 12,
    brandText: "XAL",
    productText: "SASSO 100",
    status: "open",
  });

  // En de kern van B7: de VOLLEDIGE regel staat erin, dus de verwijdering is te
  // reconstrueren. Niet een handvol velden — élke kolom die de rij droeg.
  const bewaard = (evt.payload as { line?: Record<string, unknown> }).line;
  expect(bewaard).toBeTruthy();
  for (const [kolom, waarde] of Object.entries(line)) {
    // Datums komen als ISO-string uit jsonb terug; vergelijk op die vorm.
    const verwacht = waarde instanceof Date ? waarde.toISOString() : waarde;
    expect(bewaard![kolom]).toEqual(verwacht);
  }
  // Steekproef op de velden die zonder deze payload voorgoed weg zouden zijn.
  expect(bewaard!.zone).toBe("Raadzaal");
  expect(bewaard!.description).toBe("Inbouw downlight boven de tribune");
  expect(bewaard!.reqKelvin).toBe(3000);
  expect(bewaard!.reqIp).toBe("IP20");
  expect(bewaard!.sourcePage).toBe(7);
});

test("deleteSpecLine: zonder actor blijft het event bestaan (system), en een onbekende regel logt niets", async () => {
  const db = await createTestDb();
  const dossier = await createDossier(db, { name: "Raadhuis" });
  const [line] = await addSpecLines(db, dossier.id, [{ fixtureCode: "L004" }]);

  await deleteSpecLine(db, line.id);
  const [evt] = await db
    .select()
    .from(events)
    .where(eq(events.action, "spec_line_deleted"));
  expect(evt.actor).toBe("system"); // logEvent-default, nooit stil

  // Tweede keer verwijderen: er valt niets te verwijderen, dus ook niets te melden —
  // geen event over een handeling die niet gebeurde.
  await deleteSpecLine(db, line.id, ACTOR);
  expect(
    await db.select().from(events).where(eq(events.action, "spec_line_deleted")),
  ).toHaveLength(1);
});
