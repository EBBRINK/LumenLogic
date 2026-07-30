// Statusfilter voor de projectlijst (B6, stap 4) — vervangt het lifecycle-filter.
// Presentational — links met ?filter=…, de actieve draagt aria-current. "Alle" (default)
// toont alles behálve archief; gearchiveerde projecten staan bewust onder "Archief"
// (een verloren tender blijft data, nooit weggegooid).
//
// ── Vormgeving: echte knoppen i.p.v. tekst-met-onderstreep ────────────────────
// Blijven links (href + aria-current), maar dragen de knopgeometrie via `Button
// asChild` — geen losse classnames voor radius, hoogte, focus of active-schaal.
//
// Maat `sm` (28px), niet de 44px van `default`. O9 beperkt die eis tot
// `default`/`lg`/formuliervelden; strikt gelezen grandfathert dat besluit de 56
// bestaande compacte plekken en zegt het niets over nieuwe. Deze rij rekent zich er
// bewust bij: zeven opties naast elkaar is een dense control. Gevolg dat erbij hoort:
// het aanraakdoel krimpt van 38px naar 28px (gemeten, niet geschat). Beide halen WCAG
// 2.5.8 (24px), geen van beide de 44px van 2.5.5 — er verschuift dus geen criterium,
// maar kleiner is het wel.
//
// Breedte, ook gemeten: de rij gaat van 469px naar 444px (~5%), doordat px-2.5 +
// text-[0.8rem] smaller is dan px-3 + text-sm. Let op: de oude rij had al
// `flex-wrap` en liep dus nooit horizontaal over. De ~333px-overloop uit HANDOVER.md
// is de SITE-navbalk (`nav-link.tsx`, `flex` zonder wrap) — een ander component, en
// deze wijziging raakt of repareert die niet.
//
// Actief = `variant="default"`: navy met wit label in light, en in dark het
// wit-met-navy uit O10 — navy gevuld zou daar op canvas #0F1626 1,12:1 zijn en de chip
// laten verdwijnen. Daarom --primary en niet de --nav-* tokens zelf. Het teal-accent
// van de navbalk (O12) komt terug als stip op de actieve chip (5,5:1 op navy); gevuld
// teal is NIET gebruikt, want wit-op-teal is 2,95:1 en in O12 expliciet afgewezen.
// `outline`/`ghost` konden niet: die staan op --brand-blue = 2,54:1 op het dark canvas.
//
// Kleur is niet de enige drager (kit §11) — actief/inactief verschilt op vier assen:
// vulling (14,4:1 light / 12,9:1 dark tússen de twee vlakken, dus ook in grijswaarde),
// gewicht (semibold vs. medium), rand (inactief heeft `border-input`, actief niet) en
// de stip (aan/uit = vorm). Labels zelf: 16,1:1 actief, 14,4:1 / 12,9:1 inactief.
// De stip in dark staat op wit = 2,95:1 — decoratief, vierde drager naast drie
// sterkere, zelfde aanvaarde afwijking als de tabstreep in O12.
//
// Focus loopt via --ring (blauw in light, teal in dark, O10) — de rij zit op het
// paginacanvas, niet op de navy balk. Nagemeten op de drie assen van WCAG 1.4.11/2.4.11:
// op het chipvlak 6,3:1 / 4,4:1, op het canvas 7,1:1 / 6,1:1, tegen de ónbefocuste rand
// 4,9:1 / 3,4:1. De oude rij had geen eigen focus-stijl en kreeg de browser-outline; nu
// is het de dunnere rand-plus-halo uit button.tsx. Bewust niet lokaal opgeplust — één
// rij die van de focus-taal van élke knop afwijkt is erger. Zie HANDOVER.md.
//
// `--input` haalt zelf 1,46:1 op wit; dat geldt voor élke Input en Card en is een
// eigenschap van de tokenlaag, geen keuze van deze rij — de chip wordt ook niet dóór
// die rand geïdentificeerd. Niet gedicht met een donkerder rand: die levert de kit
// niet (DESIGN.md §12).
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PROJECT_STATUS_META, PROJECT_STATUS_ORDER } from "./project-status-badge";
import type { ProjectStatus } from "./types";

export type ProjectStatusFilter = "alle" | ProjectStatus;

const FILTERS: { value: ProjectStatusFilter; label: string }[] = [
  { value: "alle", label: "All" },
  ...PROJECT_STATUS_ORDER.map((s) => ({
    value: s as ProjectStatusFilter,
    label: PROJECT_STATUS_META[s].label,
  })),
];

export function StatusFilter({
  active = "alle",
  basePath = "/projects",
}: {
  active?: ProjectStatusFilter;
  basePath?: string;
}) {
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Filter by status">
      {FILTERS.map((f) => {
        const isActive = f.value === active;
        const href =
          f.value === "alle" ? basePath : `${basePath}?filter=${f.value}`;
        return (
          <Button
            key={f.value}
            asChild
            size="sm"
            variant={isActive ? "default" : "secondary"}
            className={cn(!isActive && "border-input font-medium")}
          >
            <a href={href} aria-current={isActive ? "page" : undefined}>
              {isActive && (
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-brand-teal"
                />
              )}
              {f.label}
            </a>
          </Button>
        );
      })}
    </nav>
  );
}
