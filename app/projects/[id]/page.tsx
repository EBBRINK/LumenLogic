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
  importArmaturenboekPagesAction,
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
          {pdf === "no-text-layer" ? (
            <>
              This PDF has no text layer (probably exported as an image) — there
              was nothing to import. Use a text PDF or the CSV block.
            </>
          ) : (
            <>
              <span className="font-medium">{pdf}</span> spec lines imported from
              the PDF and matched.
            </>
          )}
          {run && (
            <>
              {" "}
              <Link
                href={`/projects/${dossier.id}/import/${run}`}
                className="font-medium underline underline-offset-2 hover:text-foreground"
              >
                View the import run (source text)
              </Link>
            </>
          )}
        </div>
      )}

      {/* Stap 5: PDF-upload als eerste blok — de hoofdingang van een project. */}
      <PdfUploadCard
        dossierId={dossier.id}
        importAction={importArmaturenboekPagesAction}
      />

      <section className="mb-8">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-medium">Lines ({lines.length})</h2>
          <p className="text-xs text-muted-foreground">
            Order = request order. No sort buttons.
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
          <CardTitle>Add lines</CardTitle>
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
            <p className="text-sm font-medium">Specification / count sheet (quantities)</p>
            <p className="mb-2 text-xs text-muted-foreground">
              Paste &quot;code quantity&quot; per line — quantities are linked on
              the fixture code. Unknown codes are skipped.
            </p>
            <textarea
              name="bestek"
              rows={3}
              placeholder={"Lp301 24\nLr303 12"}
              className="w-full rounded-lg border border-input bg-background p-2.5 font-mono text-sm"
            />
            <div className="mt-2">
              <Button type="submit" variant="secondary" size="sm">
                Link quantities
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
