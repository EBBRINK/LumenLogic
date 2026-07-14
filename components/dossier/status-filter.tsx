// Statusfilter voor de projectlijst (B6, stap 4) — vervangt het lifecycle-filter.
// Presentational — links met ?filter=…, de actieve draagt aria-current. "Alle" (default)
// toont alles behálve archief; gearchiveerde projecten staan bewust onder "Archief"
// (een verloren tender blijft data, nooit weggegooid).
import { cn } from "@/lib/utils";
import { PROJECT_STATUS_META, PROJECT_STATUS_ORDER } from "./project-status-badge";
import type { ProjectStatus } from "./types";

export type ProjectStatusFilter = "alle" | ProjectStatus;

const FILTERS: { value: ProjectStatusFilter; label: string }[] = [
  { value: "alle", label: "Alle" },
  ...PROJECT_STATUS_ORDER.map((s) => ({
    value: s as ProjectStatusFilter,
    label: PROJECT_STATUS_META[s].label,
  })),
];

export function StatusFilter({
  active = "alle",
  basePath = "/projecten",
}: {
  active?: ProjectStatusFilter;
  basePath?: string;
}) {
  return (
    <nav className="flex flex-wrap gap-1 border-b" aria-label="Filter op status">
      {FILTERS.map((f) => {
        const isActive = f.value === active;
        const href =
          f.value === "alle" ? basePath : `${basePath}?filter=${f.value}`;
        return (
          <a
            key={f.value}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex items-center border-b-2 px-3 py-2 text-sm transition-colors",
              isActive
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </a>
        );
      })}
    </nav>
  );
}
