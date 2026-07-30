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
        <CardTitle>XIS connection</CardTitle>
        <p className="text-sm text-muted-foreground">
          Environment and API key for the export to XIS. Sandbox is the safe
          default.
        </p>
      </CardHeader>
      <CardContent>
        <form action={saveAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="xis-environment" className="text-sm font-medium">
              Environment
            </label>
            <select
              id="xis-environment"
              name="environment"
              defaultValue={environment}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:max-w-xs dark:bg-input/30"
            >
              <option value="sandbox">Sandbox (safe)</option>
              <option value="productie">Production</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="xis-key"
              className="flex items-center gap-1.5 text-sm font-medium"
            >
              API key
              {keyIsSet ? (
                <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <IconLock className="size-3" /> set
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <IconUnlock className="size-3" /> not set yet
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
                  ? "••••••••  (leave empty to keep)"
                  : "Paste the XIS API key"
              }
              className="sm:max-w-xs"
            />
            {/* UX-audit 30 jul (bug #10): de tweede zin stond er onvoorwaardelijk, dus
                een sleutel die "not set yet" is vertelde je óók hem leeg te laten "om de
                huidige te behouden". Er ís dan geen huidige. Nu volgt de hulptekst de
                stand van keyIsSet, net als het label en de placeholder erboven. */}
            <p className="text-xs text-muted-foreground">
              {keyIsSet
                ? "The stored key is never shown. Leave empty to keep the current key."
                : "The key is stored server-side and never shown again after saving."}
            </p>
          </div>

          {/* De primary van /settings (huisregel "één primary per scherm", DESIGN.md §6).
              Dit is het zwaarste gevolg op de pagina: de sleutel wordt daarna nooit meer
              getoond én de keuze sandbox/productie bepaalt waar een echte offerte landt.
              Stond op `secondary` — een bleek vlak dat de UX-audit van 30 jul als
              uitgeschakeld las. */}
          <Button type="submit" className="self-start">
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
