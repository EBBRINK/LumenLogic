// Downloadknop voor het merk-Excel-template (stap 6). Gewone <a> naar de GET-route —
// de route logt het event (regel 5) en zet Content-Disposition: attachment.
// Bestandsnaam als literal (niet uit lib/excel-template) zodat exceljs nooit in de
// client-/testbundel van dit component belandt; de route bepaalt de echte naam.
import { FileSpreadsheet } from "lucide-react";

const TEMPLATE_FILENAME = "merkdata-template-brinklicht.xlsx";

export function TemplateDownloadLink() {
  return (
    <a
      href="/data/merkrelaties/template"
      download={TEMPLATE_FILENAME}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground ring-1 ring-foreground/10 hover:bg-secondary/80"
    >
      <FileSpreadsheet className="size-4" aria-hidden />
      Excel-template downloaden
    </a>
  );
}
