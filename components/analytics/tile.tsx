import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Besluit 4 (docs/plan-2.1-2.2-analytics.md §3): geen data = "No data yet". Nooit een lege
// kaart, nooit een brekende widget, nooit een tegel die stilzwijgend verdwijnt.
//
// Dat besluit is hier in het TYPE afgedwongen in plaats van in de discipline van de bouwer:
//   1. `emptyText` is verplicht — een tegel zonder lege tekst compileert niet.
//   2. `children` is een render-functie, geen ReactNode. De inhoud van een tegel bestaat dus
//      alleen als functie van een lijst, en die functie wordt UITSLUITEND aangeroepen als er
//      minstens één rij is. Er is geen pad waarlangs een tegel zijn inhoud rendert zonder
//      eerst door de lege tak te zijn gegaan, want de tegel roept de functie zelf aan.
//   3. Het argument is `NonEmpty<T>` — `rows[0]` is binnen de render-functie gegarandeerd
//      aanwezig, dus KPI-tegels hoeven geen defensieve `?.` te schrijven.
//
// Vormgeving: DESIGN.md §6 "Data / KPI" — radius 6px (rounded-lg), padding 16px
// (de --card-spacing-default van components/ui/card.tsx), 1px rand in --border.
// Uitsluitend tokens uit app/globals.css; geen hardgecodeerde Tailwind-kleuren.

/** Minstens één element: de render-functie van een tegel krijgt nooit een lege lijst. */
export type NonEmpty<T> = readonly [T, ...T[]];

export type TileProps<T> = {
  /** Kop van de tegel (Engels, zoals de rest van de UI). */
  title: string;
  /** Eén regel context onder de kop. Optioneel. */
  description?: string;
  /**
   * Besluit 4: verplicht. Wordt gerenderd zodra `data` leeg is. Bewust géén default —
   * de bouwer van een tegel moet de lege tak zien en benoemen.
   */
  emptyText: string;
  /** Kleine, eerlijke voetnoot onder de inhoud (bv. "testperiode, geen funnel"). */
  footnote?: string;
  /** De rijen. Leeg → `emptyText`; niet leeg → `children(rows)`. */
  data: readonly T[];
  children: (rows: NonEmpty<T>) => ReactNode;
  className?: string;
};

export function Tile<T>({
  title,
  description,
  emptyText,
  footnote,
  data,
  children,
  className,
}: TileProps<T>) {
  // De enige plek waar leegte wordt beoordeeld. Een tegel kan hier niet omheen.
  const rows: NonEmpty<T> | null =
    data.length > 0 ? (data as NonEmpty<T>) : null;

  return (
    <Card className={cn("gap-3 rounded-lg ring-border", className)}>
      <CardHeader className="gap-1">
        <CardTitle className="text-sm font-semibold text-foreground">
          {title}
        </CardTitle>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1">
        {rows ? (
          children(rows)
        ) : (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        )}
      </CardContent>
      {footnote ? (
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">{footnote}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}

/** Rijenlijst binnen een tegel; houdt de ritmiek van alle tegels gelijk. */
export function TileList({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-2 text-sm">{children}</ul>;
}

/**
 * Eén rij: label links, getal rechts. `meta` is de tweede regel (merk, oordeel, ratio),
 * `leading` is ruimte voor een statusbolletje.
 */
export function TileRow({
  label,
  meta,
  value,
  leading,
}: {
  label: string;
  meta?: string;
  value: string;
  leading?: ReactNode;
}) {
  return (
    <li className="flex items-start justify-between gap-3">
      <span className="flex min-w-0 items-start gap-2">
        {leading}
        <span className="min-w-0">
          <span className="block truncate text-foreground">{label}</span>
          {meta ? (
            <span className="block truncate text-xs text-muted-foreground">
              {meta}
            </span>
          ) : null}
        </span>
      </span>
      <span className="shrink-0 font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </li>
  );
}

/**
 * Statusbolletje. DESIGN.md §7 (kleur is nooit het enige onderscheid) wordt gedekt door de
 * aanroeper: elk bolletje staat naast zijn eigen zichtbare tekstlabel in de `TileRow`.
 * Daarom is het bolletje zelf puur decoratief en `aria-hidden` — zelfde motivering als
 * `TileBar` hieronder. Met een `role="img"` + `aria-label` erop las een screenreader het
 * label twee keer voor ("Green, Green, 45%"). Er is bewust géén `label`-prop meer, zodat
 * niemand het bolletje per ongeluk als enige drager van de betekenis kan gebruiken.
 */
export function TileDot({ toneClassName }: { toneClassName: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-1.5 size-2 shrink-0 rounded-full",
        // Fallback-toon staat vóór de meegegeven toon; twMerge laat de laatste winnen.
        "bg-muted-foreground",
        toneClassName,
      )}
    />
  );
}

/** KPI-blok: getal groot, label klein (DESIGN.md §6 "Data / KPI"). */
export function TileStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Verhoudingsbalkje. Puur ondersteunend: het getal staat er altijd in tekst naast, dus het
 * balkje is aria-hidden. Breedte via inline style (een percentage, geen kleur).
 */
export function TileBar({
  ratio,
  toneClassName,
}: {
  ratio: number;
  toneClassName?: string;
}) {
  const safe = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  return (
    <div
      aria-hidden="true"
      className="h-1.5 w-full overflow-hidden rounded-sm bg-muted"
    >
      <div
        className={cn("h-full bg-chart-1", toneClassName)}
        style={{ width: `${safe * 100}%` }}
      />
    </div>
  );
}

/** Eén getalnotatie voor de hele pagina; expliciete locale zodat server en test gelijk zijn. */
export function formatCount(n: number): string {
  return Number.isFinite(n) ? new Intl.NumberFormat("en-US").format(n) : "0";
}

/** Aandeel als heel percentage; deelt nooit door nul. */
export function formatPercent(part: number, total: number): string {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) {
    return "0%";
  }
  return `${Math.round((part / total) * 100)}%`;
}

/**
 * Alleen het woord, voor plekken waar het getal er al los naast staat (het label onder een
 * `TileStat`, de `meta` van een `TileRow`). Eén plek voor enkelvoud/meervoud, zodat er nergens
 * meer "1 searches" kan ontstaan.
 */
export function pluralWord(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Getal + woord: "1 search" / "5 searches". */
export function plural(n: number, one: string, many: string): string {
  return `${formatCount(n)} ${pluralWord(n, one, many)}`;
}
