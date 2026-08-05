import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { entityLabel, eventLabel } from "@/lib/event-labels";
import { formatDateTime } from "@/lib/format";

export type EventRow = {
  id: string;
  entity: string;
  action: string;
  actor: string;
  createdAt: string; // ISO
  payload?: Record<string, unknown> | null;
};

// UX-audit 30 jul (bug #9): hier stond een eigen `toLocaleString("nl-NL", …)` zónder jaar
// — "30 jul, 12:24" terwijl het log over maanden loopt. Eén datumformatter voor de hele
// app, in lib/format.ts.

// Hoeveel payload-paren er hooguit in de cel passen voordat het een blok tekst wordt.
const MAX_PAYLOAD_PAIRS = 4;

// ── Payload-sleutels die op het scherm mogen, mét hun Engelse label ────────────────────
//
// EXPLICIETE LIJST, GEEN VANGNET — en dat is het hele punt (reparatie 30 jul, bevinding 5).
// De vorige versie haalde élke payload-sleutel door `fieldLabel()`. Die sleutels zijn geen
// productvelden maar interne loggegevens, en een groot deel is Nederlands: `reden`,
// `regels`, `regelsMetSegment`, `regelsVerrijkt`, `velden`, `eigenVelden`, `rijen`,
// `kolommen`, `totaal`, `bron`, `melding`, `niveau`, `bekendeMerken`, `nieuweProducten`,
// `waarschuwingen`, `routerReden`, `tekstLengte`. Die kwamen er als "Reden:", "Regels met
// segment:", "Tekst lengte:" uit — zichtbaar-ruwe JSON ingeruild voor onzichtbaar-foute
// labels, precies tegen bug #8 ("geen ontwikkelaarstaal") en #9 ("geen Nederlands") in.
//
// Wat hier niet in staat wordt VERBORGEN, niet geraden. Het event zelf blijft zichtbaar
// (moment, entiteit, actie, actor); alleen dat ene onbenoemde paar valt weg. Het volledige
// payload staat nog altijd in de events-tabel — dit scherm is de leesbare weergave, niet
// de bron (ijzeren regel 5 blijft dus intact).
//
// BEWUST NIET `FIELD_LABELS`/`fieldLabel()` uit lib/matching hergebruiken: dan zou een
// nieuw matchingveld stilzwijgend de weergave van /data veranderen. Twee vocabulaires,
// twee bestanden.
const PAYLOAD_LABEL: Record<string, string> = {
  // Wie/wat.
  brand: "Brand",
  brandCode: "Brand code",
  brandKey: "Brand",
  brandText: "Brand (as written)",
  displayName: "Name",
  email: "Email",
  fixtureCode: "Fixture code",
  filename: "File",
  labelEn: "Label",
  name: "Name",
  productName: "Product",
  query: "Query",
  slug: "Slug",
  supplierArticleCode: "Article code",
  // Uitkomst en omvang.
  added: "Added",
  applied: "Applied",
  appliedFields: "Fields applied",
  archivedCount: "Archived",
  archivedLines: "Lines archived",
  count: "Count",
  createdProducts: "Products created",
  discarded: "Discarded",
  frequency: "Requested",
  imported: "Imported",
  inserted: "Inserted",
  lineCount: "Lines",
  ofRows: "Of rows",
  pageCount: "Pages",
  pages: "Pages",
  pagesDone: "Pages done",
  parsed: "Parsed",
  priceLines: "Price lines",
  quantity: "Quantity",
  rematched: "Rematched",
  resultCount: "Results",
  rowsRead: "Rows read",
  // B2: hoeveel lopende sessies het verwijderen van een allowlist-adres introk.
  sessionsRevoked: "Sessions revoked",
  skippedStaleFields: "Fields skipped (stale)",
  suggested: "Suggested",
  unchanged: "Unchanged",
  updated: "Updated",
  updatedProducts: "Products updated",
  // Toestand en overgang.
  environment: "Environment",
  field: "Field",
  fieldKey: "Field",
  from: "From",
  kind: "Kind",
  lifecycle: "Lifecycle",
  phase: "Phase",
  price: "Price",
  status: "Status",
  threshold: "Threshold",
  tier: "Tier",
  to: "To",
  validUntil: "Valid until",
  // B7: mensoordeel op een verrijkings-steekproef (goed/fout).
  verdict: "Verdict",
  version: "Version",
  visible: "Visible",
  xisPhase: "XIS phase",
  // Kosten en model.
  budgetEur: "Budget",
  costEur: "Cost",
  inputTokens: "Input tokens",
  maxTokens: "Token limit",
  model: "Model",
  outputTokens: "Output tokens",
  spendEur: "Spent",
  tokens: "Tokens",
  truncated: "Truncated",
  // Overig dat wél Engels en zelfverklarend is.
  note: "Note",
  page: "Page",
  reason: "Reason",
  roles: "Roles",
  source: "Source",
  trigger: "Trigger",
};

// Enkele waarden zijn óók Nederlands (de screenshot toonde "Status: rood"): de
// statuskleuren zijn NL enum-waarden in de database, met Engelse schermlabels elders in de
// app. Bewust een kleine, letterlijke lijst hier en geen import uit components/dossier —
// dit scherm hoort niet aan de dossier-statuslaag vast te zitten.
const PAYLOAD_VALUE_LABEL: Record<string, string> = {
  open: "open",
  groen: "green",
  geel: "yellow",
  blauw: "blue",
  rood: "red",
  paars: "purple",
  onbekend: "unknown",
  wachtend: "waiting",
  ingeladen: "loaded",
};

type PayloadPair = { key: string; label: string; value: string };

function showPayloadValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return PAYLOAD_VALUE_LABEL[v] ?? v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // Genest object/array: compact serialiseren en afkappen — beter dan niets tonen.
  const text = JSON.stringify(v);
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

// UX-audit 30 jul (bug #8): de Details-kolom drukte ruwe JSON af (`{"brandKey":"xal",…}`),
// afgekapt met een ellips. Nu een compacte sleutel/waarde-lijst — alleen de paren waarvan
// het label hierboven vastligt. Leeg/ontbrekend payload toont "—", geen "{}"-ruis.
function payloadPairs(
  payload: Record<string, unknown> | null | undefined,
): PayloadPair[] {
  if (!payload) return [];
  const pairs: PayloadPair[] = [];
  for (const [key, value] of Object.entries(payload)) {
    const label = PAYLOAD_LABEL[key];
    if (!label) continue;
    pairs.push({ key, label, value: showPayloadValue(value) });
  }
  return pairs;
}

// EVENT-INZAGE (§3.16, ijzeren regel 5): elke zoekactie, match, keuze en beheerhandeling is
// gelogd. Verhuisd van components/admin/events-block.tsx naar Data (sprint 2.0a) — het log
// is ruwe data, geen beheerhandeling; zie HANDOVER.md "Event-log = ruwe data → onder Data".
// Alleen-lezen: het log is de bron, niet iets om te bewerken. De actie krijgt hier een
// leesbaar label (lib/event-labels.ts) en de payload als sleutel/waarde-lijst als die er is.
export function EventsBlock({ events }: { events: EventRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <p className="text-sm text-muted-foreground">
          The event log: every action is recorded. Read-only.
        </p>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          // Alleen-lezen logboek (ijzeren regel 5): er valt hier niets te starten.
          <EmptyState variant="inline" title="No activity yet." action={null} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => {
                const pairs = payloadPairs(e.payload);
                const shown = pairs.slice(0, MAX_PAYLOAD_PAIRS);
                const rest = pairs.length - shown.length;
                return (
                  <TableRow key={e.id}>
                    {/* Reparatie 30 jul, bevinding 11: bij 375px stond de Details-kolom
                        volledig buiten beeld. Oorzaak: TableCell draagt van zichzelf
                        `whitespace-nowrap`, dus de tabel kan nergens smaller worden dan de
                        som van alle voluit gezette tekst — en deze cel groeide met de
                        nieuwe formatter van 12 naar 18 tekens. Onder sm mag de datum
                        afbreken tussen dag en tijd; vanaf sm blijft hij op één regel. */}
                    <TableCell className="whitespace-normal text-muted-foreground sm:whitespace-nowrap">
                      {formatDateTime(e.createdAt)}
                    </TableCell>
                    <TableCell>
                      {/* Bug #8 hield één kolom te vroeg op: hier stond letterlijk
                          `spec_line` in de badge (reparatie 30 jul, bevinding 6). */}
                      <Badge variant="outline">{entityLabel(e.entity)}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-normal font-medium sm:whitespace-nowrap">
                      {eventLabel(e.action)}
                    </TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      {e.actor}
                    </TableCell>
                    <TableCell className="max-w-xs whitespace-normal text-xs text-muted-foreground">
                      {pairs.length === 0 ? (
                        "—"
                      ) : (
                        <dl className="flex flex-col gap-0.5">
                          {shown.map((p) => (
                            <div key={p.key} className="flex flex-wrap gap-1.5">
                              <dt className="shrink-0">{p.label}:</dt>
                              <dd className="min-w-0 truncate text-foreground/80">
                                {p.value}
                              </dd>
                            </div>
                          ))}
                          {rest > 0 && (
                            <div className="text-muted-foreground">
                              +{rest} more
                            </div>
                          )}
                        </dl>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
