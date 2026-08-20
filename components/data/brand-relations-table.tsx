"use client";

// Merkrelaties-overzicht — de rij (herbouwd 30 jul, UX-audit bak 2 item 10).
//
// Wat er wég is en waarom:
//
//  1. DE 438 `<select>`s. Elke rij had een altijd-gemonteerde combobox met zes opties, dus
//     ~2.600 <option>-knopen en een scherm dat als formulier las in plaats van als lijst.
//     Nu: een badge met de status, en pas op klik verschijnt er één select — precies één
//     op de hele pagina. De statusvocabulaire (STATUS_LABEL) en de server-action zijn
//     ongewijzigd; alleen het moment waarop de editor bestaat verschuift.
//
//  2. HET FILTEREN EN PAGINEREN. Stond hier in useState/useMemo over álle 438 rijen; leeft
//     nu in de URL en op de server (lib/brand-relations-view.ts +
//     brand-relations-controls.tsx). Deze component krijgt uitsluitend de rijen van de
//     huidige pagina — 25 in plaats van 438.
//
//  3. DE KOLOM `Last contact`. Was 438× "—", een lege kolom over de volle breedte. Niet
//     geschrapt maar VERHUISD: hij staat als tweede regel onder de statusbadge, en alleen
//     als er werkelijk een datum is. Hij hoort ook inhoudelijk daar — het "no response"-
//     filter is niets anders dan status + deze datum.
//
//  4. DE KOLOM `Price list`. Was 437× dezelfde groene "Valid"-pil; een kolom die overal
//     hetzelfde zegt draagt geen informatie, hij vult alleen de rij met kleur. De kolom
//     blijft (iemand moet kunnen zien dat een prijslijst mist), maar de gelukkige stand is
//     nu stille grijze tekst en alleen de uitzonderingen — expiring/expired/missing —
//     dragen een tint. De uitzondering springt daardoor eruit in plaats van te verdrinken.
//     Let op: dit raakt ijzeren regel 3 niet; die gaat over zichtbaarheid in zoekresultaten
//     en wordt centraal afgedwongen, niet door deze badge.
//
//  5. DE MINI-SCORECARD. Tien vierkantjes van 12px zonder legenda, en voor 437 van de 438
//     merken toch "n/a". Vervangen door één percentage dat naar het detailscherm linkt —
//     dáár staat de echte scorecard met 66 velden, kleuren én legenda. Bijvangst die het
//     hele scherm sneller maakt: het percentage wordt alleen nog berekend voor de merken op
//     de huidige pagina (zie getAllBrandCompleteness). components/data/mini-scorecard.tsx
//     blijft bestaan maar heeft hier geen aanroeper meer.
import { useCallback, useMemo, useState, useTransition } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { veldClass } from "@/components/ui/field";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { cn } from "@/lib/utils";
import { callAction, failureDetail } from "@/lib/next-action-result";
import {
  BRAND_RELATIONS_PATH,
  STATUS_LABEL,
  STATUS_ORDER,
  type BrandRelationTableRow,
  type PriceIndicator,
  type RelationStatus,
} from "@/lib/brand-relations-view";

export type {
  BrandRelationTableRow,
  PriceIndicator,
  RelationStatus,
} from "@/lib/brand-relations-view";
export { STATUS_LABEL } from "@/lib/brand-relations-view";

const INDICATOR_LABEL: Record<PriceIndicator, string> = {
  aanwezig_geldig: "Valid",
  verloopt_binnenkort: "Expiring soon",
  verlopen: "Expired",
  ontbreekt: "Missing",
};

// Alleen de uitzonderingen krijgen een tint (zie punt 4 bovenaan).
const INDICATOR_TINT: Record<PriceIndicator, string | null> = {
  aanwezig_geldig: null,
  verloopt_binnenkort: "bg-status-amber-tint text-status-amber-ink",
  verlopen: "bg-status-grey-tint text-status-grey-ink",
  ontbreekt: "bg-status-red-tint text-status-red-ink",
};

// De badge draagt altijd het LABEL; de tint is de tweede drager, nooit de enige.
const STATUS_TINT: Record<RelationStatus, string> = {
  niet_benaderd: "bg-status-grey-tint text-status-grey-ink",
  benaderd: "bg-status-blue-tint text-status-blue-ink",
  wacht_op_data: "bg-status-amber-tint text-status-amber-ink",
  data_ontvangen: "bg-status-purple-tint text-status-purple-ink",
  verwerkt: "bg-status-green-tint text-status-green-ink",
  afgewezen: "bg-status-red-tint text-status-red-ink",
};

const BADGE = "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium";

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

export function BrandRelationsTable({
  rows,
  updateAction,
  bulkAction,
}: {
  /** Uitsluitend de rijen van de huidige pagina — het filteren gebeurt in de RSC. */
  rows: BrandRelationTableRow[];
  updateAction: (formData: FormData) => Promise<void> | void;
  /** Bulk-status voor de selectie; loopt via ConfirmActionDialog (form-submit). */
  bulkAction: (formData: FormData) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<RelationStatus>("benaderd");
  const [melding, setMelding] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const paginaIds = useMemo(() => rows.map((r) => r.brandId), [rows]);
  // De selectie hoort bij de rijen die je ziet: bladeren of filteren levert nieuwe props
  // en dus een selectie die alleen nog uit zichtbare merken bestaat.
  const geselecteerd = useMemo(
    () => paginaIds.filter((id) => selected.has(id)),
    [paginaIds, selected],
  );
  const allesGeselecteerd =
    paginaIds.length > 0 && geselecteerd.length === paginaIds.length;

  const wisSelectie = useCallback(() => setSelected(new Set()), []);

  function toggleRij(brandId: string, aan: boolean) {
    setSelected((vorige) => {
      const next = new Set(vorige);
      if (aan) next.add(brandId);
      else next.delete(brandId);
      return next;
    });
  }

  function toggleAlles(aan: boolean) {
    setSelected(aan ? new Set(paginaIds) : new Set());
  }

  // Eén rij van status wisselen. Via callAction (CLAUDE.md): een kale `await` in een
  // try/catch zou een NEXT_REDIRECT — Next' navigatiesignaal, én het signaal van een
  // verlopen sessie — niet van een echte fout kunnen onderscheiden.
  function setStatus(row: BrandRelationTableRow, status: string) {
    setEditing(null);
    if (status === row.status) return;
    const fd = new FormData();
    fd.set("brandId", row.brandId);
    fd.set("status", status);
    startTransition(async () => {
      const uitkomst = await callAction(async () => updateAction(fd), {
        path: BRAND_RELATIONS_PATH,
      });
      if (uitkomst.kind === "value" || uitkomst.kind === "arrived") {
        setMelding(null);
        return;
      }
      setMelding(
        uitkomst.kind === "signedOut"
          ? "Your session expired — sign in again; the status was not changed."
          : uitkomst.kind === "failed"
            ? `Could not change the status of ${row.brandName}: ${failureDetail(uitkomst.error)}.`
            : `Could not change the status of ${row.brandName} — the server sent us to ${uitkomst.href}.`,
      );
    });
  }

  return (
    <div className="space-y-3">
      {melding && (
        <p
          role="status"
          className="rounded-md bg-status-red-tint px-3 py-2 text-sm text-status-red-ink"
        >
          {melding}
        </p>
      )}

      {geselecteerd.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium tabular-nums">
            {geselecteerd.length} selected
          </span>
          <label className="flex items-center gap-2 text-sm">
            Set status to
            <select
              value={bulkStatus}
              onChange={(e) =>
                setBulkStatus(e.target.value as RelationStatus)
              }
              aria-label="Status for the selected brands"
              className={veldClass}
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <ConfirmActionDialog
            trigger={
              <Button type="button" size="sm">
                Apply to {geselecteerd.length}
              </Button>
            }
            title={`Set ${geselecteerd.length} ${geselecteerd.length === 1 ? "brand" : "brands"} to “${STATUS_LABEL[bulkStatus]}”?`}
            description={`This overwrites the relationship status of every selected brand, including brands that already moved further along. Each change is recorded in the event log, so you can see afterwards what this did — but there is no single undo.`}
            confirmLabel={`Set ${geselecteerd.length} to ${STATUS_LABEL[bulkStatus]}`}
            confirmVariant="default"
            action={bulkAction}
            fields={{ brandIds: geselecteerd.join(","), status: bulkStatus }}
            onDone={wisSelectie}
          />
          <Button type="button" size="sm" variant="ghost" onClick={wisSelectie}>
            Clear selection
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        // Was een kale grijze regel (reviewzwerm 2.5a C1). "framed": op
        // /brand-management staat de tabel in een `space-y-4`-kolom naast de
        // toolbar en de pager, niet in een <Card> die al een kader tekent.
        //
        // Bewuste `action={null}`: het filter dat deze leegte veroorzaakt staat in
        // BrandRelationsToolbar, direct hierboven en met zijn eigen wisknop. Deze
        // component kent de query niet (die leeft in de URL en op de server), dus een
        // knop hier zou zijn eigen bediening moeten nabouwen.
        <EmptyState title="No brands match the filters." action={null} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  checked={allesGeselecteerd}
                  onChange={(e) => toggleAlles(e.target.checked)}
                  aria-label="Select all brands on this page"
                />
              </TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Price list</TableHead>
              <TableHead className="text-right">Products</TableHead>
              <TableHead
                className="text-right"
                title="Share of the 66 requested Excel fields that is filled, across all products of the brand. Open the brand for the full scorecard."
              >
                Completeness
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const tint = INDICATOR_TINT[r.priceListIndicator];
              return (
                <TableRow key={r.brandId}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(r.brandId)}
                      onChange={(e) => toggleRij(r.brandId, e.target.checked)}
                      aria-label={`Select ${r.brandName}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <a
                      href={`/brand-management/${r.brandId}`}
                      className="hover:underline"
                    >
                      {r.brandName}
                    </a>
                    {r.brandCode && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {r.brandCode}
                      </span>
                    )}
                    {r.sharedBrandCode && (
                      <span
                        className={cn(
                          BADGE,
                          "ml-2 bg-status-orange-tint text-status-orange-ink",
                        )}
                        title="Multiple brands share this code — don't approach twice"
                      >
                        duplicate code
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editing === r.brandId ? (
                      <select
                        autoFocus
                        defaultValue={r.status}
                        disabled={pending}
                        onChange={(e) => setStatus(r, e.target.value)}
                        onBlur={() => setEditing(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditing(null);
                        }}
                        aria-label={`Status of ${r.brandName}`}
                        className={veldClass}
                      >
                        {STATUS_ORDER.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setEditing(r.brandId)}
                        aria-label={`Change status of ${r.brandName}`}
                        // Geen invoerveld, dus DESIGN.md §6 "Invoer" raakt hem niet — §7
                        // wél: focus is een 2px ring in de ringkleur met offset. De
                        // ring/50-halo was de afgeschafte shadcn-stand (reviewzwerm B10)
                        // en botste met de focusstijl van Button/Input ernaast.
                        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                      >
                        <span
                          className={cn(
                            BADGE,
                            STATUS_TINT[r.status],
                            "border border-transparent hover:border-foreground/25",
                          )}
                        >
                          {STATUS_LABEL[r.status]}
                        </span>
                      </button>
                    )}
                    {r.lastContactAt && (
                      <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        Last contact {fmtDate(r.lastContactAt)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {tint ? (
                      <span className={cn(BADGE, tint)}>
                        {INDICATOR_LABEL[r.priceListIndicator]}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {INDICATOR_LABEL[r.priceListIndicator]}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.productCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.completeness === null ? (
                      <span
                        className="text-xs text-muted-foreground"
                        title="No products in the catalog — completeness n/a"
                      >
                        n/a
                      </span>
                    ) : (
                      <a
                        href={`/brand-management/${r.brandId}`}
                        className="hover:underline"
                        title={`${Math.round(r.completeness * 100)}% of the requested fields filled — open ${r.brandName} for the full scorecard`}
                      >
                        {Math.round(r.completeness * 100)}%
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
