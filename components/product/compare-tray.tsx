"use client";
// Vergelijk-tray (functioneel ontwerp §3.16). Max 4 producten NAAST elkaar, uitsluitend
// objectieve velden — NOOIT prijs. Puur client: de selectie leeft in localStorage, zodat je
// producten op verschillende schermen (detail, catalogus) kunt bijzetten en de tray overal
// live meebeweegt. Geen server, geen db.
//
// Ijzeren regels die hier hard leven:
//   • Geld nooit in de vergelijking. Elk item wordt bij het toevoegen prijs-geschrobd, en de
//     tray filtert defensief alsnog elk veld weg dat naar geld ruikt (PRICE_GUARD). Er is geen
//     pad waarlangs een prijs deze component binnenkomt.
//   • Niets stilzwijgend weglaten: mist een product een veld dat een ander wél heeft, dan
//     staat er een grijze "—" (grijze vlag), niet een lege cel die je zou kunnen mislezen.
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const COMPARE_KEY = "lumenlogic:compare";
export const COMPARE_EVENT = "lumenlogic:compare-change";
export const COMPARE_MAX = 4;

// Eén te vergelijken product: identiteit + objectieve velden (label → waarde). Nooit prijs.
export type CompareItem = {
  id: string;
  name: string;
  brandName?: string | null;
  fields: Record<string, string>;
};

// Defensieve laatste verdediging: elk veld (op label óf waarde) dat naar geld verwijst gaat
// eruit. De aanroeper hoort al prijsvrij te leveren; dit is de fail-safe.
const PRICE_GUARD = /prijs|price|€|euro|bruto|netto|staffel|kost|tarief/i;

function scrubFields(fields: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields ?? {})) {
    if (PRICE_GUARD.test(k)) continue;
    if (typeof v === "string" && PRICE_GUARD.test(v)) continue;
    out[k] = v;
  }
  return out;
}

function scrubItem(item: CompareItem): CompareItem {
  return {
    id: String(item.id),
    name: String(item.name ?? ""),
    brandName: item.brandName ?? null,
    fields: scrubFields(item.fields ?? {}),
  };
}

function readStore(): CompareItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(COMPARE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.slice(0, COMPARE_MAX).map(scrubItem);
  } catch {
    return [];
  }
}

function writeStore(items: CompareItem[]): CompareItem[] {
  const next = items.slice(0, COMPARE_MAX).map(scrubItem);
  if (typeof window === "undefined") return next;
  try {
    window.localStorage.setItem(COMPARE_KEY, JSON.stringify(next));
    // storage-events vuren niet in dezelfde tab → eigen event voor live-sync binnen de tab.
    window.dispatchEvent(new CustomEvent(COMPARE_EVENT));
  } catch {
    // localStorage kan geblokkeerd zijn (privacymodus) — dan geen vergelijking, geen crash.
  }
  return next;
}

export function addToCompare(item: CompareItem): CompareItem[] {
  const cur = readStore();
  if (cur.some((i) => i.id === item.id)) return cur; // dedup
  if (cur.length >= COMPARE_MAX) return cur; // cap op 4, stil negeren
  return writeStore([...cur, item]);
}

export function removeFromCompare(id: string): CompareItem[] {
  return writeStore(readStore().filter((i) => i.id !== id));
}

export function clearCompare(): CompareItem[] {
  return writeStore([]);
}

// Live-gesynchroniseerde selectie voor de client-eiland-componenten.
function useCompare(): CompareItem[] {
  const [items, setItems] = useState<CompareItem[]>([]);
  useEffect(() => {
    const sync = () => setItems(readStore());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(COMPARE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(COMPARE_EVENT, sync);
    };
  }, []);
  return items;
}

// Toggle-knop op de productdetail (client-eiland). Voegt het prijsvrije item toe of haalt het
// er weer af. Uitgeschakeld zodra de cap van 4 bereikt is en dit product er nog niet in zit.
export function AddToCompareButton({
  item,
  className,
}: {
  item: CompareItem;
  className?: string;
}) {
  const items = useCompare();
  const inList = items.some((i) => i.id === item.id);
  const full = items.length >= COMPARE_MAX && !inList;
  return (
    <Button
      type="button"
      variant={inList ? "secondary" : "outline"}
      size="sm"
      className={className}
      disabled={full}
      aria-pressed={inList}
      onClick={() => (inList ? removeFromCompare(item.id) : addToCompare(item))}
    >
      {inList ? "In vergelijking" : full ? "Vergelijking vol (4)" : "Vergelijk toevoegen"}
    </Button>
  );
}

// De tray zelf: verankerd onderaan, verschijnt zodra er ≥1 product in zit. Toont de objectieve
// velden (unie over alle geselecteerde producten) in kolommen naast elkaar. Nooit prijs.
export function CompareTray() {
  const items = useCompare();
  if (items.length === 0) return null;

  // Unie van alle veldlabels, in eerste-gezien-volgorde (stabiel, deterministisch).
  const labels: string[] = [];
  for (const it of items) {
    for (const label of Object.keys(it.fields)) {
      if (!labels.includes(label)) labels.push(label);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto w-full max-w-6xl px-6 py-3">
        <div className="mb-2 flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium">
            Vergelijken{" "}
            <span className="text-muted-foreground tabular-nums">
              ({items.length}/{COMPARE_MAX})
            </span>
          </h2>
          <Button type="button" variant="ghost" size="sm" onClick={() => clearCompare()}>
            Leegmaken
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="w-40 py-2 pr-4 text-left align-bottom font-medium text-muted-foreground">
                  Kenmerk
                </th>
                {items.map((it) => (
                  <th key={it.id} className="min-w-40 py-2 pr-4 text-left align-bottom">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium leading-tight">{it.name}</div>
                        {it.brandName && (
                          <div className="text-xs font-normal text-muted-foreground">
                            {it.brandName}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label={`${it.name} uit vergelijking halen`}
                        onClick={() => removeFromCompare(it.id)}
                        className="shrink-0 rounded px-1 text-muted-foreground hover:text-foreground"
                      >
                        ×
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((label) => (
                <tr key={label} className="border-b border-border/60">
                  <td className="py-1.5 pr-4 text-muted-foreground">{label}</td>
                  {items.map((it) => {
                    const v = it.fields[label];
                    return (
                      <td
                        key={it.id}
                        className={cn(
                          "py-1.5 pr-4 tabular-nums",
                          v == null && "text-muted-foreground",
                        )}
                      >
                        {v ?? "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
