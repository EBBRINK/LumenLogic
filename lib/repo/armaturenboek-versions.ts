// Armaturenboek-versiebeheer (G-02), locatie (G-03) en datasheets (G-04).
// Een versie = een bevroren momentopname van het armaturenboek: per armatuurcode het
// gekozen product, de kernspecs én de locatie uit de tekening-bron. Zo is elke overdracht
// naar de bouwplaats terug te vinden en zijn twee versies te vergelijken — de
// wijzigingshistorie van het dossier. Niets wordt weggelaten: onopgeloste regels staan er
// met hun status eerlijk in, net als in het armaturenboek zelf.
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  armaturenboekVersions,
  productDatasheets,
  specLines,
  visibleProducts,
} from "@/db/schema";
import type { AppDb } from "./db";
import { logEvent } from "./events";

// Eén regel in een versie-snapshot: WAT (product) + WAAR (locatie) + kernspecs + status.
// status is los getypeerd (string) zodat de repo-laag niet van de UI-typen afhangt.
export type ArmatuurSnapshotRow = {
  fixtureCode: string;
  location: string | null; // G-03: waar in het gebouw
  brand: string | null;
  productId: string | null;
  productName: string | null;
  articleCode: string | null;
  kelvin: number | null;
  cri: number | null;
  ip: string | null;
  status: string; // match_status
};

// De velden die bepalen of een regel tussen twee versies wijzigde.
const DIFF_FIELDS: (keyof ArmatuurSnapshotRow)[] = [
  "location",
  "brand",
  "productId",
  "productName",
  "articleCode",
  "kelvin",
  "cri",
  "ip",
  "status",
];

export type VersionDiff = {
  added: ArmatuurSnapshotRow[];
  removed: ArmatuurSnapshotRow[];
  changed: {
    fixtureCode: string;
    before: ArmatuurSnapshotRow;
    after: ArmatuurSnapshotRow;
    fields: string[];
  }[];
  unchanged: number;
};

// De huidige regels van een dossier, gejoined met het (eventueel) gematchte, nog-zichtbare
// product (regel 3: match via de view). Dezelfde vorm die het armaturenboek toont.
async function currentRows(
  db: AppDb,
  dossierId: string,
): Promise<ArmatuurSnapshotRow[]> {
  const rows = await db
    .select({
      fixtureCode: specLines.fixtureCode,
      location: specLines.location,
      brandText: specLines.brandText,
      reqKelvin: specLines.reqKelvin,
      reqCri: specLines.reqCri,
      reqIp: specLines.reqIp,
      status: specLines.status,
      matchedProductId: specLines.matchedProductId,
      matchedName: visibleProducts.name,
      matchedBrand: visibleProducts.brandName,
      matchedArticleCode: visibleProducts.articleCode,
      matchedKelvin: visibleProducts.kelvin,
      matchedCri: visibleProducts.cri,
      matchedIp: visibleProducts.ipValue,
    })
    .from(specLines)
    .leftJoin(
      visibleProducts,
      eq(specLines.matchedProductId, visibleProducts.id),
    )
    .where(eq(specLines.dossierId, dossierId))
    .orderBy(asc(specLines.sortOrder), asc(specLines.createdAt));

  return rows.map((r) => ({
    fixtureCode: r.fixtureCode,
    location: r.location ?? null,
    brand: r.matchedBrand ?? r.brandText ?? null,
    productId: r.matchedProductId ?? null,
    productName: r.matchedName ?? null,
    articleCode: r.matchedArticleCode ?? null,
    kelvin: r.matchedKelvin ?? r.reqKelvin ?? null,
    cri: r.matchedCri ?? r.reqCri ?? null,
    ip: r.matchedIp ?? r.reqIp ?? null,
    status: r.status,
  }));
}

// Leg een nieuwe versie vast (versie = vorige + 1) met een snapshot van de huidige regels.
export async function snapshotArmaturenboek(
  db: AppDb,
  input: { dossierId: string; note?: string | null; actor?: string },
) {
  const snapshot = await currentRows(db, input.dossierId);
  const [{ max }] = (await db
    .select({
      max: sql<number>`coalesce(max(${armaturenboekVersions.version}), 0)`,
    })
    .from(armaturenboekVersions)
    .where(eq(armaturenboekVersions.dossierId, input.dossierId))) as {
    max: number;
  }[];
  const version = Number(max) + 1;

  const [row] = await db
    .insert(armaturenboekVersions)
    .values({
      dossierId: input.dossierId,
      version,
      note: input.note ?? null,
      snapshot: snapshot as Record<string, unknown>[],
      actor: input.actor ?? null,
    })
    .returning();

  await logEvent(db, {
    entity: "dossier",
    entityId: input.dossierId,
    action: "armaturenboek_snapshot",
    actor: input.actor,
    payload: { version, lineCount: snapshot.length },
  });
  return row;
}

export async function listVersions(db: AppDb, dossierId: string) {
  return db
    .select()
    .from(armaturenboekVersions)
    .where(eq(armaturenboekVersions.dossierId, dossierId))
    .orderBy(desc(armaturenboekVersions.version));
}

export async function getVersion(db: AppDb, id: string) {
  const [row] = await db
    .select()
    .from(armaturenboekVersions)
    .where(eq(armaturenboekVersions.id, id))
    .limit(1);
  return row ?? null;
}

// Pure diff-functie (G-02 wijzigingshistorie). Accepteert een versie-rij (met `.snapshot`)
// óf een kale snapshot-array, zodat 'm zowel op db-rijen als op fixtures werkt.
type VersionLike =
  | ArmatuurSnapshotRow[]
  | { snapshot: unknown }
  | null
  | undefined;

function toRows(x: VersionLike): ArmatuurSnapshotRow[] {
  if (!x) return [];
  const raw = Array.isArray(x) ? x : (x.snapshot as unknown);
  return Array.isArray(raw) ? (raw as ArmatuurSnapshotRow[]) : [];
}

export function diffVersions(a: VersionLike, b: VersionLike): VersionDiff {
  const before = toRows(a);
  const after = toRows(b);
  const beforeByCode = new Map(before.map((r) => [r.fixtureCode, r]));
  const afterByCode = new Map(after.map((r) => [r.fixtureCode, r]));

  const added: ArmatuurSnapshotRow[] = [];
  const removed: ArmatuurSnapshotRow[] = [];
  const changed: VersionDiff["changed"] = [];
  let unchanged = 0;

  for (const [code, afterRow] of afterByCode) {
    const beforeRow = beforeByCode.get(code);
    if (!beforeRow) {
      added.push(afterRow);
      continue;
    }
    const fields = DIFF_FIELDS.filter(
      (f) => (beforeRow[f] ?? null) !== (afterRow[f] ?? null),
    );
    if (fields.length > 0) {
      changed.push({
        fixtureCode: code,
        before: beforeRow,
        after: afterRow,
        fields: fields as string[],
      });
    } else {
      unchanged++;
    }
  }
  for (const [code, beforeRow] of beforeByCode) {
    if (!afterByCode.has(code)) removed.push(beforeRow);
  }
  return { added, removed, changed, unchanged };
}

// ── Datasheets (G-04) ────────────────────────────────────────────────────────
// De datasheets van één product (los op te vragen).
export async function listDatasheets(db: AppDb, productId: string) {
  return db
    .select({
      id: productDatasheets.id,
      filename: productDatasheets.filename,
      url: productDatasheets.url,
    })
    .from(productDatasheets)
    .where(eq(productDatasheets.productId, productId))
    .orderBy(asc(productDatasheets.filename));
}

// Datasheets voor meerdere producten in één query → map per productId. Voor de
// versiepagina, die naast elke regel de datasheets toont. Houdt het simpel: één query.
export async function datasheetsByProducts(
  db: AppDb,
  productIds: string[],
): Promise<Record<string, { filename: string; url: string }[]>> {
  const map: Record<string, { filename: string; url: string }[]> = {};
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return map;
  const rows = await db
    .select({
      productId: productDatasheets.productId,
      filename: productDatasheets.filename,
      url: productDatasheets.url,
    })
    .from(productDatasheets)
    .where(inArray(productDatasheets.productId, ids))
    .orderBy(asc(productDatasheets.filename));
  for (const r of rows) {
    (map[r.productId] ??= []).push({ filename: r.filename, url: r.url });
  }
  return map;
}
