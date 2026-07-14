// Fase-/lifecycle-filter voor de dossierlijst (§3.2-3): Alle · Tender · Gegund ·
// Opgeleverd · Archief. Presentational — links met ?filter=…, de actieve draagt
// aria-current. "Alle" (default) toont de lopende dossiers en verbergt gearchiveerde;
// die staan bewust onder "Archief" (een verloren tender blijft data, nooit weggegooid).
import { cn } from "@/lib/utils";

export type DossierFilter =
  | "alle"
  | "tender"
  | "gegund"
  | "opgeleverd"
  | "archief";

const FILTERS: { value: DossierFilter; label: string }[] = [
  { value: "alle", label: "Alle" },
  { value: "tender", label: "Tender" },
  { value: "gegund", label: "Gegund" },
  { value: "opgeleverd", label: "Opgeleverd" },
  { value: "archief", label: "Archief" },
];

export function LifecycleFilter({
  active = "alle",
  basePath = "/projecten",
}: {
  active?: DossierFilter;
  basePath?: string;
}) {
  return (
    <nav
      className="flex flex-wrap gap-1 border-b"
      aria-label="Filter op fase en lifecycle"
    >
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
