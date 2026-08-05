"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyTheme, isDarkNow, storeTheme } from "@/lib/theme";

// De schakelaar naar dark mode, in de hoofdbalk. Zie lib/theme.ts voor het waarom
// (DESIGN.md O3/G24: dark mode is verplicht, maar was onbereikbaar) en voor het
// besluit dat de standaard LICHT is — hier wordt `prefers-color-scheme` dus ook
// niet gelezen.
//
// Vorm en kleuren:
// - Een échte <button type="button"> met aria-pressed: een toggle-knop meldt daarmee
//   zijn stand ("Dark mode, toggle button, pressed"). Geen div-met-onclick, geen
//   losse switch-rol die de knop van zijn label zou scheiden.
// - Eigen knop in plaats van components/ui/button.tsx: die haalt zijn focus-ring uit
//   --ring, en dat is in light blauw #2D5A8C — 2,3:1 op de navy balk. Binnen de balk
//   is de ring teal, in BEIDE standen (DESIGN.md O10/O12, zelfde redenering als
//   NavLink hiernaast). Vandaar de --nav-*-tokens; er komt geen token bij en er
//   verandert geen tokenwaarde.
// - 32px (size-8) en dus onder de 44px uit kit §7. Dat is de vastgelegde uitzondering
//   voor compacte, icoon-only bedieningen (DESIGN.md O9: 44px geldt voor `default`,
//   `lg` en formuliervelden). 44px zou de balk 16px hoger maken; 32px is exact de
//   maat van Button size="icon".
// - Geen thema-transitie op de kleuren van de pagina: DESIGN.md §8 eist dat
//   prefers-reduced-motion gerespecteerd wordt, en een meting eerder wees uit dat de
//   app dat nergens doet. Een cross-fade over de hele app zou dat gat groter maken.
//   De omslag is dus hard. De transition-colors hieronder is alleen de hover van de
//   knop zelf, identiek aan NavLink ernaast.

// De stand is géén React-state: de waarheid staat op <html>, gezet door het init-script
// in app/layout.tsx nog vóór React bestaat. useSyncExternalStore leest die bron in plaats
// van hem te dupliceren — een useState + useEffect zou een tweede kopie maken die na
// hydratie moet worden bijgetrokken.
function subscribe(onStoreChange: () => void) {
  // De klasse zelf is de enige bron. Ook het init-script en toggle() schrijven hem;
  // met een observer loopt de knop nooit uit de pas met wat er op het scherm staat.
  // Er is bewust GEEN matchMedia-luisteraar: de systeemvoorkeur speelt geen rol.
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

// De server kent de themavoorkeur niet — hij staat in localStorage van de browser.
// `false` (licht) is dus de eerlijke server-snapshot, en meteen de juiste: zonder
// opgeslagen keuze ís de app licht. React trekt hem na hydratie bij als er wél een
// keuze staat. Zichtbaar wordt dat niet: het icoon hangt aan CSS, niet aan deze waarde.
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDarkNow, getServerSnapshot);

  function toggle() {
    const next = !dark;
    storeTheme(next ? "dark" : "light"); // vanaf nu een expliciete keuze
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      // Icoon-only knop: het label moet uit aria-label komen, anders heet de knop niets.
      // title geeft er meteen de goedkoopste affordance bij.
      aria-label="Dark mode"
      title="Dark mode"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-sm text-nav-muted transition-colors hover:text-nav-foreground",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nav-accent",
      )}
    >
      {/* Beide iconen staan in de DOM en worden door CSS gewisseld. Zou dit aan `dark`
          hangen, dan zag een gebruiker die dark koos het icoon ná hydratie omklappen —
          precies de flits die de inline-init voorkomt. §9: lijndikte 1,5px. */}
      <Moon aria-hidden className="size-4 dark:hidden" strokeWidth={1.5} />
      <Sun aria-hidden className="hidden size-4 dark:block" strokeWidth={1.5} />
    </button>
  );
}
