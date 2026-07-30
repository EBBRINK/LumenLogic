"use client";

// shadcn `InputOTP`, bijgesteld op de huisstijl (docs/DESIGN.md §6 "Invoer"): grijs vlak dat
// bij focus wit wordt, rand 1px `--input`, focus 2px `--ring` + ring van 10%, fout via
// `aria-invalid`. De cel is 44px hoog zoals elk invoerveld in dit project — de kit schrijft
// die minimumhoogte voor en een OTP-cel is geen uitzondering.
import * as React from "react";
import { OTPInput, OTPInputContext } from "input-otp";

import { cn } from "@/lib/utils";

function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string;
}) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn(
        "flex w-full items-center gap-1 has-disabled:opacity-50 sm:gap-2",
        containerClassName,
      )}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  );
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn("flex flex-1 items-center gap-1 sm:gap-1.5", className)}
      {...props}
    />
  );
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & { index: number }) {
  const context = React.useContext(OTPInputContext);
  const { char, hasFakeCaret, isActive } = context?.slots[index] ?? {};

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        // Beweging: 150ms ease-out (kit §8). Geen schaalsprong — alleen rand en vlak.
        //
        // Breedte is elastisch, geen vaste w-10. Acht vakjes van 40px plus tussenruimte
        // meten ~388px en passen dus niet op een telefoon van 375px: het achtste vakje viel
        // stil weg achter de overflow van de kaart. `flex-1` met een ondergrens van 28px en
        // een bovengrens van 40px laat de rij meekrimpen tot hij past en houdt hem op
        // desktop op de maat uit de kit. Hoogte blijft 44px (kit §6, minimum voor elk
        // invoerveld) — er wordt dus niets aan de raakvlakhoogte opgeofferd.
        "relative flex h-11 w-full max-w-10 min-w-7 flex-1 items-center justify-center rounded-lg border border-input bg-muted text-base font-medium tabular-nums transition-colors outline-none",
        "data-[active=true]:z-10 data-[active=true]:border-ring data-[active=true]:bg-background data-[active=true]:ring-3 data-[active=true]:ring-ring/10",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[active=true]:aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      )}
    </div>
  );
}

// Scheidingsteken tussen twee groepen. Een streepje in lijnwerk van 1px (kit §9:
// "lijnwerk 1-2px, minimaal en technisch"), niet een icoon uit een set.
function InputOTPSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-separator"
      role="separator"
      aria-hidden="true"
      className={cn("px-1 text-muted-foreground", className)}
      {...props}
    >
      <div className="h-px w-2 bg-current" />
    </div>
  );
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator };
