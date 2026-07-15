import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { XIS_PHASE_LABELS, XIS_PHASE_ORDER } from "./project-status-badge";

// Server-action-form (geen client-JS nodig). Een nieuw project start ALTIJD als
// status 'concept' (geen statuskeuze hier); alleen de XIS-fase is te kiezen, default
// 'start'. De veiligheidsstand (fase) wordt serverside afgeleid — default veilig (regel 4).
// Org is optioneel: leeg = intern Brink-dossier (V1-default); een org koppelen is de
// externe-uitrol-haak (L-03).
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
