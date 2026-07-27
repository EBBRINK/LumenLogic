"use client";

// Formulier voor een EIGEN PRODUCTVELD (sprint 1.8). Eén component voor aanmaken én
// bewerken — het verschil is `waarden` (leeg = nieuw) en de action die het krijgt.
//
// WAAROM LABEL EN INSTRUCTIE (BEIDE ENGELS) VERPLICHT ZIJN: rij 3 van het merk-Excel is
// de instructie. Een veld zonder instructie is een kolom die niemand invult — precies de
// valkuil die dit item juist moet vermijden. Sinds sprint 1.9 vraagt het formulier geen
// Nederlands meer (besluit W1: de interne UI is Engels). `required` is hier dus geen
// nettigheid maar het ontwerp; de server-actie toetst het nog een keer (een browser is
// geen contract).
//
// GEEN EIGEN DB-PAD, GEEN EIGEN VALIDATIEPROZA: de labelbotsing-melding komt uit de
// server-actie via useActionState. Dit bestand verzint geen enkele reden waarom iets niet
// kan.
import { useActionState, useState } from "react";
import type { Compleetheidsniveau } from "@/lib/field-catalog";

/** De 10 template-buckets. "intern" hoort er per contract nooit bij: een eigen veld gaat
 *  per definitie naar het merk, en bucket 11 is juist wat we NIET vragen. */
export type BucketOptie = { key: string; labelEn: string; order: number };

export type EigenVeldFormWaarden = {
  id: string;
  labelEn: string;
  instructionEn: string;
  niveau: Compleetheidsniveau;
  bucketKey: string;
};

/** `void` staat er zodat een no-op server-action (screenshot-tests) hier past. */
export type VeldFormState = { error: string } | null | void;
export type VeldFormAction = (
  state: VeldFormState,
  formData: FormData,
) => Promise<VeldFormState>;

// De drie niveaus in één adem — en het must-verhaal staat er letterlijk, want het wijkt
// AF van wat "must" bij een catalogusveld betekent (plan §2). Een catalogus-must is
// dragend voor de verwerking (zonder artikelcode is er geen sleutel), dus een ontbrekende
// kolom wijst het hele bestand af. Een eigen veld kan dat per definitie nooit zijn: het
// bestond nog niet toen de bestanden die nu onderweg zijn werden verstuurd.
export const NIVEAU_UITLEG: Record<Compleetheidsniveau, string> = {
  must: "must = weighs the heaviest in the scorecard. A brand file is never rejected because of it — files that were already on their way could not have known this field.",
  wanna:
    "wanna = we ask for it and it counts towards the score, but its absence is not a problem.",
  nice: "nice = welcome extra. Lowest weight in the scorecard.",
};

const NIVEAUS: Compleetheidsniveau[] = ["must", "wanna", "nice"];

const invoerClass =
  "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm";

function Veld({
  label,
  name,
  hint,
  defaultValue,
  placeholder,
  textarea = false,
}: {
  label: string;
  name: string;
  hint: string;
  defaultValue: string;
  placeholder: string;
  textarea?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span>
        {label} <span aria-hidden className="text-muted-foreground">*</span>
      </span>
      {textarea ? (
        <textarea
          name={name}
          required
          rows={2}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className={invoerClass}
        />
      ) : (
        <input
          type="text"
          name={name}
          required
          defaultValue={defaultValue}
          placeholder={placeholder}
          className={invoerClass}
        />
      )}
      <span className="text-xs text-muted-foreground">{hint}</span>
    </label>
  );
}

export function CustomFieldForm({
  waarden,
  buckets,
  submitAction,
  onCancel,
}: {
  /** null = nieuw veld. */
  waarden: EigenVeldFormWaarden | null;
  buckets: BucketOptie[];
  submitAction: VeldFormAction;
  onCancel?: () => void;
}) {
  const [state, formAction, pending] = useActionState<VeldFormState, FormData>(
    submitAction,
    null,
  );
  const [niveau, setNiveau] = useState<Compleetheidsniveau>(
    waarden?.niveau ?? "wanna",
  );
  const bewerken = waarden !== null;
  // state kan `void` zijn (no-op action in de tests); pak de melding pas als er een
  // object staat, anders lekt `void` de JSX in.
  const fout = state ? state.error : null;

  return (
    <form
      action={formAction}
      className="rounded-lg bg-card p-4 ring-1 ring-foreground/10"
    >
      {bewerken && <input type="hidden" name="id" value={waarden.id} />}
      <h3 className="mb-1 font-medium">
        {bewerken ? "Edit field" : "New field"}
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">
        A field you add here becomes an extra column in the brand Excel and a row
        in the scorecard. It is never read by the matcher.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Veld
          label="Label"
          name="labelEn"
          defaultValue={waarden?.labelEn ?? ""}
          placeholder="Recycled content (%)"
          hint="The column header the brand sees (row 2). Must be unique."
        />
        <Veld
          label="Instruction"
          name="instructionEn"
          textarea
          defaultValue={waarden?.instructionEn ?? ""}
          placeholder="Share of recycled material in percent, e.g. 35."
          hint="Row 3 of the brand Excel — this is what the brand reads."
        />
      </div>

      <fieldset className="mt-4">
        <legend className="mb-1 text-sm">Level</legend>
        <div className="flex flex-wrap gap-4">
          {NIVEAUS.map((n) => (
            <label key={n} className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="niveau"
                value={n}
                checked={niveau === n}
                onChange={() => setNiveau(n)}
                className="size-4 accent-foreground"
              />
              {n}
            </label>
          ))}
        </div>
        <p
          data-niveau-uitleg={niveau}
          className={`mt-2 text-xs ${niveau === "must" ? "rounded-md bg-muted px-2.5 py-1.5 text-foreground" : "text-muted-foreground"}`}
        >
          {NIVEAU_UITLEG[niveau]}
        </p>
      </fieldset>

      <label className="mt-4 flex max-w-sm flex-col gap-1 text-sm">
        <span>
          Category <span aria-hidden className="text-muted-foreground">*</span>
        </span>
        <select
          name="bucketKey"
          defaultValue={waarden?.bucketKey ?? buckets[0]?.key}
          className={invoerClass}
        >
          {buckets.map((b) => (
            <option key={b.key} value={b.key}>
              {b.order}. {b.labelEn}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          Determines where the field lands in the Excel and in the scorecard.
        </span>
      </label>

      {fout && (
        <p
          role="alert"
          className="mt-4 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          {fout}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {bewerken ? "Save field" : "Add field"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
