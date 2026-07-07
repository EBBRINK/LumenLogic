// Statuslabel voor een verrijkingsrun (steekproef | gepubliceerd | afgewezen). Eigen,
// rustige tinten — dit zijn géén match-statussen, dus bewust niet de STATUS-kleuren.
import { cn } from "@/lib/utils";

export type RunStatus = "steekproef" | "gepubliceerd" | "afgewezen";

const RUN_TINT: Record<RunStatus, string> = {
  steekproef:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  gepubliceerd:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  afgewezen: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const RUN_LABEL: Record<RunStatus, string> = {
  steekproef: "Steekproef",
  gepubliceerd: "Gepubliceerd",
  afgewezen: "Afgewezen",
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit items-center rounded-full px-2 text-xs font-medium",
        RUN_TINT[status],
      )}
    >
      {RUN_LABEL[status]}
    </span>
  );
}
