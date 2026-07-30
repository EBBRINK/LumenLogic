import { Button } from "@/components/ui/button";

// 404 in app-stijl. Zonder dit bestand valt Next terug op zijn eigen kale
// "404 | This page could not be found." — buiten de navbalk en buiten de huisstijl
// (UX-audit 30 jul, bug #1). De vorm is die van de bestaande lege staten in de app
// (precedent: app/projects/[id]/work-prep/page.tsx): gestippelde kaart, kop plus
// uitleg, en één weg terug. Alleen bestaande tokens — geen nieuwe kleuren.
//
// Bewust een kale <a> en géén next/link, in tegenstelling tot de rest van de app:
// de RSC-testharnas kan een SERVER-component die next/link importeert niet inladen
// (de react-server-build van Link klapt met "client reference export is called on
// server", gemeten 30 jul in vitest-plugin-rsc 0.2.3). Met een <a> is dit scherm
// wél te testen, en dat is hier de betere ruil: een 404 is een doodlopende tak, en
// een harde navigatie terug naar /projects levert gegarandeerd een schone shell.
// Zodra de harnas het aankan mag dit een <Link> worden. app/error.tsx is een
// CLIENT-component en heeft dat probleem niet; die gebruikt next/link wél.
export default function NotFound() {
  return (
    // BEWUSTE UITZONDERING op de 1280px-paginacontainer (DESIGN.md §5) — zelfde
    // redenering als app/error.tsx: gecentreerde doodlopende staat, geen linkerrand
    // die moet uitlijnen. De twee horen als één paar te lezen, dus ze houden dezelfde
    // breedte. Zie de allowlist in components/container-breedte.test.ts.
    <main className="mx-auto flex w-full max-w-3xl flex-1 items-center px-6 py-16">
      <div className="w-full rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground tabular-nums">404</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          This page does not exist
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          The address may be mistyped or out of date — or the project, product or
          run it points to has been removed since the link was made.
        </p>
        <div className="mt-6">
          <Button asChild>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- zie de
                toelichting bovenaan: bewuste keuze, geen vergeten <Link>. */}
            <a href="/projects">Back to projects</a>
          </Button>
        </div>
      </div>
    </main>
  );
}
