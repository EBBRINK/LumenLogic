import type { TestPeriod } from "@/lib/repo/analytics-tiles";

import { plural } from "./tile";

// De eerlijke band bovenaan /analytics (besluit Timo 30 jul, plan §3):
//
//   Test period 2–21 Jul 2026 · 1,428 events · 23 actors · our own test data, not user behaviour
//
// Deze band mag nooit crashen op ontbrekende data: `from` en `to` zijn nullable en kunnen
// bovendien een onparseerbare string bevatten. Ontbreekt een datum, dan valt alléén dat
// stukje weg — de rest van de zin blijft staan. Ontbreken ze allebei, dan begint de band
// bij de tellingen. Uitsluitend tokens uit app/globals.css.

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const FULL = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** null bij ontbrekende of onparseerbare invoer — de band vult dan gewoon niets in. */
function parse(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * "2–21 Jul 2026" binnen één maand · "28 Jun – 21 Jul 2026" binnen één jaar ·
 * "28 Dec 2025 – 21 Jul 2026" daarbuiten. Eén datum → "from …" / "until …".
 */
export function formatTestPeriod(
  from: string | null,
  to: string | null,
): string | null {
  const a = parse(from);
  const b = parse(to);
  if (a && b) {
    if (a.getTime() > b.getTime()) return formatTestPeriod(to, from);
    const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
    const sameMonth = sameYear && a.getUTCMonth() === b.getUTCMonth();
    if (sameMonth) return `${DAY.format(a)}–${FULL.format(b)}`;
    if (sameYear) return `${DAY_MONTH.format(a)} – ${FULL.format(b)}`;
    return `${FULL.format(a)} – ${FULL.format(b)}`;
  }
  if (a) return `from ${FULL.format(a)}`;
  if (b) return `until ${FULL.format(b)}`;
  return null;
}

// `plural()` stond hier lokaal; hij is verhuisd naar ./tile zodat de tegels dezelfde
// enkelvoud/meervoud-regel gebruiken als deze band (bevinding 4). Gedrag ongewijzigd.

export function TestPeriodBand({ period }: { period: TestPeriod }) {
  const range = formatTestPeriod(period.from, period.to);
  const facts = [
    range ? `Test period ${range}` : null,
    plural(period.totalEvents, "event", "events"),
    plural(period.actors, "actor", "actors"),
  ]
    .filter((s): s is string => s !== null)
    .join(" · ");

  return (
    <div className="rounded-lg border border-border bg-muted px-4 py-3">
      <p className="text-sm text-foreground">
        {facts}
        <span className="text-muted-foreground">
          {" · our own test data, not user behaviour"}
        </span>
      </p>
    </div>
  );
}
