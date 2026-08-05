// Wie ziet er bedragen? (sprint 3.2b, lib/repo/prijszicht.ts)
//
// Twee lagen, allebei getoetst: de pure regel (decidePrijszicht — uitputtend, geen db)
// en het echte pad door de database (resolvePrijszicht). De pure laag is waar je de
// regel kunt lézen; de db-laag is waar hij fout kan gaan op normalisatie en joins.
import { expect, test } from "vitest";
import { createTestDb } from "@/db/test-db";
import { memberships, organizations } from "@/db/schema";
import { decidePrijszicht, resolvePrijszicht } from "./prijszicht";

// ── De pure regel ─────────────────────────────────────────────────────────────

test("alleen een intern lidmaatschap geeft prijszicht; elk ander org-type niet", () => {
  expect(decidePrijszicht(["intern"])).toBe("intern");
  expect(decidePrijszicht(["extern"])).toBe("extern");
  expect(decidePrijszicht(["brand"])).toBe("extern");
});

test("geen enkel lidmaatschap = extern (de val-terug, niet een randgeval)", () => {
  // Dít is de normale stand van een adres dat wél kan inloggen maar nog nergens bij
  // hoort. Zou dit "intern" opleveren, dan lekte élk nieuw account de prijzen.
  expect(decidePrijszicht([])).toBe("extern");
});

test("meerdere organisaties: één interne is genoeg, en de volgorde doet er niet toe", () => {
  // Een Brink-medewerker die óók in een klantorganisatie zit is intern, niet andersom.
  expect(decidePrijszicht(["extern", "intern"])).toBe("intern");
  expect(decidePrijszicht(["intern", "extern"])).toBe("intern");
  expect(decidePrijszicht(["extern", "brand"])).toBe("extern");
});

test("onbekende of ontbrekende org-types vallen de veilige kant op", () => {
  // De regel is "intern? toon", niet "extern? verberg". Dat verschil telt zodra er een
  // vierde org-type bijkomt of een join een null teruggeeft: dan hóórt hier "extern"
  // uit te komen zonder dat iemand deze functie heeft aangepast.
  expect(decidePrijszicht([null])).toBe("extern");
  expect(decidePrijszicht([undefined])).toBe("extern");
  expect(decidePrijszicht([null, "extern", undefined])).toBe("extern");
});

// ── Het echte pad ─────────────────────────────────────────────────────────────

// Migratie 0017 zet de interne org "Brink Licht" al klaar in élke verse database; de
// tests hieronder pakken hem op slug en zetten hun eigen externe org ernaast.
test("resolvePrijszicht: lid van de interne org ziet bedragen, lid van een externe niet", async () => {
  const db = await createTestDb();
  const orgs = await db.select().from(organizations);
  const intern = orgs.find((o) => o.slug === "brink-licht");
  expect(intern, "migratie 0017 hoort de interne org te seeden").toBeTruthy();

  const [extern] = await db
    .insert(organizations)
    .values({ name: "De Vries Installaties", slug: "de-vries", type: "extern" })
    .returning();

  await db.insert(memberships).values([
    { orgId: intern!.id, email: "timo@brink.nl", roles: ["calculator"] },
    { orgId: extern.id, email: "piet@devries.nl", roles: ["org_admin"] },
  ]);

  expect(await resolvePrijszicht(db, "timo@brink.nl")).toBe("intern");
  // ⚠️ org_admin is een SCHRIJFrecht binnen de eigen organisatie (G36) en zegt niets
  // over prijszicht. Een externe beheerder blijft extern.
  expect(await resolvePrijszicht(db, "piet@devries.nl")).toBe("extern");
});

test("resolvePrijszicht: adres zonder membership, leeg adres en vormloos adres → extern", async () => {
  const db = await createTestDb();
  expect(await resolvePrijszicht(db, "niemand@nergens.nl")).toBe("extern");
  expect(await resolvePrijszicht(db, "")).toBe("extern");
  expect(await resolvePrijszicht(db, "   ")).toBe("extern");
  expect(await resolvePrijszicht(db, "geen-apenstaartje")).toBe("extern");
  expect(await resolvePrijszicht(db, null)).toBe("extern");
  expect(await resolvePrijszicht(db, undefined)).toBe("extern");
});

test("resolvePrijszicht is hoofdletter- en spatieongevoelig op het adres", async () => {
  // memberships.email heeft géén CHECK die normalisatie afdwingt. Zou de lookup
  // hoofdlettergevoelig zijn, dan verloor een interne gebruiker met een hoofdletter in
  // zijn rij zijn prijzen — vervelend, maar fail-safe. Andersom (een externe die er
  // eentje wint) kan niet: er is geen pad dat zonder interne rij "intern" oplevert.
  const db = await createTestDb();
  const orgs = await db.select().from(organizations);
  const intern = orgs.find((o) => o.slug === "brink-licht")!;
  await db
    .insert(memberships)
    .values({ orgId: intern.id, email: "Timo@Brink.NL", roles: [] });

  expect(await resolvePrijszicht(db, " TIMO@brink.nl ")).toBe("intern");
});

test("een membership zonder rollen telt gewoon mee — het org-type beslist, niet de rol", async () => {
  const db = await createTestDb();
  const orgs = await db.select().from(organizations);
  const intern = orgs.find((o) => o.slug === "brink-licht")!;
  await db
    .insert(memberships)
    .values({ orgId: intern.id, email: "stagiair@brink.nl", roles: [] });

  expect(await resolvePrijszicht(db, "stagiair@brink.nl")).toBe("intern");
});
