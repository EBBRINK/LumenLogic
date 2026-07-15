import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Analytics } from "@/lib/repo/analytics";

const ACTION_LABEL: Record<string, string> = {
  search: "Search",
  match: "Match",
  no_match: "No match",
  quote_generated: "Quote",
  suggestions: "Suggestions (awarded)",
  pdf_import: "PDF import",
  dossier_created: "Project created",
  phase_changed: "Phase change",
  // Nieuwe event-acties uit de vijfstatussen-/matcherlaag — nette labels.
  matched_status: "Status set",
  product_considered: "Product considered",
  spec_line_matched: "Line matched",
  spec_line_no_match: "Line without match",
  review_decided: "Review decided",
  brand_load_requested: "Brand load requested",
  quantity_linked: "Quantity linked",
  day_price_set: "Spot price set",
  xis_exported: "Exported to XIS",
  enrichment_published: "Enrichment published",
  evaluation_measured: "Hit-rate measured",
};

export function AnalyticsView({ data }: { data: Analytics }) {
  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The platform is at heart an observation machine. This layer — fed by the
          event log from day one — is the foundation of the Phase 2 revenue model:
          anonymized brand insights (which products are searched, matched and
          considered).
        </p>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Logged events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {data.totalEvents}
            </p>
          </CardContent>
        </Card>
        <Card className="sm:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              By type
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {data.actionCounts.map((a) => (
              <Badge key={a.action} variant="secondary" className="gap-1">
                {ACTION_LABEL[a.action] ?? a.action}
                <span className="tabular-nums font-semibold">{a.count}</span>
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Most searched</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topSearches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No searches yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {data.topSearches.map((s) => (
                  <li key={s.query} className="flex justify-between gap-3 text-sm">
                    <span className="truncate">{s.query}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {s.count}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Most matched products</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topMatched.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matches yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {data.topMatched.map((m) => (
                  <li
                    key={`${m.brand}-${m.name}`}
                    className="flex justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      <span className="text-muted-foreground">{m.brand}</span>{" "}
                      {m.name}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {m.count}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1.5 text-sm">
            {data.recent.map((e, i) => (
              <li key={i} className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {ACTION_LABEL[e.action] ?? e.action}
                </Badge>
                <span className="text-muted-foreground">{e.actor}</span>
                {e.payload?.query ? (
                  <span className="truncate">“{String(e.payload.query)}”</span>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
