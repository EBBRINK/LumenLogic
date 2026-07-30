// Printbaar substitutievoorstel-document (F-06/07): origineel (voorgeschreven) vs
// voorgesteld alternatief, veld-voor-veld, met duurzaamheidswinst en een bronvoetnoot.
// Puur presentational + server-safe (geen client-hooks) zodat het met fixtures te
// screenshotten is. De prijs staat NIET in de tabel — het prijsverschil komt als losse
// kostentekst (F-08), en die zegt expliciet dat prijs niet meeweegt in de rangschikking.

// Zelfstandige vormtypes (bewust losgekoppeld van de repo, net als de andere componenten).
export type SubstitutionDocField = {
  field: string;
  reference: string | null;
  alternative: string | null;
  source: string;
};

export type SubstitutionDocParty = {
  name: string | null;
  brandName: string | null;
  articleCode?: string | null;
};

export type SubstitutionDocProps = {
  dossierName: string;
  reference: SubstitutionDocParty;
  alternative: SubstitutionDocParty;
  fields: SubstitutionDocField[];
  savingNote: string | null;
  createdAt?: string | null;
};

// Welke velden als duurzaamheid gelden (daar geldt "hoger = beter"); de rest is technisch,
// waar een verschil neutraal "afwijkend" is (gelijkwaardigheid, geen beter/slechter).
const SUSTAINABILITY = new Set([
  "Warranty",
  "Repairability",
  "Lifetime (EPD)",
  "Origin",
]);

type Tone = "good" | "bad" | "muted";

function leadingNumber(s: string | null): number | null {
  if (s == null) return null;
  const m = String(s).match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(",", ".")) : null;
}

function verdict(
  kind: "technical" | "sustainability",
  ref: string | null,
  alt: string | null,
): { label: string; tone: Tone } {
  if (ref == null || alt == null) return { label: "no data", tone: "muted" };
  const rn = leadingNumber(ref);
  const an = leadingNumber(alt);
  if (rn != null && an != null) {
    if (an === rn) return { label: "equal", tone: "muted" };
    if (kind === "sustainability")
      return an > rn
        ? { label: "better", tone: "good" }
        : { label: "worse", tone: "bad" };
    return { label: "different", tone: "muted" };
  }
  if (ref === alt) return { label: "equal", tone: "muted" };
  return { label: "different", tone: "muted" };
}

function toneClass(tone: Tone): string {
  if (tone === "good") return "text-status-green-ink";
  if (tone === "bad") return "text-destructive";
  return "text-muted-foreground";
}

function Party({
  label,
  party,
  accent,
}: {
  label: string;
  party: SubstitutionDocParty;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg border p-4 " +
        (accent ? "border-status-green-dot/40 bg-status-green-tint/40 dark:bg-status-green-tint/20" : "")
      }
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {party.brandName ?? "—"}
      </p>
      <p className="font-medium">{party.name ?? "—"}</p>
      {party.articleCode ? (
        <p className="text-xs tabular-nums text-muted-foreground">
          {party.articleCode}
        </p>
      ) : null}
    </div>
  );
}

function Rows({
  rows,
  kind,
}: {
  rows: SubstitutionDocField[];
  kind: "technical" | "sustainability";
}) {
  return (
    <>
      {rows.map((f) => {
        const v = verdict(kind, f.reference, f.alternative);
        return (
          <tr key={f.field} className="border-b last:border-0">
            <td className="py-1.5 pr-3 text-muted-foreground">{f.field}</td>
            <td className="py-1.5 pr-3 tabular-nums">{f.reference ?? "—"}</td>
            <td className="py-1.5 pr-3 tabular-nums">{f.alternative ?? "—"}</td>
            <td className={"py-1.5 text-xs " + toneClass(v.tone)}>{v.label}</td>
          </tr>
        );
      })}
    </>
  );
}

export function SubstitutionDoc({
  dossierName,
  reference,
  alternative,
  fields,
  savingNote,
  createdAt,
}: SubstitutionDocProps) {
  const technical = fields.filter((f) => !SUSTAINABILITY.has(f.field));
  const sustainability = fields.filter((f) => SUSTAINABILITY.has(f.field));

  return (
    <article className="mx-auto max-w-3xl">
      <header className="mb-6 border-b pb-4">
        <p className="text-sm text-muted-foreground">Substitution proposal</p>
        <h1 className="text-2xl font-semibold tracking-tight">{dossierName}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Objective comparison of the specified luminaire with an equivalent
          alternative — field by field, with the sustainability gain. Justification
          for the end customer; money does not count in the choice.
        </p>
        {createdAt ? (
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            Drawn up on {createdAt}
          </p>
        ) : null}
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Party label="Original (specified)" party={reference} />
        <Party label="Proposed alternative" party={alternative} accent />
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-1 pr-3 font-medium">Field</th>
            <th className="py-1 pr-3 font-medium">Original</th>
            <th className="py-1 pr-3 font-medium">Alternative</th>
            <th className="py-1 font-medium">Verdict</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td
              colSpan={4}
              className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Technical
            </td>
          </tr>
          {technical.length ? (
            <Rows rows={technical} kind="technical" />
          ) : (
            <tr>
              <td colSpan={4} className="py-1.5 text-muted-foreground">
                No technical fields.
              </td>
            </tr>
          )}
          <tr>
            <td
              colSpan={4}
              className="pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Sustainability
            </td>
          </tr>
          {sustainability.length ? (
            <Rows rows={sustainability} kind="sustainability" />
          ) : (
            <tr>
              <td colSpan={4} className="py-1.5 text-muted-foreground">
                No sustainability fields.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {savingNote ? (
        <div className="mt-6 rounded-lg border border-dashed p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cost indication
          </p>
          <p className="mt-1 text-sm">{savingNote}</p>
        </div>
      ) : null}

      <p className="mt-6 text-xs text-muted-foreground">
        Source of all technical and sustainability figures: manufacturer's data
        (brand-provided), not independently verified. Missing data is shown as
        “no data” — never silently omitted. Price is informational and does not
        count in the ranking.
      </p>
    </article>
  );
}
