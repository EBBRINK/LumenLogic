import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Kit §7: Inter 600, 15px, radius 6px (komt uit --radius-lg), en active-feedback
  // als schaal 0.98 in plaats van de verticale verschuiving. Kit §11: focus-ring
  // 2px in de ringkleur met offset — de ring/50-halo wordt ring/10 zoals de kit
  // voorschrijft. De compacte maten (xs, sm, icon-*) zetten hun eigen tekstmaat
  // en blijven bewust onder 44px, zie DESIGN.md O9.
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-[15px] font-semibold whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/10 active:not-aria-[haspopup]:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Kit §7: navy vlak, wit label, eigen hover- en active-kleur plus de
        // schaduw die de kit daar voorschrijft (geen opacity-truc).
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover hover:shadow-[0_2px_8px_rgba(26,31,58,0.2)] active:bg-primary-active",
        // Kit §7 secundaire knop: transparant met 2px blauwe rand. Dit is de
        // plek waar die landt — niet in variant="secondary", want dat zijn 21
        // bestaande plekken die een neutraal vlak horen te blijven (plan §3.1).
        outline:
          "border-2 border-brand-blue bg-transparent text-brand-blue hover:bg-brand-blue/5 aria-expanded:bg-brand-blue/5",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        // Kit §7 tertiaire knop: geen rand, blauw label, onderstreping bij hover.
        ghost:
          "text-sm font-medium text-brand-blue hover:bg-brand-blue/10 hover:underline aria-expanded:bg-brand-blue/10",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // Kit §7: 44px hoog, 16px horizontaal. Alleen default en lg gaan mee —
        // xs, sm en icon-* blijven compact (besluit O9, 56 plekken in tabellen
        // en toolbars).
        default:
          "h-11 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
