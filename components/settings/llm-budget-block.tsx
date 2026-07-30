import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatEur } from "@/lib/format";

// LLM-BUDGET (L-06): de maandcap plus de verbruiksteller. Een teller, geen alarm —
// bij overschrijding een rustige amberkleur, nooit een rood alarm (esthetiek = eerlijkheid).
// Leesbare namen voor de doelen in llm_usage.purpose. Een doel dat hier ontbreekt valt
// terug op zijn eigen sleutel — het verdwijnt nooit uit de optelling.
const PURPOSE_LABEL: Record<string, string> = {
  vangnet: "AI fallback",
  ocr: "OCR (image PDFs)",
  leesroute: "AI reading route",
  import: "Import",
  "zoek-fallback": "Search fallback",
  verrijking: "Enrichment",
  eval: "Evaluation",
};

export type LlmSpendBreakdownRow = { purpose: string; eur: number };

export function LlmBudgetBlock({
  budgetEur,
  spentEur,
  breakdown,
  saveAction,
}: {
  budgetEur: number | null;
  spentEur: number;
  // UX-audit 30 jul (bug #10): dit waren twee losse props (vangnetEur/ocrEur), dus de
  // uitsplitsing toonde "AI fallback € 0,23 / OCR € 0,10" onder een totaal van € 2,40 en
  // liet € 2,07 onverklaard. Nu de volledige group-by over llm_usage.purpose plus een
  // expliciete Other-restpost: wat op het scherm staat telt op tot de teller erboven.
  breakdown?: LlmSpendBreakdownRow[];
  saveAction: (formData: FormData) => void | Promise<void>;
}) {
  // Een cap van 0 is géén "geen cap" maar de strengste: de domeinlaag blokkeert er
  // werkelijk álles mee, ook bij verbruik 0 (lib/ai/ocr.ts:535 en lib/ai/vangnet.ts:537
  // vergelijken `spend >= budget`). Alleen null betekent "geen plafond".
  const hasCap = budgetEur != null;
  // ≤ 0, niet === 0: een negatieve cap blokkeert net zo hard (`0 >= -5`) en verdient
  // dus dezelfde volle balk. Via het formulier is hij onbereikbaar (app/settings/
  // actions.ts weigert `< 0`), via een directe jsonb-write niet.
  const capBlocksAll = budgetEur != null && budgetEur <= 0;
  // Delen mag uitsluitend waar de deler > 0 is: 0/0 geeft NaN en daarmee een
  // aria-valuenow="NaN" plus een ongeldige width, waarna de balk juist vol lijkt.
  const pct =
    budgetEur != null && budgetEur > 0
      ? Math.min(100, (spentEur / budgetEur) * 100)
      : capBlocksAll
        ? 100
        : 0;
  // Strikt groter dan: bij cap 0 en €0,00 verbruik is er niets overschreden.
  const over = budgetEur != null && spentEur > budgetEur;

  // De restpost. De group-by dekt het totaal al, maar een afrondingsverschil of een rij
  // die buiten de uitsplitsing valt mag niet stil verdwijnen — dan staat hij als "Other".
  // Onder een cent tonen we hem niet: dat is ruis, geen gat.
  const rows = breakdown ?? [];
  const listed = rows.reduce((sum, r) => sum + r.eur, 0);
  const other = spentEur - listed;
  const showOther = rows.length > 0 && Math.abs(other) >= 0.005;

  return (
    <Card>
      <CardHeader>
        <CardTitle>LLM budget</CardTitle>
        <p className="text-sm text-muted-foreground">
          Monthly cap for import, AI fallback, search fallback and enrichment. The
          counter runs per calendar month.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              Spent this month
            </span>
            <span className="tabular-nums">
              <span className="font-semibold">{formatEur(spentEur)}</span>
              {hasCap && (
                <span className="text-muted-foreground">
                  {" "}
                  / {formatEur(budgetEur)}
                </span>
              )}
            </span>
          </div>
          {hasCap ? (
            <>
              <div
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={
                    over
                      ? "h-full rounded-full bg-status-amber-dot/70"
                      : "h-full rounded-full bg-foreground/70"
                  }
                  style={{ width: `${pct}%` }}
                />
              </div>
              {over && (
                <p className="mt-2 text-xs text-status-amber-ink">
                  Monthly cap exceeded — check the spend.
                </p>
              )}
              {capBlocksAll && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Monthly cap is {formatEur(budgetEur)} — no AI spend is allowed
                  this month.
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              No monthly cap set.
            </p>
          )}
          {rows.length > 0 && (
            <dl className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
              {rows.map((r) => (
                <div key={r.purpose} className="flex justify-between gap-3">
                  <dt>{PURPOSE_LABEL[r.purpose] ?? r.purpose}</dt>
                  <dd className="tabular-nums">{formatEur(r.eur)}</dd>
                </div>
              ))}
              {showOther && (
                <div className="flex justify-between gap-3">
                  <dt>Other</dt>
                  <dd className="tabular-nums">{formatEur(other)}</dd>
                </div>
              )}
            </dl>
          )}
        </div>

        <form
          action={saveAction}
          className="flex flex-col gap-2 border-t border-foreground/10 pt-4 sm:flex-row sm:items-center"
        >
          <label htmlFor="llm-budget" className="text-sm font-medium">
            Monthly cap (€)
          </label>
          <Input
            id="llm-budget"
            name="budget"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            defaultValue={budgetEur ?? ""}
            placeholder="50"
            className="sm:max-w-32"
          />
          <Button type="submit" variant="secondary" className="self-start">
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
