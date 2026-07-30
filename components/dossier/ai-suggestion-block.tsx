// AI-suggestie-blok (B4/stap 8): het vangnet vond kandidaat-producten voor een
// onopgeloste regel. Duidelijk gelabeld als AI-suggestie — géén oordeel, geen status.
// "Gebruik als handmatige keuze" loopt via de bestaande handmatige flow (menskeuze →
// groen met merkteken); "Verwerp" markeert de suggestie als verworpen.
//
// Render-guard (defense in depth, ijzeren regel 4): in tender-fase wordt een suggestie
// met een ánder merk dan gevraagd hier NIET getoond — zelfs als er (per ongeluk) één in
// de database staat. De serverkant vergrendelt al in lib/ai/vangnet.ts; dit filter is de
// tweede verdedigingslinie op renderniveau. Geen gevraagd merk → in tender niets tonen
// (fail-closed, default = veilig).
import { IconCheck } from "./icons";
import { Button } from "@/components/ui/button";
import type { AiSuggestionRow, Phase } from "./types";

type Action = (formData: FormData) => void | Promise<void>;

function normBrand(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function AiSuggestionBlock({
  dossierId,
  specLineId,
  suggestions,
  phase,
  brandText,
  useAction,
  dismissAction,
}: {
  dossierId: string;
  specLineId: string;
  suggestions: AiSuggestionRow[];
  phase: Phase;
  brandText: string | null;
  useAction: Action;
  dismissAction: Action;
}) {
  const requested = normBrand(brandText);
  const shown =
    phase === "tender"
      ? suggestions.filter(
          (s) => requested.length > 0 && normBrand(s.brandName).includes(requested),
        )
      : suggestions;
  if (shown.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-status-blue-border bg-status-blue-tint/50 p-3 dark:bg-status-blue-tint/30">
      <p className="text-xs font-medium text-status-blue-ink">
        AI suggestion — found automatically in our own catalog. No verdict;
        choosing stays human work.
      </p>
      <ul className="flex flex-col gap-2">
        {shown.map((s) => (
          <li key={s.id} className="rounded-lg border bg-background p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">
                  <span className="text-muted-foreground">{s.brandName ?? "—"}</span>{" "}
                  <span className="font-medium">{s.name}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.articleCode ?? "—"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{s.rationale}</p>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <form action={useAction}>
                  <input type="hidden" name="dossierId" value={dossierId} />
                  <input type="hidden" name="specLineId" value={specLineId} />
                  <input type="hidden" name="suggestionId" value={s.id} />
                  <input type="hidden" name="productId" value={s.productId} />
                  {/* Bewust géén primary. Dit blok zegt zelf "No verdict; choosing stays
                      human work" — een AI-hint mag dan niet zwaarder ogen dan de
                      kandidatenlijst van de matcher ernaast, die wél onderbouwing toont.
                      Het stond op navy naast "Choose" (óók navy) op zowel het
                      regeldetail als de reviewwachtrij. Zie DESIGN.md §6. */}
                  <Button type="submit" size="sm" variant="outline">
                    <IconCheck /> Use as manual choice
                  </Button>
                </form>
                <form action={dismissAction}>
                  <input type="hidden" name="dossierId" value={dossierId} />
                  <input type="hidden" name="specLineId" value={specLineId} />
                  <input type="hidden" name="suggestionId" value={s.id} />
                  {/* `ghost`: wegwerpactie. Zakt mee nu "Use as manual choice" van navy
                      naar outline ging — anders staan de twee op gelijk gewicht. */}
                  <Button type="submit" size="sm" variant="ghost">
                    Dismiss
                  </Button>
                </form>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
