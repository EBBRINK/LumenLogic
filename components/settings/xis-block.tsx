import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { IconLock, IconUnlock } from "@/components/dossier/icons";

export type XisEnvironment = "sandbox" | "productie";

// XIS (E-09…E-12, NFR 7): omgeving-schakelaar (sandbox = veilige default) en het
// API-sleutelveld. De échte sleutel wordt NOOIT getoond — de UI weet alleen óf er een
// sleutel staat. Leeg laten bij opslaan behoudt de bestaande sleutel.
export function XisBlock({
  environment,
  keyIsSet,
  saveAction,
}: {
  environment: XisEnvironment;
  keyIsSet: boolean;
  saveAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>XIS-koppeling</CardTitle>
        <p className="text-sm text-muted-foreground">
          Omgeving en API-sleutel voor de export naar XIS. Sandbox is de veilige
          standaard.
        </p>
      </CardHeader>
      <CardContent>
        <form action={saveAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="xis-environment" className="text-sm font-medium">
              Omgeving
            </label>
            <select
              id="xis-environment"
              name="environment"
              defaultValue={environment}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:max-w-xs dark:bg-input/30"
            >
              <option value="sandbox">Sandbox (veilig)</option>
              <option value="productie">Productie</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="xis-key"
              className="flex items-center gap-1.5 text-sm font-medium"
            >
              API-sleutel
              {keyIsSet ? (
                <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <IconLock className="size-3" /> ingesteld
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <IconUnlock className="size-3" /> nog niet ingesteld
                </span>
              )}
            </label>
            <Input
              id="xis-key"
              name="apiKey"
              type="password"
              autoComplete="off"
              placeholder={
                keyIsSet
                  ? "••••••••  (laat leeg om te behouden)"
                  : "Plak de XIS API-sleutel"
              }
              className="sm:max-w-xs"
            />
            <p className="text-xs text-muted-foreground">
              De opgeslagen sleutel wordt nooit getoond. Leeg laten behoudt de
              huidige sleutel.
            </p>
          </div>

          <Button type="submit" variant="secondary" className="self-start">
            Opslaan
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
