import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Server-action-form (geen client-JS nodig). Fase-default = tender (regel 4).
export function NewDossierForm({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
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
      <Button type="submit" className="self-start">
        Dossier aanmaken
      </Button>
    </form>
  );
}
