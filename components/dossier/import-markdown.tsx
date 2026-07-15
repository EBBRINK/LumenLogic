// B2: het markdown-controlespoor van een PDF-import — inklapbaar op de importrun-pagina,
// met downloadknop (route serveert dezelfde tekst als .md-bijlage). Server component.
import { Button } from "@/components/ui/button";
import { IconDownload } from "./icons";

export function ImportMarkdown({
  markdown,
  downloadHref,
  defaultOpen = false,
}: {
  markdown: string;
  downloadHref: string;
  // Alleen voor tests/screenshots: standaard ingeklapt (details/summary).
  defaultOpen?: boolean;
}) {
  return (
    <details className="mt-8 rounded-lg border" open={defaultOpen}>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
        Source text (markdown)
      </summary>
      <div className="border-t px-4 py-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            The full text layer of the PDF, per page — the audit trail of this
            import.
          </p>
          <Button asChild variant="secondary" size="sm">
            <a href={downloadHref} download>
              <IconDownload aria-hidden /> Download .md
            </a>
          </Button>
        </div>
        <pre className="max-h-96 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">
          {markdown}
        </pre>
      </div>
    </details>
  );
}
