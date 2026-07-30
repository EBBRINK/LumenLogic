// Merkportaal (H3, H-11, K-05, functioneel ontwerp §3.16). Het merk zelf levert data en
// prijslijsten aan en ziet een geaggregeerd dashboard. Twee ijzeren grenzen leven hier:
//   1. Eén publicatiepad: elke upload landt op status 'staging' en wacht op goedkeuring
//      (H-11). Er is geen directe schrijfweg naar de catalogus vanuit het portaal.
//   2. De anonimiseringsgrens is de materialized view: het merk ziet alleen geaggregeerde
//      tellingen (overwogen/gekozen), nooit welk project of welke calculator (K-05).
// Er bestaat GEEN knop of veld dat zichtbaarheid of ranking koopt (C-15/J-05). Prijs mag
// worden meegeleverd, maar sorteert nooit — getBrandData geeft producten zonder ranking.
import { asc, desc, eq, sql } from "drizzle-orm";
import { brandUploads, brands, products } from "@/db/schema";
import { isUuid } from "@/lib/uuid";
import type { AppDb } from "./db";
import { logEvent } from "./events";

export type BrandUploadKind = "pricelist" | "data";

export type SubmitBrandUploadInput = {
  brandId: string;
  kind: BrandUploadKind;
  payload: Record<string, unknown>;
  submittedBy?: string | null;
};

// H-11: één publicatiepad — een upload komt binnen als 'staging' en wacht op goedkeuring.
// Een prijslijst-upload MOET een valid_until dragen: een prijslijst zonder einddatum
// voedt ijzeren regel 3 niet en wordt hier geweigerd (niet stilzwijgend geaccepteerd).
export async function submitBrandUpload(db: AppDb, input: SubmitBrandUploadInput) {
  if (input.kind === "pricelist") {
    const validUntil = input.payload?.["valid_until"];
    if (typeof validUntil !== "string" || validUntil.trim() === "") {
      throw new Error(
        "Prijslijst-upload vereist een valid_until (einddatum) in de payload.",
      );
    }
  }
  const [row] = await db
    .insert(brandUploads)
    .values({
      brandId: input.brandId,
      kind: input.kind,
      payload: input.payload,
      status: "staging",
      submittedBy: input.submittedBy ?? null,
    })
    .returning();
  await logEvent(db, {
    entity: "brand_upload",
    entityId: row.id,
    action: "brand_upload_submitted",
    actor: input.submittedBy ?? undefined,
    payload: { brandId: input.brandId, kind: input.kind },
  });
  return row;
}

// Alle uploads (nieuwste eerst), optioneel voor één merk. De status maakt in de UI
// zichtbaar dat alles via staging → goedkeuring loopt.
export async function listBrandUploads(db: AppDb, brandId?: string) {
  const q = db.select().from(brandUploads);
  const rows = brandId
    ? await q.where(eq(brandUploads.brandId, brandId)).orderBy(desc(brandUploads.createdAt))
    : await q.orderBy(desc(brandUploads.createdAt));
  return rows;
}

// Welk merk het portaal toont, komt (voorlopig) uit `?brand=<id>`; anders het eerste merk
// op naam. De echte merk-scoping via membership komt met de integratie-laag.
//
// ÉÉN plek, want dit stond in VIER pagina's byte-identiek (app/brand/page.tsx +
// /data + /dashboard + /price-lists) en dat is precies waarom de uuid-guard uit de
// UX-audit (30 jul, bug #1) er maar in één van de vier landde: `?brand=nope` ging als
// ruwe queryparam in eq(brands.id, …), een uuid-kolom, dus Postgres gooide
// `invalid input syntax for type uuid` en de drie andere pagina's gaven een 500.
//
// De guard valt TERUG op het eerste merk en doet géén notFound(): die terugval bestond
// al ("anders het eerste merk"), en een kapotte queryparam hoort niet strenger te zijn
// dan een geldige die niets vindt. Bij een route-PARAM is dat andersom — daar is de
// hele pagina onvindbaar en gebruikt de aanroeper requireUuid().
export async function resolveBrandFromParam(db: AppDb, brandId?: string) {
  if (isUuid(brandId)) {
    const [b] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
    if (b) return b;
  }
  const [first] = await db.select().from(brands).orderBy(asc(brands.name)).limit(1);
  return first ?? null;
}

export type BrandAggregate = {
  brandName: string;
  considered: number;
  chosen: number;
};

function asRows<T>(res: unknown): T[] {
  return (Array.isArray(res) ? res : ((res as { rows?: T[] }).rows ?? [])) as T[];
}

// K-05: het geaggregeerde dashboard leest de materialized view. Die view IS de
// anonimiseringsgrens — individuele events worden pas na aggregatie zichtbaar. We tonen
// alleen tellingen (overwogen/gekozen) per merk, nooit een onderliggend event of project.
export async function getBrandAggregates(db: AppDb): Promise<BrandAggregate[]> {
  const res = await db.execute(sql`
    SELECT brand_name AS "brandName",
           considered::int AS considered,
           chosen::int AS chosen
    FROM mv_brand_considerations
    ORDER BY considered DESC, brand_name ASC`);
  return asRows<BrandAggregate>(res).map((r) => ({
    brandName: r.brandName,
    considered: Number(r.considered),
    chosen: Number(r.chosen),
  }));
}

// De view is materialized: na nieuwe events moet hij handmatig/periodiek ververst worden.
// Zonder unieke index kan CONCURRENTLY niet — de index bestaat (mv_brand_considerations_brand),
// maar een gewone REFRESH volstaat hier en blokkeert de leeskant kort.
export async function refreshBrandAggregates(db: AppDb): Promise<void> {
  await db.execute(sql`REFRESH MATERIALIZED VIEW mv_brand_considerations`);
}

// Het merk ziet zijn eigen data: het merk plus zijn producten met specs. GEEN commerciële
// ranking en geen sortering op prijs — puur op naam. Prijs hoort niet in deze weergave.
export async function getBrandData(db: AppDb, brandId: string) {
  const [brand] = await db
    .select()
    .from(brands)
    .where(eq(brands.id, brandId))
    .limit(1);
  if (!brand) return null;
  const brandProducts = await db
    .select()
    .from(products)
    .where(eq(products.brandId, brandId))
    .orderBy(asc(products.name));
  return { brand, products: brandProducts };
}
