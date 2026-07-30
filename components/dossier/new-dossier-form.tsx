"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { XIS_PHASE_LABELS, XIS_PHASE_ORDER } from "./project-status-badge";

// Server-action-form (geen client-JS nodig voor het formulier zelf). Een nieuw project
// start ALTIJD als status 'concept' (geen statuskeuze hier); alleen de XIS-fase is te
// kiezen, default 'start'. De veiligheidsstand (fase) wordt serverside afgeleid —
// default veilig (regel 4). Org is optioneel: leeg = intern Brink-dossier (V1-default);
// een org koppelen is de externe-uitrol-haak (L-03).
//
// LET OP — de XIS-fase 'Tender' hier en de veiligheidsstand 'Tender' op de kaart zijn
// TWEE VERSCHILLENDE VELDEN. De XIS-fase is één van de tien workflowfasen van Brink en
// staat in dit formulier; de veiligheidsstand wordt serverside uit de status afgeleid en
// is nooit hier te kiezen. Ze spreken elkaar dus niet tegen — niet "gelijktrekken".
export function NewDossierForm({
  action,
  organizations = [],
}: {
  action: (formData: FormData) => void | Promise<void>;
  organizations?: { id: string; name: string }[];
}) {
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          Project name
        </label>
        <Input id="name" name="name" required placeholder="E.g. Hospital X" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="customer" className="text-sm font-medium">
          Customer
        </label>
        <Input id="customer" name="customer" placeholder="Client" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="xisPhase" className="text-sm font-medium">
          XIS phase
        </label>
        <select
          id="xisPhase"
          name="xisPhase"
          required
          defaultValue="start"
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
        >
          {XIS_PHASE_ORDER.map((p) => (
            <option key={p} value={p}>
              {XIS_PHASE_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
      {organizations.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="orgId" className="text-sm font-medium">
            Organization
          </label>
          <select
            id="orgId"
            name="orgId"
            defaultValue=""
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
          >
            <option value="">Internal (Brink)</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <Button type="submit" className="self-start">
        Create project
      </Button>
    </form>
  );
}

// ── Het formulier in een dialoog (UX-audit 30 jul) ─────────────────────────────────
// Het stond als vaste `aside` naast de lijst en claimde permanent een derde van de
// breedte voor iets wat je een paar keer per week doet; op mobiel viel het ónder álle
// projectkaarten, dus een project aanmaken begon met langs de hele lijst scrollen.
//
// Geen nieuw dialoogmechanisme: exact de vorm van xis-push-dialog.tsx en
// confirm-action-dialog.tsx — Radix-dialog uit components/ui/dialog.tsx met een
// <form action={serverAction}> erin. `callAction()` hoort hier NIET: dat is voor een
// geawait server-action vanuit client-code. Een form-submit is Next' eigen pad, dus de
// NEXT_REDIRECT van createDossierAction wordt door Next zelf als navigatie afgehandeld
// en komt nooit als afgewezen promise in onze code terecht.
export function NewDossierDialog({
  action,
  organizations = [],
}: {
  action: (formData: FormData) => void | Promise<void>;
  organizations?: { id: string; name: string }[];
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button">New project</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <NewDossierForm action={action} organizations={organizations} />
      </DialogContent>
    </Dialog>
  );
}
