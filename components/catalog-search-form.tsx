"use client";

// Het zoekformulier van /catalog, met de live treffer-teller (demosessie Brink Licht,
// 12 aug): het aantal treffers telt mee terwijl je typt, zonder enter. Het klantvoorbeeld:
// merk Delta Light, typ "Ent" → 719 treffers, "Entero 2700" → 375, verder typen → 75.
// Het getal is de prikkel om verder te typen — juist als er nog te veel treffers zijn om
// resultaten te tonen, moet het er staan.
//
// De echte zoekactie blijft het GET-formulier (enter/knop → query-string → server render).
// Deze component doet er alleen een count-only pad naast: elke wijziging wordt gedebounced
// (±200 ms, zodat niet elke toetsaanslag de database raakt) en telt dan via de server
// action langs exact dezelfde WHERE-bouwers als de zoekopdracht zelf.
//
// De action wordt als prop aangereikt (zelfde patroon als components/settings/
// password-block.tsx): de servercomponent geeft de echte "use server"-referentie mee,
// de tests een stub. Zonder prop is er geen live teller — het formulier zelf blijft werken.
import { useEffect, useRef, useState } from "react";
import { IconSearch } from "./dossier/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { veldClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { callAction, failureDetail } from "@/lib/next-action-result";
import type { CountOutcome } from "@/lib/catalog-zoekvorm";
import { omschrijfHerkenning, type HerkendToken } from "@/lib/spec-tokens";
import type { CatalogValues } from "./catalog-search";

// ±200 ms: kort genoeg om "live" te voelen, lang genoeg om een woord te typen zonder dat
// elke toetsaanslag een query wordt.
export const DEBOUNCE_MS = 200;

export type CountAction = (formData: FormData) => Promise<CountOutcome>;

// Native select met exact de tokens van <Input> — dezelfde bron (components/ui/field.ts),
// dus ook dezelfde 44px (O9) en dezelfde focus-ring.
const selectClass = cn(veldClass, "w-full min-w-0");

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

type LiveCount =
  | { kind: "count"; total: number; verbreed: boolean; herkend: HerkendToken[] }
  | { kind: "unavailable"; detail: string };

const str = (v: FormDataEntryValue | null) =>
  typeof v === "string" ? v.trim() : "";

export function CatalogSearchForm({
  brands,
  values,
  countAction,
}: {
  brands: string[];
  values: CatalogValues;
  countAction?: CountAction;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Antwoorden kunnen elkaar inhalen; alleen het antwoord op de láátste vraag telt.
  const seq = useRef(0);
  const [live, setLive] = useState<LiveCount | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function count() {
    const form = formRef.current;
    if (!form || !countAction) return;
    const fd = new FormData(form);
    const brand = str(fd.get("brand"));
    const q = str(fd.get("q"));
    // Staat er precies wat er bij het laden al stond, dan is de serverregel
    // ("Showing X of Y matches") de waarheid — dan geen tweede getal ernaast.
    const onveranderd =
      brand === values.brand.trim() &&
      q === values.q.trim() &&
      str(fd.get("kelvin")) === values.kelvin.trim() &&
      str(fd.get("cri")) === values.cri.trim() &&
      str(fd.get("ip")) === values.ip.trim();
    // Zelfde ankerregel als de zoekopdracht: zonder merk of tekst valt er niets te tellen.
    if (onveranderd || (brand.length === 0 && q.length === 0)) {
      setLive(null);
      return;
    }
    const id = ++seq.current;
    const outcome = await callAction(() => countAction(fd), { path: "/catalog" });
    if (id !== seq.current) return; // ingehaald door een nieuwere telling
    if (outcome.kind === "value") {
      setLive(
        outcome.value.ok
          ? {
              kind: "count",
              total: outcome.value.total,
              verbreed: outcome.value.verbreed,
              herkend: outcome.value.herkend,
            }
          : { kind: "unavailable", detail: outcome.value.error },
      );
    } else if (outcome.kind === "signedOut") {
      setLive({ kind: "unavailable", detail: "session expired — log in again" });
    } else {
      setLive({
        kind: "unavailable",
        detail:
          outcome.kind === "failed" ? failureDetail(outcome.error) : outcome.href,
      });
    }
  }

  function scheduleCount() {
    if (!countAction) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(count, DEBOUNCE_MS);
  }

  return (
    <form
      ref={formRef}
      method="get"
      action="/catalog"
      className="flex flex-col gap-3"
      onInput={scheduleCount}
      // De select vuurt in sommige browsers alleen change, geen input.
      onChange={scheduleCount}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Brand" hint="We always have the brand — start there.">
          <select
            name="brand"
            defaultValue={values.brand}
            aria-label="Brand"
            data-testid="brand-select"
            className={selectClass}
          >
            <option value="">All brands</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Free text">
          <Input
            name="q"
            defaultValue={values.q}
            placeholder="e.g. SASSO 100 or article no. L360048"
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Color temp. (K)">
          <Input
            type="number"
            name="kelvin"
            defaultValue={values.kelvin}
            placeholder="e.g. 3000"
            inputMode="numeric"
          />
        </Field>
        <Field label="CRI (min.)">
          <Input
            type="number"
            name="cri"
            defaultValue={values.cri}
            placeholder="e.g. 90"
            inputMode="numeric"
          />
        </Field>
        <Field label="IP (min.)">
          <Input name="ip" defaultValue={values.ip} placeholder="e.g. IP44" />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">
          <IconSearch /> Search
        </Button>
        {/* De live teller. Juist óók zichtbaar als het getal groter is dan wat het
            resultaatplafond straks toont — dat getal is de prikkel om verder te typen.
            aria-live: de teller verandert zonder focuswissel, dus schermlezers horen
            hem alleen zo. */}
        {live && (
          <p
            data-testid="live-count"
            aria-live="polite"
            className="text-sm text-muted-foreground"
          >
            {live.kind === "count" ? (
              <>
                <span className="font-medium tabular-nums text-foreground">
                  {live.total}
                </span>{" "}
                {live.total === 1 ? "match" : "matches"}
                {/* Verbreed = geen enkel product bevat ÁLLE getypte woorden, dus dit getal
                    hoort bij de ruimere uitslag. Dat moet erbij staan: anders typ je een
                    woord extra, wordt de stapel groter, en klopt er in je hoofd niets meer
                    van. OCR-aanvragen zitten vol verschrijvingen, dus dit is geen
                    randgeval. */}
                {live.verbreed
                  ? " — no product has all your words; showing the broader match"
                  : " — press Search to show results"}
                {/* Raden dat je niet ziet, kun je niet corrigeren. Daarom staat hier wat er
                    uit de zoektekst gevist is; het bijbehorende specveld invullen wint
                    altijd, dus de gebruiker heeft er ook iets aan. */}
                {live.herkend.length > 0 && (
                  <span data-testid="live-herkend" className="block">
                    {live.herkend.map(omschrijfHerkenning).join(" · ")}
                  </span>
                )}
              </>
            ) : (
              <>live count unavailable: {live.detail}</>
            )}
          </p>
        )}
      </div>
    </form>
  );
}
