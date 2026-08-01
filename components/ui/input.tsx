import * as React from "react"

import { cn } from "@/lib/utils"
import { veldClass } from "@/components/ui/field"

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
        //
        // Die tokens staan sinds reviewzwerm 2.5a (B9) in components/ui/field.ts,
        // want `<select>` en `<textarea>` hebben ze net zo hard nodig en hadden ze
        // op 26 plekken handgeschreven — en te laag. Hier blijft alleen wat eigen
        // is aan het component: volle breedte en de file-input-knop.
        veldClass,
        "w-full min-w-0 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Input }
