import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { IconTrash } from "@/components/dossier/icons";

// Eén rij uit de allowlist. Bewust minimaal — de datum blijft in de repo, de UI toont
// wie het adres toevoegde.
export type AllowedEmailRow = {
  email: string;
  addedBy: string | null;
};

// GEBRUIKERS (L-02): de 2–5 interne adressen die kunnen inloggen. Wie hier niet staat,
// krijgt geen magic link (de poort zit in lib/auth.ts). Het laatste adres is niet te
// verwijderen — niemand sluit zichzelf per ongeluk buiten (fail-safe).
export function AllowedEmailsBlock({
  emails,
  addAction,
  removeAction,
}: {
  emails: AllowedEmailRow[];
  addAction: (formData: FormData) => void | Promise<void>;
  removeAction: (formData: FormData) => void | Promise<void>;
}) {
  const canRemove = emails.length > 1;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <p className="text-sm text-muted-foreground">
          Internal addresses that can log in. An unknown address gets no magic
          link.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {emails.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No addresses yet. Add one below.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-foreground/10">
            {emails.map((e) => (
              <li
                key={e.email}
                className="flex items-center justify-between gap-3 py-2 first:pt-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{e.email}</p>
                  {e.addedBy && (
                    <p className="truncate text-xs text-muted-foreground">
                      added by {e.addedBy}
                    </p>
                  )}
                </div>
                <form action={removeAction}>
                  <input type="hidden" name="email" value={e.email} />
                  <Button
                    type="submit"
                    size="icon-sm"
                    variant="ghost"
                    disabled={!canRemove}
                    aria-label={`Remove ${e.email}`}
                    title={
                      canRemove
                        ? "Remove address"
                        : "Last address — cannot be removed"
                    }
                  >
                    <IconTrash />
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form
          action={addAction}
          className="flex flex-col gap-2 border-t border-foreground/10 pt-4 sm:flex-row"
        >
          <Input
            type="email"
            name="email"
            required
            placeholder="name@brink.nl"
            className="sm:max-w-xs"
          />
          <Button type="submit" className="self-start">
            Add address
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
