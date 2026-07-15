import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatEur } from "@/lib/format";

// LLM-BUDGET (L-06): de maandcap plus de verbruiksteller. Een teller, geen alarm —
// bij overschrijding een rustige amberkleur, nooit een rood alarm (esthetiek = eerlijkheid).
export function LlmBudgetBlock({
  budgetEur,
  spentEur,
  vangnetEur,
  saveAction,
}: {
  budgetEur: number | null;
  spentEur: number;
  // Uitsplitsing: het deel van de teller dat het AI-vangnet (B4/stap 8) verbruikte.
  vangnetEur?: number;
  saveAction: (formData: FormData) => void | Promise<void>;
}) {
  const hasBudget = budgetEur != null && budgetEur > 0;
  const pct = hasBudget ? Math.min(100, (spentEur / budgetEur) * 100) : 0;
  const over = hasBudget && spentEur > budgetEur;

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
              {hasBudget && (
                <span className="text-muted-foreground">
                  {" "}
                  / {formatEur(budgetEur)}
                </span>
              )}
            </span>
          </div>
          {hasBudget ? (
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
                      ? "h-full rounded-full bg-amber-500/70"
                      : "h-full rounded-full bg-foreground/70"
                  }
                  style={{ width: `${pct}%` }}
                />
              </div>
              {over && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Monthly cap exceeded — check the spend.
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              No monthly cap set.
            </p>
          )}
          {vangnetEur != null && (
            <p className="mt-2 text-xs text-muted-foreground">
              Of which AI fallback:{" "}
              <span className="tabular-nums">{formatEur(vangnetEur)}</span>
            </p>
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
            step="1"
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
