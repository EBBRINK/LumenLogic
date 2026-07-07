// De statusbadge en de kleuren-telling — overal hergebruikt zodat de badge-taal
// identiek is (masterplan §7). Rustige pill met gekleurd bolletje + woord.
import { cn } from "@/lib/utils";
import { STATUS, STATUS_ORDER, type MatchStatus, type StatusCounts } from "./status";

export function StatusBadge({
  status,
  className,
}: {
  status: MatchStatus;
  className?: string;
}) {
  const m = STATUS[status];
  return (
    <span
      title={m.meaning}
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        m.tint,
        className,
      )}
    >
      <span className={cn("size-2 rounded-full", m.dot)} aria-hidden />
      {m.label}
    </span>
  );
}

// Compacte kleuren-telling: "9🟢 2🟡 2🔵 1🔴 1🟣" — het dossier-dashboard in de header
// (E-03). Nul-statussen worden weggelaten om rustig te blijven.
export function StatusTally({
  counts,
  className,
}: {
  counts: StatusCounts;
  className?: string;
}) {
  const shown = STATUS_ORDER.filter((s) => (counts[s] ?? 0) > 0);
  if (shown.length === 0) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        nog geen regels
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {shown.map((s) => (
        <span
          key={s}
          title={STATUS[s].meaning}
          className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground"
        >
          <span className={cn("size-2 rounded-full", STATUS[s].dot)} aria-hidden />
          {counts[s]}
        </span>
      ))}
    </span>
  );
}
