// Kaarten-hub van de data-werkbank. Puur presentational (RSC-vriendelijk) zodat de
// badge-logica (aantal per ingang) white-box getest kan worden zonder database.

export type DataCard = { href: string; title: string; desc: string };

export const DATA_CARDS: DataCard[] = [
  {
    href: "/data/enrichment",
    title: "Enrichment",
    desc: "Parser over brand names, review the sample and publish.",
  },
  {
    href: "/data/price-lists",
    title: "Price lists",
    desc: "Expiring-soon and expired lists (coverage gaps).",
  },
  {
    href: "/data/evaluation",
    title: "Evaluation",
    desc: "Measure the matcher's hit-rate against the evaluation set.",
  },
  {
    href: "/data/fields",
    title: "Fields",
    desc: "What we ask brands for — and the fields you add yourself.",
  },
  {
    href: "/data/event-log",
    title: "Event log",
    desc: "Counts by type, plus the chronological log of every logged event.",
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
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-status-blue-tint px-1.5 text-xs font-medium text-status-blue-ink tabular-nums">
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
