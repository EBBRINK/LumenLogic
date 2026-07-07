// Tier-2-dekkingsmeter (H-09): welk deel van de catalogus heeft ≥1 gevuld matchveld?
// Rustige tint, geen alarm — een laag percentage is een kans (meer verrijken), geen fout.
import { cn } from "@/lib/utils";

export type CoverageMeterProps = {
  total: number;
  covered: number;
  ratio: number; // 0..1
  label?: string;
};

export function CoverageMeter({
  total,
  covered,
  ratio,
  label = "Tier-2-dekking",
}: CoverageMeterProps) {
  const pct = Math.round(ratio * 100);
  return (
    <div className="rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold tabular-nums tracking-tight">
          {pct}%
        </span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct >= 66
              ? "bg-emerald-500"
              : pct >= 33
                ? "bg-sky-500"
                : "bg-slate-400",
          )}
          style={{ width: `${Math.max(pct, total === 0 ? 0 : 2)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">
        {covered} van {total} producten met minstens één technisch veld gevuld.
      </p>
    </div>
  );
}
