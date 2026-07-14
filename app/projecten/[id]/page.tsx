import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { AddSpecLineForm } from "@/components/dossier/add-spec-line-form";
import { PdfUploadCard } from "@/components/dossier/pdf-upload-card";
import { SpecLineTable } from "@/components/dossier/spec-line-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDossier, getSpecLines } from "@/lib/repo/dossiers";
import type { SpecLineRow } from "@/components/dossier/types";
import { requireSession } from "@/lib/session";
import {
  addSpecCsvAction,
  addSpecLineAction,
  deleteLineAction,
  importArmaturenboekPdfAction,
  linkBestekAction,
} from "../actions";

// Tab REGELS — de header en tabs komen uit layout.tsx. Deze pagina toont de PDF-upload
// als hoofdingang (stap 5), daarna de spec-regeltabel (aanvraagvolgorde, statuskleur,
// afwijkingen) + het toevoeg-paneel voor de overige invoerwegen.
export default async function RegelsTab({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pdf?: string; run?: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const { pdf, run } = await searchParams;
  const dossier = await getDossier(db, id);
  if (!dossier) notFound();
  const lines = (await getSpecLines(db, id)) as unknown as SpecLineRow[];

  return (
    <>
      {pdf && (
        <div className="mb-6 rounded-lg border bg-muted/40 p-3 text-sm">
          {pdf === "geen-tekstlaag" ? (
            <>
              De PDF bevat geen tekstlaag (waarschijnlijk als beeld geëxporteerd) —
              er viel niets te importeren. Gebruik een tekst-PDF of het CSV-blok.
            </>
          ) : (
            <>
              <span className="font-medium">{pdf}</span> spec-regels uit de PDF
              geïmporteerd en gematcht.
            </>
          )}
          {run && (
            <>
              {" "}
              <Link
                href={`/projecten/${dossier.id}/import/${run}`}
                className="font-medium underline underline-offset-2 hover:text-foreground"
              >
                Bekijk de importrun (brontekst)
              </Link>
            </>
          )}
        </div>
      )}

      {/* Stap 5: PDF-upload als eerste blok — de hoofdingang van een project. */}
      <PdfUploadCard
        dossierId={dossier.id}
        importAction={importArmaturenboekPdfAction}
      />

      <section className="mb-8">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-medium">Regels ({lines.length})</h2>
          <p className="text-xs text-muted-foreground">
            Volgorde = aanvraagvolgorde. Geen sorteerknoppen.
          </p>
        </div>
        <SpecLineTable
          dossierId={dossier.id}
          lines={lines}
          deleteAction={deleteLineAction}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Regels toevoegen</CardTitle>
        </CardHeader>
        <CardContent>
          <AddSpecLineForm
            dossierId={dossier.id}
            addLineAction={addSpecLineAction}
            addCsvAction={addSpecCsvAction}
          />

          <form
            action={linkBestekAction}
            className="mt-6 border-t pt-6"
          >
            <input type="hidden" name="dossierId" value={dossier.id} />
            <p className="text-sm font-medium">Bestek / telstaat (aantallen)</p>
            <p className="mb-2 text-xs text-muted-foreground">
              Plak &quot;code aantal&quot; per regel — de aantallen worden op de
              armatuurcode gekoppeld. Onbekende codes worden overgeslagen.
            </p>
            <textarea
              name="bestek"
              rows={3}
              placeholder={"Lp301 24\nLr303 12"}
              className="w-full rounded-lg border border-input bg-background p-2.5 font-mono text-sm"
            />
            <div className="mt-2">
              <Button type="submit" variant="secondary" size="sm">
                Koppel aantallen
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
