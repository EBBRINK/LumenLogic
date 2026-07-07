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
  "Garantie",
  "Repareerbaarheid",
  "Levensduur (EPD)",
  "Herkomst",
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
  if (ref == null || alt == null) return { label: "geen data", tone: "muted" };
  const rn = leadingNumber(ref);
  const an = leadingNumber(alt);
  if (rn != null && an != null) {
    if (an === rn) return { label: "gelijk", tone: "muted" };
    if (kind === "sustainability")
      return an > rn
        ? { label: "beter", tone: "good" }
        : { label: "minder", tone: "bad" };
    return { label: "afwijkend", tone: "muted" };
  }
  if (ref === alt) return { label: "gelijk", tone: "muted" };
  return { label: "afwijkend", tone: "muted" };
}

function toneClass(tone: Tone): string {
  if (tone === "good") return "text-emerald-600 dark:text-emerald-400";
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
        (accent ? "border-emerald-600/40 bg-emerald-50/40 dark:bg-emerald-950/20" : "")
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
        <p className="text-sm text-muted-foreground">Substitutievoorstel</p>
        <h1 className="text-2xl font-semibold tracking-tight">{dossierName}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Objectieve vergelijking van het voorgeschreven armatuur met een
          gelijkwaardig alternatief — veld voor veld, met de duurzaamheidswinst.
          Onderbouwing voor de eindklant; geld weegt niet mee in de keuze.
        </p>
        {createdAt ? (
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            Opgesteld op {createdAt}
          </p>
        ) : null}
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Party label="Origineel (voorgeschreven)" party={reference} />
        <Party label="Voorgesteld alternatief" party={alternative} accent />
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-1 pr-3 font-medium">Veld</th>
            <th className="py-1 pr-3 font-medium">Origineel</th>
            <th className="py-1 pr-3 font-medium">Alternatief</th>
            <th className="py-1 font-medium">Oordeel</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td
              colSpan={4}
              className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Technisch
            </td>
          </tr>
          {technical.length ? (
            <Rows rows={technical} kind="technical" />
          ) : (
            <tr>
              <td colSpan={4} className="py-1.5 text-muted-foreground">
                Geen technische velden.
              </td>
            </tr>
          )}
          <tr>
            <td
              colSpan={4}
              className="pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Duurzaamheid
            </td>
          </tr>
          {sustainability.length ? (
            <Rows rows={sustainability} kind="sustainability" />
          ) : (
            <tr>
              <td colSpan={4} className="py-1.5 text-muted-foreground">
                Geen duurzaamheidsvelden.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {savingNote ? (
        <div className="mt-6 rounded-lg border border-dashed p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Kostenindicatie
          </p>
          <p className="mt-1 text-sm">{savingNote}</p>
        </div>
      ) : null}

      <p className="mt-6 text-xs text-muted-foreground">
        Bron van alle technische en duurzaamheidscijfers: opgave van de fabrikant
        (merk-opgave), niet onafhankelijk geverifieerd. Ontbrekende data staat als
        “geen data” — nooit stilzwijgend weggelaten. Prijs is informatief en weegt
        niet mee in de rangschikking.
      </p>
    </article>
  );
}
