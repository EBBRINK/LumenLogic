// Mini-scorecard (stap 4): 10 blokjes, één per bucket, gekleurd op een gradient naar
// de dekkingsgraad (Timo-besluit 1: donkergroen = 100% must, GEEN harde 90%-knip).
// Grijs = bucket zonder meetbare velden of merk zonder producten ("n.v.t.").
import { cn } from "@/lib/utils";

export type BucketBlok = {
  key: string;
  labelNl: string;
  // Ratio (0..1) waarop het blokje kleurt: must-ratio als de bucket must-velden
  // heeft, anders de wanna-/nice-ratio. null = niet meetbaar (grijs).
  ratio: number | null;
  mustComplete: boolean; // alle must-velden 100% → donkergroen
};

// Gradientkleur: donkergroen bij must 100%, daaronder een verloop rood→groen.
export function blokKleur(blok: BucketBlok): string | undefined {
  if (blok.ratio === null) return undefined; // grijs via klasse
  if (blok.mustComplete && blok.ratio >= 1) return "hsl(142 72% 26%)"; // donkergroen
  const hue = Math.round(blok.ratio * 110); // 0 = rood, 110 = groen
  return `hsl(${hue} 65% 45%)`;
}

export function MiniScorecard({ blokken }: { blokken: BucketBlok[] | null }) {
  if (!blokken) {
    return (
      <span
        className="text-xs text-muted-foreground"
        title="Geen producten in de catalogus — compleetheid n.v.t."
      >
        n.v.t.
      </span>
    );
  }
  return (
    <div className="flex items-center gap-0.5">
      {blokken.map((b) => (
        <span
          key={b.key}
          title={
            b.ratio === null
              ? `${b.labelNl}: nog niet meetbaar`
              : `${b.labelNl}: ${Math.round(b.ratio * 100)}%${b.mustComplete && b.ratio >= 1 ? " (alle must-velden compleet)" : ""}`
          }
          className={cn(
            "inline-block size-3 rounded-[3px]",
            b.ratio === null && "bg-muted",
          )}
          style={{ backgroundColor: blokKleur(b) }}
        />
      ))}
    </div>
  );
}
