"use client";

import { Button } from "@/components/ui/button";

// Klein client-eilandje: het armaturenboek is een overdrachtsdocument dat je uitprint
// of als PDF bewaart. De rest van het scherm blijft server-rendered.
// Dit component staat op twee schermen (armaturenboek én substitutiedocument); het label
// was Nederlands op een verder Engelse UI (UX-audit 30 jul, bug #9).
export function PrintButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => window.print()}
    >
      Print
    </Button>
  );
}
