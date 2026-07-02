import { Card, CardContent } from "@/components/ui/card";
import { PhaseBadge } from "./phase-badge";
import type { DossierSummary } from "./types";

export function DossierList({ dossiers }: { dossiers: DossierSummary[] }) {
  if (dossiers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nog geen dossiers. Maak er hiernaast één aan.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {dossiers.map((d) => (
        <li key={d.id}>
          <a href={`/dossiers/${d.id}`} className="block">
            <Card className="py-3 transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center justify-between gap-3 px-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.name}</p>
                  {d.customer && (
                    <p className="truncate text-sm text-muted-foreground">
                      {d.customer}
                    </p>
                  )}
                </div>
                <PhaseBadge phase={d.phase} />
              </CardContent>
            </Card>
          </a>
        </li>
      ))}
    </ul>
  );
}
