import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Server-action-form (geen client-JS nodig). Fase-default = tender (regel 4).
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
          Dossiernaam
        </label>
        <Input id="name" name="name" required placeholder="Bijv. Ziekenhuis X" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="customer" className="text-sm font-medium">
          Klant
        </label>
        <Input id="customer" name="customer" placeholder="Opdrachtgever" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="phase" className="text-sm font-medium">
          Fase
        </label>
        <select
          id="phase"
          name="phase"
          defaultValue="tender"
          className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
        >
          <option value="tender">Tender (veilig — geen suggesties)</option>
          <option value="awarded">Gegund</option>
        </select>
      </div>
      {organizations.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="orgId" className="text-sm font-medium">
            Organisatie
          </label>
          <select
            id="orgId"
            name="orgId"
            defaultValue=""
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
          >
            <option value="">Intern (Brink)</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <Button type="submit" className="self-start">
        Dossier aanmaken
      </Button>
    </form>
  );
}
