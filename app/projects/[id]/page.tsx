import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { AddSpecLineForm } from "@/components/dossier/add-spec-line-form";
import { MatchstationCard } from "@/components/dossier/matchstation-card";
import { PdfUploadCard } from "@/components/dossier/pdf-upload-card";
import { SpecLineTable } from "@/components/dossier/spec-line-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDossier, getSpecLines } from "@/lib/repo/dossiers";
import { getOpenOcrRun } from "@/lib/repo/ocr";
import { getLatestQueueEntry } from "@/lib/repo/matchstation";
import type { SpecLineRow } from "@/components/dossier/types";
import { requireUuid } from "@/lib/uuid";
import {
  addSpecCsvAction,
  addSpecLineAction,
  deleteLineAction,
  finishOcrAction,
  enqueueForMatchstationAction,
  finishTableImportAction,
  importArmaturenboekPagesAction,
  importTabelRowsAction,
  linkBestekAction,
  ocrPageAction,
  startOcrImportAction,
  startTableImportAction,
  uploadSourceChunkAction,
} from "../actions";
import { bewaakRoute } from "@/lib/route-toegang";
import { toegangScope } from "@/lib/repo/toegang";

// A6-vangnet (reviewzwerm 2.5a): een EXPLICIET functieplafond, zodat het een keuze is
// en geen platformdefault. Route Segment Config werkt op page/layout/route — niet in
// een los "use server"-actions-bestand — en Next' documentatie zegt het uitdrukkelijk:
// `maxDuration` op paginaniveau verandert de timeout van álle server actions die vanaf
// die pagina gebruikt worden. Dit is het segment waar de zwaarste actie hangt:
// `importArmaturenboekPagesAction` (hieronder doorgegeven aan PdfUploadCard) draait de
// AI-leesroute serieel over batches van 8 pagina's.
// 300 s is bewust GEEN verhoging maar een vastlegging: sprint 0.1 stelde via de
// Vercel-API vast dat dit project op Hobby draait met Fluid compute aan en
// `functionDefaultTimeout: 300` (docs/sprint0-1-ai-vangnet-live.md, F11/F12) — 300 is
// daar tegelijk het maximum. Verhogen kan pas op een ander plan.
// Dit maakt het afkappen NIET onmogelijk (een boek van 40 pagina's kan er nog steeds
// overheen): daarvoor draagt de import-run sinds dezelfde reparatie een afgebroken-
// stand, zodat een tweede poging verder leest — zie lib/repo/leesroute.ts.
export const maxDuration = 300;

// Tab REGELS — de header en tabs komen uit layout.tsx. Deze pagina toont de PDF-upload
// als hoofdingang (stap 5), daarna de spec-regeltabel (aanvraagvolgorde, statuskleur,
// afwijkingen) + het toevoeg-paneel voor de overige invoerwegen.
export default async function RegelsTab({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    pdf?: string;
    ocr?: string;
    tabel?: string;
    run?: string;
  }>;
}) {
  const toegang = await bewaakRoute("/projects/[id]");
  const { id } = await params;
  // id gaat als uuid in project_dossiers.id / spec_lines.dossier_id. De dossier-layout
  // heeft dezelfde regel; beide zijn nodig (zie de toelichting daar).
  requireUuid(id);
  const { pdf, ocr, tabel, run } = await searchParams;
  const dossier = await getDossier(db, toegangScope(toegang), id);
  if (!dossier) notFound();
  const lines = (await getSpecLines(db, id)) as unknown as SpecLineRow[];
  // B5: een OCR-run die 'bezig' bleef (tab dichtgeklapt) → de upload-kaart toont
  // een hervat-knop. Bytes-vrije query (B2) — dit draait op elke paginaweergave.
  const pendingOcr = await getOpenOcrRun(db, id);
  // Sprint M1: het matchstation-blok is intern-only (Brink's eigen werkvoorraad, geen
  // klanthandeling) — dus ook de query alleen voor intern, geen zinloze lookup voor
  // elke externe paginaweergave.
  const matchstationQueueEntry =
    toegang.soort === "intern" ? await getLatestQueueEntry(db, id) : null;

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

      {ocr && (
        <div className="mb-6 rounded-lg border bg-muted/40 p-3 text-sm">
          <span className="font-medium">{ocr}</span> spec lines read with OCR
          and matched — every reading needs a review.
          {run && (
            <>
              {" "}
              <Link
                href={`/projects/${dossier.id}/import/${run}`}
                className="font-medium underline underline-offset-2 hover:text-foreground"
              >
                View the OCR run (transcript)
              </Link>
            </>
          )}
        </div>
      )}

      {tabel && (
        <div className="mb-6 rounded-lg border bg-muted/40 p-3 text-sm">
          <span className="font-medium">{tabel}</span> spec lines imported from
          the table and matched — every imported line gets a review.
          {run && (
            <>
              {" "}
              <Link
                href={`/projects/${dossier.id}/import/${run}`}
                className="font-medium underline underline-offset-2 hover:text-foreground"
              >
                View the import run (source)
              </Link>
            </>
          )}
        </div>
      )}

      {/* Stap 5: PDF-upload als eerste blok — de hoofdingang van een project. */}
      {/*
        key: na een geslaagde import redirect de action naar DEZELFDE route met
        andere query-parameters. Zonder key blijft de kaart gemount en houdt hij
        zijn clientstate — dat is precies hoe de "Import failed"-melding naast de
        succesbanner bleef staan (docs/probleem-liegende-import-melding.md). Een
        key uit de searchParams remount hem schoon zodra de import geland is.

        ⚠️ Deze key mag UITSLUITEND van searchParams afhangen. revalidatePath()
        vuurt bij élke OCR-tegel, dus deze pagina rendert tijdens een lopende run
        voortdurend opnieuw. Een key die van dáta afhangt (regelaantal,
        pendingOcr, updatedAt) remount de kaart middenin de OCR-lus en doodt een
        betaalde run.
      */}
      <PdfUploadCard
        key={run ?? "idle"}
        dossierId={dossier.id}
        importAction={importArmaturenboekPagesAction}
        startOcrAction={startOcrImportAction}
        ocrPageAction={ocrPageAction}
        finishOcrAction={finishOcrAction}
        startTableImportAction={startTableImportAction}
        uploadSourceChunkAction={uploadSourceChunkAction}
        finishTableImportAction={finishTableImportAction}
        importTabelRowsAction={importTabelRowsAction}
        pendingOcr={pendingOcr}
      />

      <section className="mb-8">
        {/* UX-audit 30 jul (item 12): hier stond "Order = request order. No sort
            buttons." De volgorde ís nog steeds de aanvraagvolgorde — dat is besluit C-11
            en het staat afgedwongen in lib/repo/review.ts:42. Alleen de zin is weg: de
            tabel hoeft niet uit te leggen dat ze geen knop heeft. Voeg dus geen
            sorteerknoppen toe omdat de disclaimer verdwenen is; dat zou C-11 breken. */}
        <div className="mb-2">
          <h2 className="text-lg font-medium">Lines ({lines.length})</h2>
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
              {/* Echte submit, dus `outline` en niet het neutrale `secondary`-vlak:
                  dit schrijft aantallen over de hele regeltabel. Zie DESIGN.md §6. */}
              <Button type="submit" variant="outline" size="sm">
                Link quantities
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Sprint M1 (docs/plan-matchstation-eigen-machine.md): intern-only blok, zelfde
          conventie als de interne blokken op /settings ("intern? toon"). */}
      {toegang.soort === "intern" && (
        <MatchstationCard
          dossierId={dossier.id}
          entry={matchstationQueueEntry}
          enqueueAction={enqueueForMatchstationAction}
        />
      )}
    </>
  );
}
