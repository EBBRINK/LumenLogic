import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/session";

// Placeholder-tegels voor 2.0b. De echte querylaag (getAnalytics/AnalyticsView) blijft
// byte-stabiel staan als fundament van 2.1 — deze pagina roept hem bewust niet aan.
type Tile = { title: string; href?: string };

const TILES: Tile[] = [
  { title: "Most searched" },
  { title: "Becoming the expert" },
  { title: "Fixtures → XIS" },
  { title: "Projects created" },
  { title: "XIS-recognised projects" },
  { title: "Loading signal", href: "/data/loading" },
  { title: "To be determined" },
  { title: "To be determined" },
  { title: "To be determined" },
  { title: "To be determined" },
  { title: "To be determined" },
];

export default async function AnalyticsPage() {
  await requireSession();
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          The platform is at heart an observation machine. This page is a
          placeholder for the Phase 2 revenue model: anonymized brand insights
          on what is searched, matched and considered.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {TILES.map((tile, i) => {
          const card = (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  {tile.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Coming soon.</p>
              </CardContent>
            </Card>
          );
          return tile.href ? (
            <Link
              key={`${tile.title}-${i}`}
              href={tile.href}
              className="rounded-xl transition-colors hover:ring-1 hover:ring-foreground/25"
            >
              {card}
            </Link>
          ) : (
            <div key={`${tile.title}-${i}`}>{card}</div>
          );
        })}
      </div>
    </main>
  );
}
