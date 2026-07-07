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
    { label: "Overwogen", value: data.considered },
    { label: "Gekozen", value: data.chosen },
    { label: "Keuzeratio", value: rate == null ? "—" : `${rate}%` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Geaggregeerde tellingen voor{" "}
          <span className="font-medium text-foreground">{brandName}</span>. Individuele
          projecten of gebruikers zijn hierin niet zichtbaar.
        </p>
        <form action={refreshAction}>
          <Button type="submit" variant="secondary" size="sm">
            Cijfers verversen
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
        Cijfers zijn een momentopname en worden periodiek ververst.
      </p>
    </div>
  );
}
