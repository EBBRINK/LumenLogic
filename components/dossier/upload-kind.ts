// Pure helpers voor de upload-kaart (goal-import-meer-formaten, Bouwer B).
// Bewust een eigen module zonder "use client": de kaart gebruikt ze client-side,
// maar ze zijn puur en dus ook direct (server-side) unit-testbaar — een export
// uit het "use client"-kaartbestand komt door de RSC-testbrug alleen als
// client-referentie aan en is daar niet aanroepbaar.

// ── Typeherkenning (Bouwer B punt 1) ─────────────────────────────────────────
// Extensie eerst, mime secundair; onbekend → eerlijke fout in de kaart. De
// server hertoetst zelf op magic bytes (lib/bytes/magic.ts, Bouwer A) — dit is
// routering, geen poort.
export type UploadKind = "pdf" | "image" | "xlsx" | "csv" | "docx" | "unknown";

export function detectUploadKind(filename: string, mime: string): UploadKind {
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  switch (ext) {
    case "pdf":
      return "pdf";
    case "jpg":
    case "jpeg":
    case "png":
      return "image";
    case "xlsx":
      return "xlsx";
    case "csv":
      return "csv";
    case "docx":
      return "docx";
  }
  // Geen (bruikbare) extensie → mime als tweede stem.
  switch (mime) {
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
    case "image/png":
      return "image";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "xlsx";
    case "text/csv":
      return "csv";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx";
  }
  return "unknown";
}

// CSV-delimiter-sniffing voor het >15 MB-fallbackpad: dezelfde drie kandidaten
// als de serverparser (';', ',', tab); de vaakst voorkomende in de eerste
// regels wint. Alleen voor de client-gelezen rijen — de server snifft zelf.
export function splitCsvRows(text: string): string[][] {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const kandidaten = [";", ",", "\t"] as const;
  const proef = lines.slice(0, 10);
  let delimiter: string = ";";
  let beste = -1;
  for (const d of kandidaten) {
    const telling = proef.reduce((n, l) => n + l.split(d).length - 1, 0);
    if (telling > beste) {
      beste = telling;
      delimiter = d;
    }
  }
  return lines.map((l) => l.split(delimiter).map((c) => c.trim()));
}
