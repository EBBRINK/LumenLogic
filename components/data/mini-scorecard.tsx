// Mini-scorecard (stap 4): 10 blokjes, één per bucket, gekleurd op een gradient naar
// de dekkingsgraad (Timo-besluit 1: donkergroen = 100% must, GEEN harde 90%-knip).
// Grijs = bucket zonder meetbare velden of merk zonder producten ("n.v.t.").
//
// ⚠️ `MiniScorecard` heeft sinds 30 jul (UX-audit bak 2 item 10) geen aanroeper meer: de
// merkrelatie-rij toont nu één percentage met een link naar de echte scorecard, omdat tien
// blokjes van 12px zonder legenda niet te lezen waren. Bewust NIET verwijderd — dat is een
// besluit over wat het overzicht mag tonen, niet een opruimactie van deze herbouw.
// `blokKleur` is wél nog in gebruik (de kleurregel van het detailscherm) en getest.
import { niveauLabel } from "@/lib/niveau-labels";
import { cn } from "@/lib/utils";

export type BucketBlok = {
  key: string;
  labelEn: string;
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
        title="No products in the catalog — completeness n/a"
      >
        n/a
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
              ? `${b.labelEn}: not measurable yet`
              : // UX-audit 30 jul (item 4): "must" is de opgeslagen enum, niet het woord
                // dat een merk hoort te lezen. Eén map, ook hier.
                `${b.labelEn}: ${Math.round(b.ratio * 100)}%${b.mustComplete && b.ratio >= 1 ? ` (all ${niveauLabel("must")} fields complete)` : ""}`
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
