// Stap 5 (plan-aanvraag-estimate): de PDF-upload is de hoofdingang van een project en
// staat als éérste blok boven de regeltabel. De overige invoerwegen (losse regel, CSV,
// bestek) blijven in het blok eronder. Server component — de action doet het werk.
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconUpload } from "./icons";

export function PdfUploadCard({
  dossierId,
  importAction,
}: {
  dossierId: string;
  importAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconUpload aria-hidden /> Armaturenboek uploaden (PDF)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Upload het armaturenboek — regels worden automatisch gematcht. Alleen
          PDF&apos;s met tekstlaag; de brontekst blijft als controlespoor bij de
          import bewaard.
        </p>
        <form
          action={importAction}
          className="flex flex-wrap items-center gap-3"
        >
          <input type="hidden" name="dossierId" value={dossierId} />
          <input
            type="file"
            name="pdf"
            accept="application/pdf"
            required
            aria-label="Armaturenboek-PDF kiezen"
            className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-2.5 file:py-1 file:text-sm"
          />
          <Button type="submit">Importeer PDF</Button>
        </form>
      </CardContent>
    </Card>
  );
}
