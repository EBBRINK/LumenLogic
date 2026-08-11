// Het gevraagde leveranciersartikelnummer op de regel-detailpagina, met de melding als
// wij dat nummer niet kennen.
//
// Waarom dit een eigen component is en niet een paar regels JSX in page.tsx: de pagina
// geeft server actions door aan client-componenten en is daardoor in het RSC-testharnas
// niet als geheel te renderen (de acties verliezen onder vi.mock hun "use server"-
// markering). Dit blokje is puur — props in, opmaak uit — en dus wél te toetsen én te
// fotograferen, licht/donker × mobiel/desktop.
//
// De melding is bewust géén foutkleur: de kandidaten eronder blijven gewoon bruikbaar
// (besluit Timo, docs/goal-artikelnummer-matching.md B5). Hij zegt alleen wat hij zegt —
// wij kennen dit nummer niet, dus wat je hieronder ziet is niet hét gevraagde artikel.
export function RequestedArticleCode({
  code,
  known,
}: {
  /** Het nummer zoals de klant het opschreef, spaties incluis. Leeg → niets tonen. */
  code: string | null;
  /** Staat dit nummer in de zichtbare catalogus? (lib/repo/products.articleCodeExists) */
  known: boolean;
}) {
  if (!code) return null;
  return (
    <p className="mt-2 text-sm">
      <span className="text-muted-foreground">Article number </span>
      <span className="font-mono tabular-nums">{code}</span>
      {known ? null : (
        <span className="ml-2 inline-block rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          not in our catalogue — candidates below are text matches
        </span>
      )}
    </p>
  );
}
