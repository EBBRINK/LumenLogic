"use client";

import { Button } from "@/components/ui/button";

// Klein client-eilandje: het armaturenboek is een overdrachtsdocument dat je uitprint
// of als PDF bewaart. De rest van het scherm blijft server-rendered.
export function PrintButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => window.print()}
    >
      Printen
    </Button>
  );
}
