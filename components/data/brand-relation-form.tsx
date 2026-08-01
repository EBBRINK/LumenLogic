"use client";

// Relatievelden bewerken op de detailpagina (stap 5): status, contactpersoon,
// e-mail, laatste contact en notities — één save via dezelfde server action als
// het overzicht (upsertBrandRelation blijft de enige schrijver, K2).
import { Button } from "@/components/ui/button";
import { veldClass, tekstvakClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, type RelationStatus } from "@/lib/brand-relations-view";

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
          className={cn(veldClass, "w-full")}
        >
          {(Object.keys(STATUS_LABEL) as RelationStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Last contact
        <input
          type="date"
          name="lastContactAt"
          defaultValue={values.lastContactAt ?? ""}
          className={cn(veldClass, "w-full")}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Contact
        <input
          type="text"
          name="contactName"
          defaultValue={values.contactName ?? ""}
          placeholder="Name at the brand"
          className={cn(veldClass, "w-full")}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          name="contactEmail"
          defaultValue={values.contactEmail ?? ""}
          placeholder="name@brand.com"
          className={cn(veldClass, "w-full")}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        Notes
        <textarea
          name="notes"
          defaultValue={values.notes ?? ""}
          rows={3}
          placeholder="Agreements, commitments, notes…"
          className={cn(tekstvakClass, "w-full")}
        />
      </label>
      <div className="sm:col-span-2">
        {/* De primary van /data/brand-relations/[brandId]: dit is de enige actie op het
            scherm die iets wegschrijft (DESIGN.md §6, één primary per scherm). De
            kopieerknop en "Check template" zijn daarom outline. */}
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}
