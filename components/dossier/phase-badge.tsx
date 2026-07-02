import { Badge } from "@/components/ui/badge";
import { IconLock, IconUnlock } from "./icons";
import type { Phase } from "./types";

// Fase is zichtbaar én betekenisvol: tender = veilig/gesloten, gegund = suggesties open.
export function PhaseBadge({ phase }: { phase: Phase }) {
  if (phase === "tender") {
    return (
      <Badge variant="secondary" className="gap-1">
        <IconLock className="size-3" /> Tender
      </Badge>
    );
  }
  return (
    <Badge className="gap-1">
      <IconUnlock className="size-3" /> Gegund
    </Badge>
  );
}
