// De kop van /brand-management. Puur presentational (RSC-vriendelijk), net zoals de
// opgeheven DataCards dat was: zo is de kop — titel, ingang naar de prijslijsten en de
// template-download — white-box te testen zonder database.
//
// IA-opschoning 12 aug 2026 (demosessie Brink Licht):
//   • "Brand relations" heet "Brand management". De klant: "relations" suggereert een
//     verhouding tussen dingen, en dit scherm beheert merken.
//   • Het prijslijst-overzicht stond onder Data en toonde dezelfde vervaldata die deze
//     tabel per merk al draagt. Eén plek, en die plek is hier.
import { TemplateDownloadLink } from "@/components/data/template-download-link";

export function BrandManagementHeader() {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Brand management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Per brand: relationship status, price-list coverage, visibility and
          data completeness. Open a brand for its Visibility (disclosure)
          settings.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {/* Kale <a>, net als de TemplateDownloadLink ernaast: dit component wordt vanuit
            een RSC-test geïmporteerd, en next/link is daar een client-reference die op de
            server niet aanroepbaar is (de test faalt dan al bij de import). Precedent:
            de opgeheven components/data/data-cards.tsx deed hetzelfde, om dezelfde reden.
            Wat we opgeven is prefetching van één interne link — dat is de prijs. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/brand-management/price-lists"
          className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
        >
          Price lists
          {/* Inline SVG en geen lucide-react: dit is een server-component die vanuit een
              RSC-test wordt gerenderd, en lucide opent daar een client-context (precedent:
              components/data/brand-scorecard.tsx). §9: lijndikte 1,5px. */}
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3.5"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </a>
        <TemplateDownloadLink />
      </div>
    </header>
  );
}
