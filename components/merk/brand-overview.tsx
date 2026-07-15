import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Merkportaal-landing (§3.16): de drie deuren die een merk heeft. Data inzien, prijslijst
// aanleveren, en het geaggregeerde dashboard. Bewust geen commerciële knoppen — er is geen
// weg om zichtbaarheid of ranking te kopen (C-15/J-05), die knop bestaat niet.
export function BrandOverview({ brandName }: { brandName: string }) {
  const doors = [
    {
      href: "/brand/data",
      title: "View data",
      description:
        "View the products and specifications recorded for your brand.",
    },
    {
      href: "/brand/price-lists",
      title: "Submit price list",
      description:
        "Upload a new price list. Every submission goes to review first.",
    },
    {
      href: "/brand/dashboard",
      title: "Dashboard",
      description:
        "Aggregated: how often your products were considered and chosen.",
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {doors.map((d) => (
          <a key={d.href} href={d.href} className="group block">
            <Card className="h-full transition-colors group-hover:border-ring">
              <CardHeader>
                <CardTitle>{d.title}</CardTitle>
                <CardDescription>{d.description}</CardDescription>
              </CardHeader>
            </Card>
          </a>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Portal for <span className="font-medium text-foreground">{brandName}</span>.
        Submitted data and prices are always reviewed before they go live.
      </p>
    </div>
  );
}
