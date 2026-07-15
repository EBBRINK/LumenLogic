import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Twee invoerwegen (BUILD-PLAN §4.3.2): één regel per keer, óf een CSV-blok plakken.
export function AddSpecLineForm({
  dossierId,
  addLineAction,
  addCsvAction,
}: {
  dossierId: string;
  addLineAction: (formData: FormData) => void | Promise<void>;
  addCsvAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form action={addLineAction} className="flex flex-col gap-3">
        <input type="hidden" name="dossierId" value={dossierId} />
        <p className="text-sm font-medium">Single line</p>
        <div className="grid grid-cols-3 gap-2">
          <Input name="fixtureCode" required placeholder="Code (Lp301)" />
          <Input name="quantity" type="number" min="1" defaultValue="1" placeholder="Quantity" />
          <Input name="brandText" placeholder="Brand (XAL)" />
        </div>
        <Input name="productText" placeholder="Type (SASSO 100)" />
        <div className="grid grid-cols-3 gap-2">
          <Input name="reqKelvin" type="number" placeholder="Kelvin" />
          <Input name="reqCri" type="number" placeholder="CRI" />
          <Input name="reqIp" placeholder="IP" />
        </div>
        <Button type="submit" className="self-start">
          Add line
        </Button>
      </form>

      <form action={addCsvAction} className="flex flex-col gap-3">
        <input type="hidden" name="dossierId" value={dossierId} />
        <p className="text-sm font-medium">Paste CSV block</p>
        <textarea
          name="csv"
          rows={6}
          placeholder={"code, quantity, brand, type\nLp301, 12, XAL, SASSO 100\nLw201, 8, Wever & Ducré, SCAVA 1.0"}
          className="rounded-lg border border-input bg-background p-2.5 font-mono text-xs"
        />
        <Button type="submit" variant="secondary" className="self-start">
          Import lines
        </Button>
      </form>
    </div>
  );
}
