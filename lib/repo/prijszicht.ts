// Mag deze gebruiker bedragen zien? — sprint 3.2b.
//
// Eén vraag, één antwoord, één plek. Het antwoord is een gesloten unie van twee waarden
// en er is géén derde ("onbekend"): wie niet aantoonbaar intern is, ziet geen prijzen.
// Dat is ijzeren regel 4 (default = veilig) toegepast op geld, en het is bewust de
// STRENGE kant op geformuleerd — niet "extern? verberg", maar "intern? toon". Het
// verschil telt zodra er een vierde org-type bijkomt, een membership-rij ontbreekt of
// een e-mailadres niet te normaliseren valt: bij "extern? verberg" zou zo'n geval
// stilzwijgend prijzen tónen, hier valt het vanzelf de veilige kant op.
//
// "Intern" komt uit `organizations.type` (G31, migratie 0017) — niet uit een nieuwe vlag
// op de user, en niet uit de membership_role-enum. Een rol zegt wélke view je krijgt
// (calculator/werkvoorbereider/projectleider); het org-type zegt wie je bent tegenover
// Brink. Prijszicht hoort bij het tweede.
//
// ⚠️ Dit is niet dezelfde vraag als `resolveOrgAuthority()` in authz.ts. Die beantwoordt
// "wie mag SCHRIJVEN" en heeft daarom een org_admin-tak; hier bestaat die tak niet — een
// org_admin van een externe organisatie is nog steeds extern en ziet dus geen bedragen.
// De twee delen bewust geen code: het zijn twee besluiten, en ze samenvoegen is precies
// hoe "org_admin mag leden beheren" ooit stilletjes "org_admin ziet inkoopprijzen" wordt.
import { sql } from "drizzle-orm";
import { memberships, organizations, type OrgType } from "@/db/schema";
import type { AppDb } from "./db";

/** Wat een kijker van de bedragen mag zien. Twee waarden, geen derde. */
export type Prijszicht =
  /** Brink zelf: het volledige stuk, met stukprijzen, regeltotalen en totalen. */
  | "intern"
  /** Iedereen daarbuiten: regels, aantallen, statussen en kleuren — nul bedragen. */
  | "extern";

/**
 * De regel zelf, puur: uit de org-types waar dit adres lid van is volgt het prijszicht.
 * Zonder database, dus uitputtend testbaar en op één regel te lezen.
 *
 * Één lidmaatschap in een interne organisatie is genoeg — dat is dezelfde lezing als
 * G36-regel 1 in authz.ts, waar élke rol binnen 'intern' telt (ook géén rol). Wie zowel
 * intern als extern lid is, is intern: dat is een Brink-medewerker die óók in een
 * klantorganisatie zit, niet andersom.
 */
export function decidePrijszicht(
  orgTypes: readonly (OrgType | null | undefined)[],
): Prijszicht {
  return orgTypes.some((t) => t === "intern") ? "intern" : "extern";
}

/**
 * Het prijszicht van de ingelogde gebruiker, vers uit de database.
 *
 * `actorEmail` komt uit de sessie (`requireSession()`), nooit uit een formulier of een
 * query-parameter — zelfde regel als G39 in authz.ts. Een leeg, ontbrekend of vormloos
 * adres levert "extern": er valt dan niets te bewijzen, en niet-bewezen is hier niet
 * goed genoeg.
 */
export async function resolvePrijszicht(
  db: AppDb,
  actorEmail: string | null | undefined,
): Promise<Prijszicht> {
  const email = (actorEmail ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return "extern";

  // lower() aan de kolomkant: memberships.email heeft géén CHECK die normalisatie
  // afdwingt (anders dan activation_pins). Eén rij met een hoofdletter zou anders
  // onzichtbaar zijn — en onzichtbaar betekent hier "geen prijzen", dus fail-safe.
  const rows = await db
    .select({ orgType: organizations.type })
    .from(memberships)
    .innerJoin(organizations, sql`${organizations.id} = ${memberships.orgId}`)
    .where(sql`lower(${memberships.email}) = ${email}`);

  return decidePrijszicht(rows.map((r) => r.orgType));
}
