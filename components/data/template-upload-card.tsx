"use client";
// De ingang van het retour-pad (sprint 1.2): Brink krijgt een ingevulde template van een
// merk terug en zet hem hier neer. Niets van dit bestand komt in de catalogus — de action
// valideert (lib/excel-validate.ts, 1.1, ongewijzigd) en zet bij succes een staging-rij
// neer; de mens beoordeelt daarna het voorstel-scherm.
//
// TWEE LAGEN VOOR DE CAP (besluit 7): de client-check hieronder scheelt een kansloze
// request van megabytes; de server-check in uploadTemplateAction is de gezaghebbende.
// De clientcheck zit IN de useActionState-wrapper en niet in een onSubmit-handler: zo
// blijft er één pad naar de state en kan de melding nooit uit de pas lopen met pending.
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
import type { AfwijzingsReden } from "@/lib/excel-validate";
import {
  MAX_TEMPLATE_UPLOAD_BYTES,
  templateCapMelding,
} from "./template-upload-limits";

/**
 * Uitkomst van uploadTemplateAction zoals de kaart hem toont.
 *
 * Er is geen "ok"-variant: bij een geldig bestand redirect de action naar het
 * voorstel-scherm en komt deze kaart nooit meer aan bod. Dat is het punt van het pad —
 * een geslaagde upload is geen melding maar een scherm.
 */
export type TemplateUploadState =
  | { status: "idle" }
  /** Format-afwijzing van de 1.1-validator. `reden` blijft getypeerd meereizen (de kaart
   *  kan er per code op differentiëren zonder de tekst te parsen); `tekst` is wat
   *  afwijzingsTekst(reden) ervan maakte. */
  | { status: "rejected"; reden: AfwijzingsReden; tekst: string }
  /** Cap-overschrijding of een lege/kapotte keuze — geen format-oordeel. */
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
      // Client-laag van de cap: dit kost geen request en geen wachttijd.
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
          Received the filled template from this brand? Upload it here. Nothing
          is saved yet: we check the format first and then show you a proposal of
          what would change — you decide field by field.
        </p>
        <form action={formAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="brandId" value={brandId} />
          <input
            type="file"
            name="template"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            disabled={pending}
            aria-label="Choose filled template (.xlsx)"
            className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-2.5 file:py-1 file:text-sm"
          />
          {/* Outline, geen navy vlak. Deze knop slaat niets op — de kaarttekst hierboven
              zegt het zelf ("Nothing is saved yet") — en op dit scherm is Save in het
              relatieformulier de zwaarste actie. DESIGN.md §6 kent maar drie
              uitzonderingen op één-primary-per-scherm (dialoog, herhaalde beslis-kaart,
              filterchip) en een eenmalige sectiekaart is geen van drieën. */}
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Checking…" : "Check template"}
          </Button>
        </form>

        {pending && (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            Reading the file and comparing it with what we already know…
          </p>
        )}

        {/* Format-afwijzing: de zin van de 1.1-renderer, letterlijk. Geen alarmrood —
            een afgewezen bestand is geen fout van de lezer, het is iets om terug te
            koppelen aan het merk. Wel duidelijk: er is niets opgeslagen. */}
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
              Nothing has been saved. The brand relationship status is unchanged.
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
