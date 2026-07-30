import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { VersionHistory } from "@/components/dossier/version-history";
import type {
  VersionDiffView,
  VersionListItem,
  VersionSnapshotLine,
} from "@/components/dossier/version-history";
import type { MatchStatus } from "@/components/dossier/status";
import { formatDate } from "@/lib/format";
import { getDossier } from "@/lib/repo/dossiers";
import {
  datasheetsByProducts,
  diffVersions,
  getVersion,
  listVersions,
  type ArmatuurSnapshotRow,
} from "@/lib/repo/armaturenboek-versions";
import { isUuid, requireUuid } from "@/lib/uuid";
import { requireSession } from "@/lib/session";
import { snapshotAction } from "./actions";

// Armaturenboek-versies (G-02/03/04): binnen de dossier-layout → fragment. De layout levert
// de kop + tabs; deze pagina rendert de versiehistorie, de diff tussen twee versies en van de
// nieuwste versie de regels mét locatie en datasheets.
function toLine(
  r: ArmatuurSnapshotRow,
  datasheets?: { filename: string; url: string }[],
): VersionSnapshotLine {
  return { ...r, status: r.status as MatchStatus, datasheets };
}

function snapshotRows(snapshot: unknown): ArmatuurSnapshotRow[] {
  return Array.isArray(snapshot) ? (snapshot as ArmatuurSnapshotRow[]) : [];
}

export default async function VersiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  // De route-param krijgt requireUuid (de pagina bestaat niet), ?from=/?to= alleen isUuid
  // hieronder (de pagina bestaat wél, alleen de gevraagde diff niet). Eigen guard en niet
  // die van de dossier-layout: die rendert concurrent met deze pagina. Zie de regel bij
  // requireUuid in lib/uuid.ts.
  requireUuid(id);
  const dossier = await getDossier(db, id);
  if (!dossier) notFound();

  const versionRows = await listVersions(db, id);

  // Nieuwste versie + datasheets voor de producten daarin (G-04).
  const latestRow = versionRows[0] ?? null;
  const latestSnapshot = snapshotRows(latestRow?.snapshot);
  const dsMap = await datasheetsByProducts(
    db,
    latestSnapshot
      .map((r) => r.productId)
      .filter((x): x is string => Boolean(x)),
  );
  const latest = latestRow
    ? {
        version: latestRow.version,
        lines: latestSnapshot.map((r) =>
          toLine(r, r.productId ? dsMap[r.productId] : undefined),
        ),
      }
    : null;

  // Diff: expliciet gekozen (?from=&to=) of standaard de twee nieuwste versies.
  let fromRow = null;
  let toRow = null;
  // Zelfde uuid-cast-val als bug #1, hier via QUERY-params: ?from=x&to=y gaf een 500.
  // Géén notFound() maar terugvallen op de standaard-diff (de twee nieuwste versies) —
  // de pagina zelf is geldig, alleen de gevraagde vergelijking niet.
  if (isUuid(sp.from) && isUuid(sp.to)) {
    [fromRow, toRow] = await Promise.all([
      getVersion(db, sp.from),
      getVersion(db, sp.to),
    ]);
  } else if (versionRows.length >= 2) {
    toRow = versionRows[0];
    fromRow = versionRows[1];
  }
  let diff: VersionDiffView | null = null;
  if (
    fromRow &&
    toRow &&
    fromRow.dossierId === id &&
    toRow.dossierId === id
  ) {
    const d = diffVersions(fromRow, toRow);
    diff = {
      fromVersion: fromRow.version,
      toVersion: toRow.version,
      added: d.added.map((r) => toLine(r)),
      removed: d.removed.map((r) => toLine(r)),
      changed: d.changed.map((c) => ({
        fixtureCode: c.fixtureCode,
        location: c.after.location,
        fields: c.fields,
      })),
      unchanged: d.unchanged,
    };
  }

  const versions: VersionListItem[] = versionRows.map((v, i) => {
    const prev = versionRows[i + 1]; // volgende in de aflopende lijst = vorige versie
    return {
      id: v.id,
      version: v.version,
      note: v.note,
      actor: v.actor,
      createdAt: formatDate(v.createdAt),
      lineCount: snapshotRows(v.snapshot).length,
      compareHref: prev ? `?from=${prev.id}&to=${v.id}` : null,
    };
  });

  return (
    <VersionHistory
      dossierId={id}
      versions={versions}
      latest={latest}
      diff={diff}
      snapshotAction={snapshotAction}
    />
  );
}
