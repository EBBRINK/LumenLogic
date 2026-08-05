// Testhulp voor de org-scoping van sprint 3.2a.
//
// Sinds 3.2a hangt élke poort in de app aan een LIDMAATSCHAP: `resolveToegang()` zoekt in
// `memberships` op welke organisaties bij dit adres horen, en wie nergens lid is, is
// "extern zonder organisatie" — en die ziet niets. Een test die een sessie mockt maar geen
// membership seedt, zet dus een gebruiker neer die volgens de app niemand is.
//
// Dat is precies het gedrag dat 3.2a wilde, en het is ook waarom deze helper bestaat: de
// bestaande poort-tests (`*-gate.test.ts`) gaan over de sessie, niet over de organisatie.
// Zij seeden hiermee in één regel de uitgangssituatie die ze altijd al impliciet aannamen —
// "de ingelogde gebruiker is van Brink" — zonder dat elk bestand de migratie-details van
// 0019 hoeft te kennen.
//
// ⚠️ Alleen voor tests en seeds. App-code komt aan een lidmaatschap via
// `changeMembershipAsActor()` (lib/repo/authz.ts, besluiten G36/G39).
import { eq, sql } from "drizzle-orm";
import { memberships, organizations } from "./schema";
import type { TestDb } from "./test-db";

/**
 * Maak dit adres lid van de interne Brink-organisatie, zodat `resolveToegang()` het als
 * `intern` ziet en de `DossierScope` `{ kind: "alles" }` wordt.
 *
 * De organisatie zelf komt uit migratie 0019, die ook in een verse test-DB draait
 * (`INSERT … WHERE NOT EXISTS` op slug 'brink-licht'). Ontbreekt hij toch, dan maakt deze
 * functie hem alsnog aan — dan faalt een test op zijn eigen assertie in plaats van op een
 * onvindbare organisatie.
 *
 * Geeft de org-id terug, zodat een test er ook projecten aan kan koppelen.
 */
export async function seedInternLid(
  db: TestDb,
  email: string,
  roles: ("calculator" | "werkvoorbereider" | "projectleider" | "org_admin")[] = [
    "org_admin",
  ],
): Promise<string> {
  const [bestaand] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "brink-licht"))
    .limit(1);

  const orgId =
    bestaand?.id ??
    (
      await db
        .insert(organizations)
        .values({ name: "Brink Licht", slug: "brink-licht", type: "intern" })
        .returning({ id: organizations.id })
    )[0].id;

  await db
    .insert(memberships)
    .values({ orgId, email: email.trim().toLowerCase(), roles })
    .onConflictDoNothing();

  return orgId;
}

/** Dezelfde helper, maar dan voor een EXTERNE organisatie. Voor scoping-tests met twee kanten. */
export async function seedExternLid(
  db: TestDb,
  email: string,
  naam = "Installateur Test",
): Promise<string> {
  const slug = naam.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const [bestaand] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(sql`${organizations.slug} = ${slug}`)
    .limit(1);

  const orgId =
    bestaand?.id ??
    (
      await db
        .insert(organizations)
        .values({ name: naam, slug, type: "extern" })
        .returning({ id: organizations.id })
    )[0].id;

  await db
    .insert(memberships)
    .values({ orgId, email: email.trim().toLowerCase(), roles: ["calculator"] })
    .onConflictDoNothing();

  return orgId;
}
