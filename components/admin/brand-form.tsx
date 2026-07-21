"use client";
// Merk aanmaken én bewerken — één formulier, twee modi (plan §1). Geen commerciële velden:
// korting, betaaltermijn en levertijd horen hier niet thuis (geld raakt de ranking nooit,
// en de import is daar de enige waarheid).
//
// KRITIEK (plan §2): elk veld leest `state.values?.x ?? <initiële waarde>`. De dubbelcheck
// stuurt het formulier terug met een waarschuwing; zonder die regel is het scherm dan leeg
// zodra JavaScript uit staat en typt de gebruiker alles opnieuw. Dat heeft een eigen test.
//
// De velden staan als DATA in FIELDS, niet als zes losse blokken JSX. Er komt later een
// milieu-veld bij (Timo); dat moet één regel zijn, geen verbouwing.
import { useActionState } from "react";
import type { BrandLifecycle } from "@/db/schema";
import type {
  BrandFormState,
  BrandFormValues,
} from "@/app/admin/brands/actions";

export type BrandFormAction = (
  prev: BrandFormState,
  formData: FormData,
) => Promise<BrandFormState>;

/** Wat het formulier van een bestaand merk nodig heeft. Bewust géén commerciële velden. */
export type BrandFormBrand = {
  id: string;
  name: string;
  brandCode: string | null;
  country: string | null;
  website: string | null;
  descriptionNl: string | null;
  lifecycle: BrandLifecycle;
};

export const LIFECYCLE_LABEL: Record<BrandLifecycle, string> = {
  actief: "Active — in use",
  slapend: "Dormant — Brink no longer uses it",
  bestaat_niet_meer: "No longer exists",
};

const LIFECYCLE_ORDER: BrandLifecycle[] = [
  "actief",
  "slapend",
  "bestaat_niet_meer",
];

// Tekstvelden als data: een veld toevoegen is één regel erbij.
const FIELDS = [
  {
    name: "name",
    label: "Name",
    required: true,
    placeholder: "Delta Light",
    hint: null,
  },
  {
    name: "brandCode",
    label: "Brand code",
    required: false,
    placeholder: "L028",
    hint: "Not unique — several brands can share one code.",
  },
  {
    name: "country",
    label: "Country",
    required: false,
    placeholder: "BE",
    hint: null,
  },
  {
    name: "website",
    label: "Website",
    required: false,
    placeholder: "https://…",
    hint: null,
  },
] as const satisfies readonly {
  name: keyof BrandFormValues;
  label: string;
  required: boolean;
  placeholder: string;
  hint: string | null;
}[];

const inputClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function emptyValues(brand?: BrandFormBrand): BrandFormValues {
  return {
    name: brand?.name ?? "",
    brandCode: brand?.brandCode ?? "",
    country: brand?.country ?? "",
    website: brand?.website ?? "",
    descriptionNl: brand?.descriptionNl ?? "",
    lifecycle: brand?.lifecycle ?? "actief",
  };
}

export function BrandForm({
  mode,
  brand,
  action,
  initialState = { status: "idle" },
}: {
  mode: "create" | "edit";
  brand?: BrandFormBrand;
  action: BrandFormAction;
  /** Alleen voor tests/verse render; productie start op idle. */
  initialState?: BrandFormState;
}) {
  const [state, formAction, pending] = useActionState<BrandFormState, FormData>(
    action,
    initialState,
  );

  // De teruggestuurde waarden winnen van de initiële: anders is het formulier na de
  // dubbelwaarschuwing leeg zonder JavaScript.
  const initial = emptyValues(brand);
  const back = state.status === "idle" ? undefined : state.values;
  const value = (key: keyof BrandFormValues) => back?.[key] ?? initial[key];

  const duplicate = state.status === "duplicate" ? state : null;
  const submitLabel = duplicate
    ? mode === "create"
      ? "Yes, create anyway"
      : "Yes, save anyway"
    : mode === "create"
      ? "Create brand"
      : "Save brand";

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      {brand && <input type="hidden" name="brandId" value={brand.id} />}

      {/* De dubbelcheck WAARSCHUWT, hij blokkeert niet. Vijf merken delen code L062 en
          Flos/Flos Architectural/Flos SOFT Architectural delen L028: dat zijn echte,
          verschillende merken. Alleen de mens weet welk geval dit is.
          Bovenaan, niet onderaan: het is het antwoord op de vorige klik, en op 375px
          staat alles onder het formulier buiten beeld. */}
      {duplicate && (
        <div
          role="alert"
          data-testid="brand-duplicate-warning"
          className="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-900 sm:col-span-2 dark:bg-amber-950 dark:text-amber-200"
        >
          <p className="font-medium text-foreground">
            {duplicate.matches.length === 1
              ? "A brand with this name or code already exists"
              : `${duplicate.matches.length} brands with this name or code already exist`}
          </p>
          <ul className="mt-2 space-y-1">
            {duplicate.matches.map((m) => (
              <li key={m.id}>
                <a
                  href={`/admin/brands/${m.id}`}
                  className="underline underline-offset-4"
                >
                  {m.name}
                </a>
                {m.brandCode && (
                  <span className="ml-2 text-xs tabular-nums">
                    {m.brandCode}
                  </span>
                )}
                <span className="ml-2 text-xs">
                  same{" "}
                  {m.on.map((o) => (o === "name" ? "name" : "code")).join(" and ")}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2">
            This can genuinely be three different brands: Flos, Flos
            Architectural and Flos SOFT Architectural all share code L028.
            Nothing has been saved yet — check the brand above, then continue if
            this really is a new one.
          </p>
          <input type="hidden" name="confirmToken" value={duplicate.token} />
        </div>
      )}

      {FIELDS.map((f) => (
        <label key={f.name} className="flex flex-col gap-1 text-sm">
          <span>
            {f.label}
            {f.required && <span aria-hidden> *</span>}
          </span>
          <input
            type="text"
            name={f.name}
            required={f.required}
            defaultValue={value(f.name)}
            placeholder={f.placeholder}
            aria-label={f.label}
            className={inputClass}
          />
          {f.hint && (
            <span className="text-xs text-muted-foreground">{f.hint}</span>
          )}
        </label>
      ))}

      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        Description
        <textarea
          name="descriptionNl"
          rows={3}
          defaultValue={value("descriptionNl")}
          placeholder="What this brand is, and anything worth knowing — bankruptcy, merger, who to talk to."
          aria-label="Description"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        Lifecycle
        <select
          name="lifecycle"
          defaultValue={value("lifecycle")}
          aria-label="Lifecycle"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm sm:max-w-sm"
        >
          {LIFECYCLE_ORDER.map((l) => (
            <option key={l} value={l}>
              {LIFECYCLE_LABEL[l]}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          A reason (bankrupt, merged) belongs in the description — the lifecycle
          is only the phase.
        </span>
      </label>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          {state.message}
        </p>
      )}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
