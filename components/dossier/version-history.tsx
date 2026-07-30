// Armaturenboek-versiehistorie (G-02/03/04) — presentational, fixture-testbaar.
// Toont de vastgelegde versies (nieuwste eerst), een "Nieuwe versie vastleggen"-knop, de
// diff tussen twee versies, en van de nieuwste versie de regels mét locatie (G-03) en
// datasheets (G-04). Esthetiek = eerlijkheid: rustige tinten, onopgeloste regels blijven
// zichtbaar met hun status, niets telt op tot iets misleidends.
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "./status-badge";
import type { MatchStatus } from "./status";

type Action = (formData: FormData) => void | Promise<void>;

export type VersionListItem = {
  id: string;
  version: number;
  note: string | null;
  actor: string | null;
  createdAt: string; // reeds geformatteerd (nl-NL)
  lineCount: number;
  compareHref: string | null; // vergelijk met de vorige versie
};

export type VersionSnapshotLine = {
  fixtureCode: string;
  location: string | null;
  brand: string | null;
  productId: string | null;
  productName: string | null;
  articleCode: string | null;
  kelvin: number | null;
  cri: number | null;
  ip: string | null;
  status: MatchStatus;
  datasheets?: { filename: string; url: string }[];
};

export type VersionDiffView = {
  fromVersion: number;
  toVersion: number;
  added: VersionSnapshotLine[];
  removed: VersionSnapshotLine[];
  changed: { fixtureCode: string; location: string | null; fields: string[] }[];
  unchanged: number;
};

// Veld-key → NL-label voor de diff. productId/productName vallen samen onder "product".
const FIELD_LABEL: Record<string, string> = {
  location: "location",
  brand: "brand",
  productId: "product",
  productName: "product",
  articleCode: "art. no.",
  kelvin: "color temp.",
  cri: "CRI",
  ip: "IP",
  status: "status",
};

function fieldLabels(fields: string[]): string {
  const labels = [...new Set(fields.map((f) => FIELD_LABEL[f] ?? f))];
  return labels.join(", ");
}

// Datasheet-links van één product (G-04) — los, klein, rustig.
function DatasheetLinks({
  items,
}: {
  items?: { filename: string; url: string }[];
}) {
  if (!items || items.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-0.5">
      {items.map((d) => (
        <a
          key={d.url}
          href={d.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {d.filename}
        </a>
      ))}
    </span>
  );
}

function SnapshotForm({
  dossierId,
  snapshotAction,
}: {
  dossierId: string;
  snapshotAction: Action;
}) {
  return (
    <form
      action={snapshotAction}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="dossierId" value={dossierId} />
      <input
        type="text"
        name="note"
        placeholder="Note (optional) — e.g. after customer revision"
        className="h-8 w-64 max-w-full rounded-lg border border-input bg-background px-2.5 text-sm"
      />
      <Button type="submit" size="sm">
        Save new version
      </Button>
    </form>
  );
}

function DiffPanel({ diff }: { diff: VersionDiffView }) {
  const nothing =
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.changed.length === 0;
  return (
    <section className="rounded-xl ring-1 ring-foreground/10 p-4">
      <h3 className="text-sm font-medium">
        Changes v{diff.fromVersion} → v{diff.toVersion}
      </h3>
      {nothing ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No differences — the two versions are identical.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3 text-sm">
          {diff.changed.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Changed ({diff.changed.length})
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {diff.changed.map((c) => (
                  <li key={c.fixtureCode}>
                    <span className="font-medium">{c.fixtureCode}</span>
                    {c.location ? (
                      <span className="text-muted-foreground"> · {c.location}</span>
                    ) : null}
                    <span className="text-status-amber-ink">
                      {" "}
                      — {fieldLabels(c.fields)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {diff.added.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Added ({diff.added.length})
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {diff.added.map((r) => (
                  <li key={r.fixtureCode} className="text-status-green-ink">
                    <span className="font-medium">{r.fixtureCode}</span>
                    {r.location ? (
                      <span className="opacity-80"> · {r.location}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {diff.removed.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Removed ({diff.removed.length})
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {diff.removed.map((r) => (
                  <li
                    key={r.fixtureCode}
                    className="text-muted-foreground line-through"
                  >
                    <span className="font-medium">{r.fixtureCode}</span>
                    {r.location ? <span> · {r.location}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function LatestSnapshot({
  latest,
}: {
  latest: { version: number; lines: VersionSnapshotLine[] };
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        Latest version (v{latest.version}) — {latest.lines.length}{" "}
        {latest.lines.length === 1 ? "line" : "lines"}
      </h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Brand</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Art. no.</TableHead>
            <TableHead>Datasheets</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {latest.lines.map((r) => {
            const hasProduct = r.status === "groen" || r.status === "geel";
            return (
              <TableRow key={r.fixtureCode}>
                <TableCell className="font-medium">{r.fixtureCode}</TableCell>
                <TableCell className="whitespace-normal">
                  {r.location ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>{r.brand ?? "—"}</TableCell>
                <TableCell className="max-w-72 whitespace-normal">
                  {hasProduct && r.productName ? (
                    r.productName
                  ) : (
                    <span className="text-muted-foreground">
                      no product chosen
                    </span>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  {hasProduct ? (r.articleCode ?? "—") : "—"}
                </TableCell>
                <TableCell>
                  {r.datasheets && r.datasheets.length > 0 ? (
                    <DatasheetLinks items={r.datasheets} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}

export function VersionHistory({
  dossierId,
  versions,
  latest,
  diff,
  snapshotAction,
}: {
  dossierId: string;
  versions: VersionListItem[];
  latest: { version: number; lines: VersionSnapshotLine[] } | null;
  diff: VersionDiffView | null;
  snapshotAction: Action;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Version history</h2>
          <p className="text-sm text-muted-foreground">
            Save the luminaire schedule as a version at every handover or revision —
            so every change can be found and compared.
          </p>
        </div>
        <SnapshotForm dossierId={dossierId} snapshotAction={snapshotAction} />
      </div>

      {versions.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">No versions saved yet.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Save the first version once the luminaire schedule is ready for the
            construction site. The lines — product, specs and location — are frozen.
          </p>
        </div>
      ) : (
        <>
          {diff && <DiffPanel diff={diff} />}
          {latest && <LatestSnapshot latest={latest} />}

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              All versions ({versions.length})
            </h3>
            <ul className="flex flex-col divide-y rounded-xl ring-1 ring-foreground/10">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                >
                  <span className="font-medium tabular-nums">v{v.version}</span>
                  <span className="text-sm text-muted-foreground">
                    {v.createdAt}
                  </span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {v.lineCount} {v.lineCount === 1 ? "line" : "lines"}
                  </span>
                  {v.note && <span className="text-sm">{v.note}</span>}
                  <span className="ml-auto flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      by {v.actor ?? "unknown"}
                    </span>
                    {v.compareHref && (
                      <Button asChild size="sm" variant="outline">
                        <a href={v.compareHref}>Compare with previous</a>
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
