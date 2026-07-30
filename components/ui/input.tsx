import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Kit §7: 44px hoog, 12x14px padding, grijs vlak dat bij focus wit wordt,
        // radius 6px (via --radius-lg). De dark:bg-input/30-hacks vervallen:
        // bg-muted levert in dark automatisch #2A3145, exact kit §14 "Input Bg".
        // Focus-ring is rgba(45,90,140,.1) volgens de kit, niet de /50-halo.
        // Tekstmaat blijft text-base op mobiel — 16px voorkomt de iOS-focuszoom;
        // de kit zegt 15px en dat verschil staat als open vraag V10 in
        // docs/plan-2.0b-huisstijl-implementatie.md.
        "h-11 w-full min-w-0 rounded-lg border border-input bg-muted px-3.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/10 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
