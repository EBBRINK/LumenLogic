"use client";

// Relatievelden bewerken op de detailpagina (stap 5): status, contactpersoon,
// e-mail, laatste contact en notities — één save via dezelfde server action als
// het overzicht (upsertBrandRelation blijft de enige schrijver, K2).
import { STATUS_LABEL, type RelationStatus } from "./brand-relations-table";

export type BrandRelationFormValues = {
  brandId: string;
  status: RelationStatus;
  contactName: string | null;
  contactEmail: string | null;
  lastContactAt: string | null;
  notes: string | null;
};

export function BrandRelationForm({
  values,
  updateAction,
}: {
  values: BrandRelationFormValues;
  updateAction: (formData: FormData) => Promise<void> | void;
}) {
  return (
    <form action={updateAction} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="brandId" value={values.brandId} />
      <label className="flex flex-col gap-1 text-sm">
        Status
        <select
          name="status"
          defaultValue={values.status}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          {(Object.keys(STATUS_LABEL) as RelationStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Laatste contact
        <input
          type="date"
          name="lastContactAt"
          defaultValue={values.lastContactAt ?? ""}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Contactpersoon
        <input
          type="text"
          name="contactName"
          defaultValue={values.contactName ?? ""}
          placeholder="Naam bij het merk"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        E-mail
        <input
          type="email"
          name="contactEmail"
          defaultValue={values.contactEmail ?? ""}
          placeholder="naam@merk.com"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        Notities
        <textarea
          name="notes"
          defaultValue={values.notes ?? ""}
          rows={3}
          placeholder="Afspraken, toezeggingen, bijzonderheden…"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </label>
      <div className="sm:col-span-2">
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Opslaan
        </button>
      </div>
    </form>
  );
}
