import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEur } from "@/lib/format";
import type { Candidate, Phase } from "./types";

export function MatchCandidates({
  dossierId,
  specLine,
  candidates,
  phase,
  suggestions = [],
  matchAction,
  noMatchAction,
}: {
  dossierId: string;
  specLine: {
    id: string;
    fixtureCode: string;
    brandText: string | null;
    productText: string | null;
  };
  candidates: Candidate[];
  phase: Phase;
  suggestions?: Candidate[];
  matchAction: (formData: FormData) => void | Promise<void>;
  noMatchAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-4">
      {candidates.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="font-medium">Geen match in catalogus</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Geen enkel zichtbaar product komt overeen met{" "}
            <span className="font-medium">{specLine.brandText}</span>{" "}
            {specLine.productText}. Dat is een eerlijke status, geen fout.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {candidates.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {c.brandName}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {c.matchKind === "exact" ? "exact" : "fuzzy"}
                  </Badge>
                </div>
                <p className="truncate font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.articleCode ?? c.supplierArticleCode ?? "—"}
                  {c.kelvin ? ` · ${c.kelvin}K` : ""}
                  {c.cri ? ` · CRI ${c.cri}` : ""}
                  {c.ipValue ? ` · ${c.ipValue}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="tabular-nums font-medium">
                  {formatEur(c.grossPrice)}
                </span>
                <form action={matchAction}>
                  <input type="hidden" name="dossierId" value={dossierId} />
                  <input type="hidden" name="specLineId" value={specLine.id} />
                  <input type="hidden" name="productId" value={c.id} />
                  <Button type="submit" size="sm">
                    <Check /> Kies
                  </Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={noMatchAction}>
        <input type="hidden" name="dossierId" value={dossierId} />
        <input type="hidden" name="specLineId" value={specLine.id} />
        <Button type="submit" variant="ghost" size="sm">
          Markeer als “geen match”
        </Button>
      </form>

      {/* Ijzeren regel 4: alternatieven-suggesties bestaan UITSLUITEND in de gegund-stand.
          In tender wordt hier niets getoond — de poort zit in getAlternativeSuggestions. */}
      {phase === "awarded" && suggestions.length > 0 && (
        <section
          data-testid="suggestions"
          className="rounded-lg border border-primary/30 bg-primary/5 p-4"
        >
          <p className="font-medium">Duurzame alternatieven (gegund)</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {suggestions.map((s) => (
              <li key={s.id}>
                {s.brandName} {s.name}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
