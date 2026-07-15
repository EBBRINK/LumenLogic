import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Geaggregeerd merk-dashboard (K-05): hoe vaak zijn de producten van dit merk overwogen en
// hoe vaak gekozen. Dit zijn geaggregeerde tellingen uit de materialized view — de
// anonimiseringsgrens. Nooit welk project, welke calculator of welke concurrent: alleen
// het totaal. Er is GEEN knop die zichtbaarheid of ranking koopt (C-15/J-05).
export type BrandDashboardData = {
  considered: number;
  chosen: number;
};

export function BrandDashboard({
  brandName,
  data,
  refreshAction,
}: {
  brandName: string;
  data: BrandDashboardData;
  refreshAction: (formData: FormData) => void | Promise<void>;
}) {
  const rate =
    data.considered > 0
      ? Math.round((data.chosen / data.considered) * 100)
      : null;

  const tiles = [
    { label: "Considered", value: data.considered },
    { label: "Chosen", value: data.chosen },
    { label: "Choice rate", value: rate == null ? "—" : `${rate}%` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Aggregated counts for{" "}
          <span className="font-medium text-foreground">{brandName}</span>. Individual
          projects or users are not visible here.
        </p>
        <form action={refreshAction}>
          <Button type="submit" variant="secondary" size="sm">
            Refresh figures
          </Button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums tracking-tight">
                {t.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Figures are a snapshot and are refreshed periodically.
      </p>
    </div>
  );
}
