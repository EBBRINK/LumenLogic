import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { IconTrash } from "@/components/dossier/icons";

// Eén rij uit de allowlist. Bewust minimaal — de datum blijft in de repo, de UI toont
// wie het adres toevoegde.
export type AllowedEmailRow = {
  email: string;
  addedBy: string | null;
};

// GEBRUIKERS (L-02): de 2–5 interne adressen die kunnen inloggen. Wie hier niet staat,
// krijgt geen magic link (de poort zit in lib/auth.ts).
//
// Twee fail-safes, allebei "knop afwezig" en niet "knop actief met een waarschuwing":
//  1. Het láátste adres is niet te verwijderen — dan kan niemand meer inloggen.
//  2. Je eigen adres is niet te verwijderen (UX-audit bug #5). Dat was de echte
//     lock-out: met twee adressen mocht je jezelf er wél uitgooien, en de enige weg
//     terug loopt via het scherm waar je dan niet meer bij kunt. Een collega moet je
//     verwijderen — dan is er altijd nog iemand binnen.
// Verwijderen dat wél mag, gaat sinds bug #5 door een bevestiging die het adres bij
// naam noemt.
export function AllowedEmailsBlock({
  emails,
  addAction,
  removeAction,
  sessionEmail,
}: {
  emails: AllowedEmailRow[];
  addAction: (formData: FormData) => void | Promise<void>;
  removeAction: (formData: FormData) => void | Promise<void>;
  /** Het adres van de ingelogde gebruiker; die rij is niet te verwijderen. */
  sessionEmail?: string | null;
}) {
  const canRemove = emails.length > 1;
  const self = sessionEmail?.trim().toLowerCase() ?? null;
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
          // Het toevoeg-formulier staat ín dezelfde kaart, direct hieronder — de zin
          // wijst naar beneden en klopt, dus geen tweede knop hier.
          <EmptyState
            variant="inline"
            title="No addresses yet. Add one below."
            action={null}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-foreground/10">
            {emails.map((e) => {
              const isSelf = self != null && e.email.trim().toLowerCase() === self;
              const blocked = !canRemove
                ? "Last address — cannot be removed"
                : isSelf
                  ? "Your own address — ask a colleague to remove it"
                  : null;
              return (
                <li
                  key={e.email}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {e.email}
                      {isSelf && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          you
                        </span>
                      )}
                    </p>
                    {e.addedBy && (
                      <p className="truncate text-xs text-muted-foreground">
                        added by {e.addedBy}
                      </p>
                    )}
                  </div>
                  {blocked ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled
                      aria-label={`Remove ${e.email}`}
                      title={blocked}
                    >
                      <IconTrash />
                    </Button>
                  ) : (
                    <ConfirmActionDialog
                      trigger={
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Remove ${e.email}`}
                          title="Remove address"
                        >
                          <IconTrash />
                        </Button>
                      }
                      title={`Remove ${e.email}?`}
                      description="This address can no longer log in: a magic link request from it gets no mail. Adding it back later is possible."
                      confirmLabel="Remove address"
                      action={removeAction}
                      fields={{ email: e.email }}
                    />
                  )}
                </li>
              );
            })}
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
