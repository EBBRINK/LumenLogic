// Eén bron van waarheid voor de status- en XIS-fase-taal in de UI (B6, stap 4).
// Zelfde badge-filosofie als status.ts (matchkleuren): rustige tinten, geen alarmen —
// "niet gegund" is data, geen fout. De labels hier zijn ook de dropdown-opties.
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProjectStatus, XisPhase } from "./types";

export type ProjectStatusMeta = {
  label: string;
  tint: string; // subtiele pill-achtergrond + tekst (licht + donker)
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
    tint: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    meaning: "Work in progress — nothing has gone out yet.",
  },
  estimate_gestuurd: {
    label: "Estimate sent",
    tint: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    meaning: "The estimate has been sent; header and quantities are locked.",
  },
  offerte: {
    label: "Quote",
    tint: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
    meaning: "Quote in progress (outside the tool, in XIS).",
  },
  gegund: {
    label: "Won",
    tint: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    meaning: "Won — alternative suggestions may be enabled (phase: awarded).",
  },
  niet_gegund: {
    label: "Lost",
    tint: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    meaning: "Lost — stays editable; a lost tender is data.",
  },
  archief: {
    label: "Archived",
    tint: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
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
    <Badge variant="secondary" className={cn(m.tint, className)} title={m.meaning}>
      {m.label}
    </Badge>
  );
}
