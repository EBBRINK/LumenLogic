import { Lock, Unlock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Phase } from "./types";

// Fase is zichtbaar én betekenisvol: tender = veilig/gesloten, gegund = suggesties open.
export function PhaseBadge({ phase }: { phase: Phase }) {
  if (phase === "tender") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Lock className="size-3" /> Tender
      </Badge>
    );
  }
  return (
    <Badge className="gap-1">
      <Unlock className="size-3" /> Gegund
    </Badge>
  );
}
