// Kaarten-hub van de data-werkbank. Puur presentational (RSC-vriendelijk) zodat de
// badge-logica (aantal per ingang) white-box getest kan worden zonder database.

export type DataCard = { href: string; title: string; desc: string };

export const DATA_CARDS: DataCard[] = [
  {
    href: "/data/enrichment",
    title: "Verrijking",
    desc: "Parser over merknamen, steekproef controleren en publiceren.",
  },
  {
    href: "/data/loading",
    title: "Inladen",
    desc: "Blauw-wachtrij: gevraagde merken die nog niet in de catalogus staan.",
  },
  {
    href: "/data/price-lists",
    title: "Prijslijsten",
    desc: "Verloopt-binnenkort en verlopen lijsten (dekkingsgaten).",
  },
  {
    href: "/data/evaluation",
    title: "Evaluatie",
    desc: "Hit-rate van de matcher meten tegen de evaluatieset.",
  },
  {
    href: "/data/brand-relations",
    title: "Merkrelaties",
    desc: "Relatiestatus en datacompleetheid per merk; data-inwinning.",
  },
];

export function DataCards({ badge }: { badge: Record<string, number> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {DATA_CARDS.map((c) => (
        <a
          key={c.href}
          href={c.href}
          className="group rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10 transition-colors hover:ring-foreground/25"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-medium">{c.title}</h2>
            {badge[c.href] > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-100 px-1.5 text-xs font-medium text-sky-800 tabular-nums dark:bg-sky-950 dark:text-sky-300">
                {badge[c.href]}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
        </a>
      ))}
    </div>
  );
}
