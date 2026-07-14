import { Card, CardContent } from "@/components/ui/card";
import { PhaseBadge } from "./phase-badge";
import { ProjectStatusBadge } from "./project-status-badge";
import { StatusTally } from "./status-badge";
import type { DossierSummary } from "./types";

export function DossierList({ dossiers }: { dossiers: DossierSummary[] }) {
  if (dossiers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nog geen projecten. Maak er hiernaast één aan.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {dossiers.map((d) => (
        <li key={d.id}>
          <a href={`/projecten/${d.id}`} className="block">
            <Card className="py-3 transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center justify-between gap-3 px-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.name}</p>
                  {d.customer && (
                    <p className="truncate text-sm text-muted-foreground">
                      {d.customer}
                    </p>
                  )}
                  {/* Kleuren-telling per dossier (E-03) — alleen als de counts zijn meegestuurd. */}
                  {d.counts && <StatusTally counts={d.counts} className="mt-1.5" />}
                </div>
                {/* Status (commercieel) + afgeleide veiligheidsstand (fase, regel 4). */}
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <ProjectStatusBadge status={d.status} />
                  <PhaseBadge phase={d.phase} />
                </div>
              </CardContent>
            </Card>
          </a>
        </li>
      ))}
    </ul>
  );
}
