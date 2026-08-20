// Eén bron van waarheid voor de status- en XIS-fase-taal in de UI (B6, stap 4).
// Zelfde badge-filosofie als status.ts (matchkleuren): rustige tinten, geen alarmen —
// "niet gegund" is data, geen fout. De labels hier zijn ook de dropdown-opties.
import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/ui/hint";
import { cn } from "@/lib/utils";
import type { ProjectStatus, XisPhase } from "./types";

export type ProjectStatusMeta = {
  label: string;
  tint: string; // subtiele pill-achtergrond + tekst; dark loopt via de tokens
  meaning: string;
};

export const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  "concept",
  "estimate_gestuurd",
  "offerte",
  "gegund",
  "niet_gegund",
  "archief",
];

export const PROJECT_STATUS_META: Record<ProjectStatus, ProjectStatusMeta> = {
  concept: {
    label: "Concept",
    tint: "bg-status-grey-tint text-status-grey-ink",
    meaning: "Work in progress — nothing has gone out yet.",
  },
  estimate_gestuurd: {
    label: "Estimate sent",
    tint: "bg-status-blue-tint text-status-blue-ink",
    meaning: "The estimate has been sent; header and quantities are locked.",
  },
  offerte: {
    label: "Quote",
    tint: "bg-status-purple-tint text-status-purple-ink",
    meaning: "Quote in progress (outside the tool, in XIS).",
  },
  gegund: {
    label: "Won",
    tint: "bg-status-green-tint text-status-green-ink",
    meaning: "Won — alternative suggestions may be enabled (phase: awarded).",
  },
  niet_gegund: {
    label: "Lost",
    tint: "bg-status-amber-tint text-status-amber-ink",
    meaning: "Lost — stays editable; a lost tender is data.",
  },
  archief: {
    label: "Archived",
    tint: "bg-status-grey-tint text-status-grey-ink",
    meaning: "Archived with a reason — read-only.",
  },
};

// De tien XIS-fasen — de taal van Brink zelf, met nette NL-labels.
export const XIS_PHASE_ORDER: XisPhase[] = [
  "start",
  "engineering",
  "calculations",
  "presenting",
  "tender",
  "deal_making",
  "deliver",
  "aftersales",
  "win",
  "lost",
];

export const XIS_PHASE_LABELS: Record<XisPhase, string> = {
  start: "Start",
  engineering: "Engineering",
  calculations: "Calculations",
  presenting: "Presenting",
  tender: "Tender",
  deal_making: "Deal making",
  deliver: "Deliver",
  aftersales: "Aftersales",
  win: "Win",
  lost: "Lost",
};

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  const m = PROJECT_STATUS_META[status];
  return (
    // align="end": deze badge staat rechts in de projectkaart, en die kaart knipt af.
    <Hint text={m.meaning} align="end">
      <Badge variant="secondary" className={cn(m.tint, className)}>
        {m.label}
      </Badge>
    </Hint>
  );
}
