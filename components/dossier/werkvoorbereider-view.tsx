import { EquivalenceTable } from "./equivalence-table";
import { PhaseBadge } from "./phase-badge";
import type { WerkvoorbereiderLine } from "./types";

// Post-gunning value-engineering (de tweede van de drie rollen). Per gematchte spec-regel
// toont de engine gelijkwaardige alternatieven, gerangschikt op objectieve velden +
// duurzaamheid — met onderbouwing die de eindklant kan overtuigen. Alleen in gegund-stand.
export function WerkvoorbereiderView({
  dossierName,
  lines,
}: {
  dossierName: string;
  lines: WerkvoorbereiderLine[];
}) {
  return (
    <div>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Werkvoorbereiding</p>
          <h1 className="text-2xl font-semibold tracking-tight">{dossierName}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Value-engineering ná gunning: gelijkwaardige alternatieven, gerangschikt
            op objectieve merk-cijfers en duurzaamheid. Geld weegt nooit mee — de
            engine is scheidsrechter, geen rechter.
          </p>
        </div>
        <PhaseBadge phase="awarded" />
      </header>

      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nog geen gematchte regels om te optimaliseren.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {lines.map((line) => (
            <section key={line.specLineId}>
              <div className="mb-3 border-b pb-2">
                <h2 className="font-medium">
                  {line.fixtureCode} · {line.quantity}×{" "}
                  <span className="text-muted-foreground">
                    {line.referenceBrand} {line.referenceName}
                  </span>
                </h2>
              </div>
              {line.alternatives.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Geen gelijkwaardige alternatieven in de catalogus.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {line.alternatives.map((alt) => (
                    <EquivalenceTable key={alt.id} alt={alt} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
