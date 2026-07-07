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
      href: "/merk/data",
      title: "Data inzien",
      description:
        "Bekijk de producten en specificaties die van jouw merk zijn opgenomen.",
    },
    {
      href: "/merk/prijslijsten",
      title: "Prijslijst aanleveren",
      description:
        "Upload een nieuwe prijslijst. Elke aanlevering gaat eerst naar controle.",
    },
    {
      href: "/merk/dashboard",
      title: "Dashboard",
      description:
        "Geaggregeerd: hoe vaak jouw producten zijn overwogen en gekozen.",
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
        Portaal voor <span className="font-medium text-foreground">{brandName}</span>.
        Aangeleverde data en prijzen worden altijd eerst gecontroleerd voordat ze live gaan.
      </p>
    </div>
  );
}
