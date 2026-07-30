// Statuslabel voor een verrijkingsrun (steekproef | gepubliceerd | afgewezen). Eigen,
// rustige tinten — dit zijn géén match-statussen, dus bewust niet de STATUS-kleuren.
import { cn } from "@/lib/utils";

export type RunStatus = "steekproef" | "gepubliceerd" | "afgewezen";

const RUN_TINT: Record<RunStatus, string> = {
  steekproef: "bg-status-amber-tint text-status-amber-ink",
  gepubliceerd: "bg-status-green-tint text-status-green-ink",
  afgewezen: "bg-status-grey-tint text-status-grey-ink",
};

const RUN_LABEL: Record<RunStatus, string> = {
  steekproef: "Sample",
  gepubliceerd: "Published",
  afgewezen: "Rejected",
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
