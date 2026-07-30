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
  ocrEur,
  saveAction,
}: {
  budgetEur: number | null;
  spentEur: number;
  // Uitsplitsing: het deel van de teller dat het AI-vangnet (B4/stap 8) verbruikte.
  vangnetEur?: number;
  // Uitsplitsing: het deel dat OCR van beeld-PDF's verbruikte (plan-ocr B4; het
  // €1-per-boek-plafond leeft daarnaast, per importrun).
  ocrEur?: number;
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
          {vangnetEur != null && (
            <p className="mt-2 text-xs text-muted-foreground">
              Of which AI fallback:{" "}
              <span className="tabular-nums">{formatEur(vangnetEur)}</span>
            </p>
          )}
          {ocrEur != null && (
            <p className="mt-1 text-xs text-muted-foreground">
              Of which OCR (image PDFs):{" "}
              <span className="tabular-nums">{formatEur(ocrEur)}</span>
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
