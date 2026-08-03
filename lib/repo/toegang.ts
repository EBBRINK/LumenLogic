// Wie is deze kijker, en welke projectrijen mag hij zien? — sprint 3.2a.
//
// Dit bestand beantwoordt de LEESvraag. `lib/repo/authz.ts` beantwoordt de SCHRIJFvraag
// ("wie mag lidmaatschappen en PIN's uitdelen", G36/G39) en `lib/repo/prijszicht.ts` de
// geldvraag ("wie ziet bedragen", 3.2b). Drie besluiten, drie bestanden — bewust geen
// gedeelde code, want samenvoegen is precies hoe "org_admin mag leden beheren" ooit
// stilletjes "org_admin ziet de projecten van een ander" wordt.
//
// De vorm is die van prijszicht.ts: een pure beslisfunctie die je op één scherm kunt lezen,
// en daarnaast één functie die de feiten vers uit de database haalt. En hij is de STRENGE
// kant op geformuleerd — "intern? alles", niet "extern? filter". Het verschil telt zodra er
// een vierde org-type bijkomt, een membership-rij ontbreekt of een adres niet te normaliseren
// valt: bij "extern? filter" zou zo'n geval stilzwijgend álles tonen, hier valt het vanzelf
// de veilige kant op (ijzeren regel 4).
import { sql, type Column, type SQL } from "drizzle-orm";
import {
  memberships,
  organizations,
  type MembershipRole,
  type OrgType,
} from "@/db/schema";
import type { AppDb } from "./db";

/**
 * Wat dit account IS, in termen van routes. Drie waarden, geen vierde.
 *
 * ⚠️ Dit is niet dezelfde vraag als `OrgAuthority` in authz.ts. Die heeft een
 * `org_admin`-tak omdat een org_admin mág schrijven binnen zijn eigen org; hier is
 * "org_admin" geen soort account maar een eigenschap ervan (`adminOrgIds` hieronder).
 */
export type ToegangSoort =
  /** Geen sessie, of een sessie zonder bruikbaar adres. Mag alleen wat `open` is. */
  | "anoniem"
  /** Lid van minstens één organisatie met type 'intern'. Brink zelf. */
  | "intern"
  /** Al het overige: ingelogd, maar niet aantoonbaar intern. */
  | "extern";

/** Eén lidmaatschapsrij zoals de beslisfunctie hem nodig heeft. */
export type LidmaatschapFeit = {
  orgId: string;
  orgType: OrgType | null | undefined;
  roles: readonly MembershipRole[] | null | undefined;
};

export type Toegang = {
  soort: ToegangSoort;
  /** Genormaliseerd, of null als er geen bruikbaar adres was. */
  email: string | null;
  /** Alle organisaties waar dit account lid van is. */
  orgIds: string[];
  /** Waar het account de rol `org_admin` draagt. Bepaalt niveau `org_admin`. */
  adminOrgIds: string[];
  /**
   * De organisatie waar nieuwe projecten van dit account onder vallen.
   *
   * Intern → de interne organisatie (ook als hij daarnaast bij een klant zit: een
   * Brink-medewerker die meekijkt in een klantorganisatie maakt Brink-projecten).
   * Extern → zijn organisatie, als dat er precies één is. Bij meerdere is er geen
   * eerlijk antwoord en wordt het `null`; `createDossier()` weigert dan liever dan te
   * gokken. Vandaag bestaat dat geval niet (één organisatie, drie leden).
   */
  primaireOrgId: string | null;
};

/** Overal in dit project worden adressen zo genormaliseerd (zie lib/repo/activation.ts). */
function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * De regel zelf, puur: uit de lidmaatschappen van dit adres volgt zijn toegang.
 * Zonder database, dus uitputtend testbaar.
 *
 * Eén lidmaatschap in een interne organisatie is genoeg — dezelfde lezing als G36-regel 1
 * in authz.ts en `decidePrijszicht()` in prijszicht.ts, waar élke rol binnen 'intern' telt
 * (ook géén rol). Wie zowel intern als extern lid is, is intern: dat is een
 * Brink-medewerker die óók in een klantorganisatie zit, niet andersom.
 */
export function decideToegang(
  email: string | null | undefined,
  rijen: readonly LidmaatschapFeit[],
): Toegang {
  const genormaliseerd = normalizeEmail(email);
  if (!genormaliseerd || !genormaliseerd.includes("@")) {
    // Geen bruikbaar adres → anoniem, en anoniem heeft géén organisaties. Niet "extern
    // met een lege lijst": dat zou een uitgelogde bezoeker naar notFound() sturen waar
    // /login hoort, en dat verschil is het enige nuttige signaal dat een weigering mag geven.
    return {
      soort: "anoniem",
      email: null,
      orgIds: [],
      adminOrgIds: [],
      primaireOrgId: null,
    };
  }

  const internOrgIds = rijen
    .filter((r) => r.orgType === "intern")
    .map((r) => r.orgId);
  const soort: ToegangSoort = internOrgIds.length > 0 ? "intern" : "extern";

  // Ontdubbelen: één adres kan meerdere rijen in dezelfde org hebben als de data ooit
  // scheef staat, en een dubbele orgId zou verderop een dubbele WHERE-tak opleveren.
  const orgIds = [...new Set(rijen.map((r) => r.orgId))];
  const adminOrgIds = [
    ...new Set(
      rijen.filter((r) => (r.roles ?? []).includes("org_admin")).map((r) => r.orgId),
    ),
  ];

  const primaireOrgId =
    soort === "intern"
      ? internOrgIds[0]
      : orgIds.length === 1
        ? orgIds[0]
        : null;

  return { soort, email: genormaliseerd, orgIds, adminOrgIds, primaireOrgId };
}

/**
 * De toegang van de ingelogde gebruiker, vers uit de database.
 *
 * `actorEmail` komt uit de sessie (`getSession()`/`requireSession()`), nooit uit een
 * formulier of een query-parameter — zelfde regel als G39 in authz.ts: de sessie levert
 * identiteit, de database levert rechten.
 */
export async function resolveToegang(
  db: AppDb,
  actorEmail: string | null | undefined,
): Promise<Toegang> {
  const email = normalizeEmail(actorEmail);
  if (!email || !email.includes("@")) return decideToegang(null, []);

  // lower() aan de kolomkant: memberships.email heeft géén CHECK die normalisatie
  // afdwingt (anders dan activation_pins). Eén rij met een hoofdletter zou anders
  // onzichtbaar zijn — en onzichtbaar betekent hier "minder toegang", dus fail-safe.
  // Zelfde constructie als in authz.ts en prijszicht.ts.
  const rijen = await db
    .select({
      orgId: memberships.orgId,
      orgType: organizations.type,
      roles: memberships.roles,
    })
    .from(memberships)
    .innerJoin(organizations, sql`${organizations.id} = ${memberships.orgId}`)
    .where(sql`lower(${memberships.email}) = ${email}`);

  return decideToegang(email, rijen as LidmaatschapFeit[]);
}

// ── Rij-scoping op project_dossiers ───────────────────────────────────────────

/**
 * Welke projectrijen deze kijker mag zien. Twee vormen, geen derde — en géén vorm die
 * "geen filter" betekent: `{ kind: "orgs", orgIds: [] }` is letterlijk nul rijen.
 *
 * ⚠️ De vier leesdeuren op `project_dossiers` nemen dit als VERPLICHTE parameter. Dat is
 * het hele mechanisme: wie hem vergeet krijgt geen stille "alles" maar een compilerfout.
 * `lib/repo/dossier-scope.test.ts` bewaakt dat er geen vijfde deur bijkomt.
 */
export type DossierScope =
  /** Intern: alle projecten, inclusief die zonder organisatie. */
  | { kind: "alles" }
  /** Alles daarbuiten: alleen projecten van deze organisaties. Leeg = niets. */
  | { kind: "orgs"; orgIds: string[] };

/**
 * De scope die bij deze toegang hoort.
 *
 * Let op de derde tak: een project zónder `org_id` is voor intern. Migratie 0019 heeft de
 * 13 bestaande dossiers aan `brink-licht` gekoppeld, maar een rij die er op wat voor manier
 * dan ook zonder organisatie doorheen komt hoort bij Brink en niet bij de eerste de beste
 * externe kijker. Dat wordt in `dossierScopeSql()` afgedwongen, niet hier.
 */
export function toegangScope(toegang: Toegang): DossierScope {
  if (toegang.soort === "intern") return { kind: "alles" };
  return { kind: "orgs", orgIds: toegang.orgIds };
}

/** De strengst mogelijke scope: nul rijen. Voor paden die (nog) geen kijker hebben. */
export const GEEN_DOSSIERS: DossierScope = { kind: "orgs", orgIds: [] };

/**
 * Alles, zonder filter.
 *
 * ⚠️ Dit is de ontsnapping, en hij hoort er precies twee soorten gebruikers te hebben:
 * de scoping-laag zelf (`toegangScope()` hierboven) en migraties/seeds/tests, die een
 * uitgangssituatie klaarzetten in plaats van een gebruikershandeling uit te voeren.
 * App-code haalt zijn scope uit `toegangScope(await bewaakRoute(…))` en nergens anders;
 * `lib/repo/dossier-scope.test.ts` scant daarop. Zelfde constructie als de kale
 * schrijffuncties in `lib/repo/orgs.ts` naast de bewaker in `authz-deuren.test.ts`: de
 * functie blijft bestaan, en een test bewaakt wie hem mag aanroepen.
 */
export const ALLE_DOSSIERS: DossierScope = { kind: "alles" };

/**
 * De scope als WHERE-tak op `project_dossiers`. Dit is de enige plek waar een scope in SQL
 * verandert; de vier leesdeuren plakken hem er met `and()` bij.
 *
 * Drie dingen die hier bewust NIET gebeuren:
 *  • Bij `orgs` met een lege lijst geen weggelaten voorwaarde maar een letterlijke `false`.
 *    Een `IN ()` is ongeldige SQL en een weggelaten WHERE is "alles" — allebei het
 *    tegenovergestelde van wat een lege scope betekent. (Drizzle's `inArray` doet dit
 *    tegenwoordig zelf ook goed; het staat hier uitgeschreven zodat het niet van een
 *    versie-detail afhangt.)
 *  • Geen `OR org_id IS NULL` in de externe tak: een project zonder organisatie is van
 *    Brink en hoort niet bij de eerste de beste kijker (ijzeren regel 4).
 *  • Geen uuid-vorm-controle die stilzwijgend overslaat. Een orgId die geen uuid is komt
 *    uit `memberships.org_id` — een uuid-kolom met een FK — dus die bestaat niet; zou hij
 *    er ooit tóch zijn, dan hoort de query te falen en niet te verruimen.
 */
export function dossierScopeSql(scope: DossierScope, orgIdColumn: Column | SQL): SQL {
  if (scope.kind === "alles") return sql`true`;
  if (scope.orgIds.length === 0) return sql`false`;
  return sql`${orgIdColumn} in (${sql.join(
    scope.orgIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`;
}
