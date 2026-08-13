"use client";
// De ingang van het template-pad. Sinds de koerswijziging van 11 aug 2026
// (docs/goal-template-upload-direct-import.md) is dit een DIRECTE import met
// vervang-semantiek: de action valideert (lib/excel-validate.ts, 1.1, ongewijzigd) en past
// het bestand daarna meteen toe — het bestand is integraal leidend, de oude prijslijst
// gaat op archief. Daarom vraagt de kaart de nieuwe prijslijst-metadata (naam + geldigheid)
// hier uit: dit is de enige menselijke invoer, er komt geen goedkeurstap meer.
//
// TWEE LAGEN VOOR DE BYTE-CAP (besluit 7): de client-check hieronder scheelt een kansloze
// request van megabytes; de server-check in uploadTemplateAction is de gezaghebbende.
// De clientcheck zit IN de useActionState-wrapper en niet in een onSubmit-handler: zo
// blijft er één pad naar de state en kan de melding nooit uit de pas lopen met pending.
// (De RIJ-cap is server-only: rijen zijn pas na de validatie bekend.)
//
// GEEN EIGEN VALIDATIEPROZA. Een format-afwijzing komt als getypeerde `reden` terug plus
// de tekst die lib/excel-validate-messages.ts ervan maakte. Die tekst wordt bewust
// SERVERSIDE gerenderd: excel-validate-messages importeert lib/excel-validate voor zijn
// constanten, en die trekt exceljs mee — in een client component betekent dat een
// spreadsheet-parser van megabytes in de browserbundel, voor één zin. De renderer blijft
// dus de enige plek waar de zin ontstaat; alleen de aanroep staat aan de serverkant.
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AfwijzingsReden } from "@/lib/excel-validate";
import {
  MAX_TEMPLATE_UPLOAD_BYTES,
  templateCapMelding,
} from "./template-upload-limits";

/**
 * Uitkomst van uploadTemplateAction zoals de kaart hem toont.
 *
 * Er is geen "ok"-variant: bij een geslaagde import redirect de action naar het merkscherm
 * met de tellingen (import-summary.tsx) en komt deze kaart nooit meer aan bod.
 */
export type TemplateUploadState =
  | { status: "idle" }
  /** Format-afwijzing van de 1.1-validator. `reden` blijft getypeerd meereizen (de kaart
   *  kan er per code op differentiëren zonder de tekst te parsen); `tekst` is wat
   *  afwijzingsTekst(reden) ervan maakte. */
  | { status: "rejected"; reden: AfwijzingsReden; tekst: string }
  /** Cap-overschrijding, ontbrekend formulierveld of een geweigerde import (bijv. geen
   *  prijzen in het bestand) — geen format-oordeel. */
  | { status: "error"; message: string };

export type TemplateUploadAction = (
  prev: TemplateUploadState,
  formData: FormData,
) => Promise<TemplateUploadState>;

export function TemplateUploadCard({
  brandId,
  uploadAction,
}: {
  brandId: string;
  uploadAction: TemplateUploadAction;
}) {
  const [state, formAction, pending] = useActionState<
    TemplateUploadState,
    FormData
  >(
    async (prev, formData) => {
      const file = formData.get("template");
      if (!(file instanceof File) || file.size === 0) {
        return {
          status: "error",
          message: "Choose the filled template (.xlsx) first.",
        };
      }
      // Client-laag van de byte-cap: dit kost geen request en geen wachttijd.
      if (file.size > MAX_TEMPLATE_UPLOAD_BYTES) {
        return { status: "error", message: templateCapMelding(file.size) };
      }
      return uploadAction(prev, formData);
    },
    { status: "idle" },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload filled template</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Received a filled template from this brand? Upload it here. The file
          replaces this brand&apos;s data: after the format check every value in
          it is imported — including cleared fields — and the previous price
          list is archived. Products that are not in the file disappear from
          search results.
        </p>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="brandId" value={brandId} />
          {/* De nieuwe prijslijst: naam + geldigheid, alle drie verplicht — een lijst
              zonder einddatum voedt ijzeren regel 3 niet. Dit is de enige menselijke
              invoer van de import. */}
          <div className="flex flex-wrap gap-3">
            <label className="flex w-56 flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">
                Price list name
              </span>
              <Input
                type="text"
                name="priceListName"
                required
                disabled={pending}
                placeholder="e.g. Price list 2026"
              />
            </label>
            <label className="flex w-44 flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Valid from</span>
              <Input
                type="date"
                name="priceListValidFrom"
                required
                disabled={pending}
              />
            </label>
            <label className="flex w-44 flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Valid until</span>
              <Input
                type="date"
                name="priceListValidUntil"
                required
                disabled={pending}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              name="template"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              disabled={pending}
              aria-label="Choose filled template (.xlsx)"
              className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-2.5 file:py-1 file:text-sm"
            />
            {/* Outline, geen navy vlak — op dit scherm is Save in het relatieformulier de
                zwaarste actie (DESIGN.md §6, één primary per scherm). De knoptekst dekt
                wat hij ECHT doet: checken én importeren, in één klik. */}
            <Button type="submit" variant="outline" disabled={pending}>
              {pending ? "Checking & importing…" : "Check & import"}
            </Button>
          </div>
        </form>

        {pending && (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            Checking the format and importing the file — a full catalogue takes
            a moment, keep this page open…
          </p>
        )}

        {/* Format-afwijzing: de zin van de 1.1-renderer, letterlijk. Geen alarmrood —
            een afgewezen bestand is geen fout van de lezer, het is iets om terug te
            koppelen aan het merk. Wel duidelijk: er is niets geïmporteerd. */}
        {state.status === "rejected" && !pending && (
          <div
            role="alert"
            data-reden={state.reden.code}
            className="mt-3 rounded-lg bg-status-amber-tint px-4 py-3 text-sm text-status-amber-ink"
          >
            <p className="font-medium text-foreground">
              This file was not accepted
            </p>
            <p className="mt-1">{state.tekst}</p>
            <p className="mt-1 text-muted-foreground">
              Nothing has been imported. The brand relationship status is
              unchanged.
            </p>
          </div>
        )}

        {state.status === "error" && !pending && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {state.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
