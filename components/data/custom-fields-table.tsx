"use client";

// Beheerscherm-onderdelen voor eigen productvelden (sprint 1.8):
//   CatalogFieldsOverview — de bestaande catalogusvelden, read-only, ingeklapt per bucket.
//   CustomFieldsTable     — de eigen velden, met bewerken en archiveren.
//
// HET READ-ONLY OVERZICHT IS GEEN DECORATIE (plan §7). Het is de plek waar je ziet dat
// het veld dat je wilt toevoegen er al ís. Zonder dat lijstje wordt "Warranty (months)"
// een tweede keer aangemaakt, en een botsend genormaliseerd label maakt élk ingevuld
// merkbestand onbruikbaar (fase 1, val 1) — niet dit ene veld, alle bestanden.
//
// ARCHIVEREN TELT VERS. De teller in de tabel komt van de page-render en kan minuten oud
// zijn; de bevestiging haalt hem opnieuw op vóór hij een getal noemt. Waarden worden
// nooit gewist (dat zou een mass-update over productrijen zijn en de fingerprint-
// discipline breken) — de bevestiging zegt dat er ook bij.
//
// ⚠️ Server actions worden hier via callAction() geawait, nooit met een kale await in een
// try/catch: requireSession() redirect naar /login en dat komt binnen als een REJECTED
// promise met NEXT_REDIRECT. Een lege catch zou "uitgelogd" tonen als "gelukt".
import { useState, useTransition } from "react";
import { callAction } from "@/lib/next-action-result";
import type { Compleetheidsniveau } from "@/lib/field-catalog";
import {
  CustomFieldForm,
  type BucketOptie,
  type VeldFormAction,
} from "./custom-field-form";

export const FIELDS_PATH = "/data/fields";

export type CatalogusOverzichtBucket = {
  key: string;
  order: number;
  labelEn: string;
  fields: { key: string; labelEn: string; niveau: Compleetheidsniveau }[];
};

export type EigenVeldRij = {
  id: string;
  labelEn: string;
  instructionEn: string;
  niveau: Compleetheidsniveau;
  bucketKey: string;
  bucketOrder: number;
  bucketLabelEn: string;
  /** Aantal producten met een waarde op dit veld, ten tijde van de page-render. */
  productsWithValue: number;
  createdAt: string;
  archivedAt: string | null;
};

/** `void` in de union: een no-op server-action (screenshot-tests) past er dan in. */
export type TelActie = (
  id: string,
) => Promise<{ productsWithValue: number } | { error: string } | void>;
export type ArchiveerActie = (
  id: string,
) => Promise<{ ok: boolean } | { error: string } | void>;

const NIVEAU_STIJL: Record<Compleetheidsniveau, string> = {
  must: "bg-foreground/10 text-foreground",
  wanna: "bg-foreground/5 text-muted-foreground",
  nice: "bg-foreground/5 text-muted-foreground",
};

function NiveauBadge({ niveau }: { niveau: Compleetheidsniveau }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${NIVEAU_STIJL[niveau]}`}
    >
      {niveau}
    </span>
  );
}

const datum = (iso: string) => iso.slice(0, 10);

// ── Read-only: wat we al vragen ─────────────────────────────────────────────

export function CatalogFieldsOverview({
  buckets,
}: {
  buckets: CatalogusOverzichtBucket[];
}) {
  const totaal = buckets.reduce((n, b) => n + b.fields.length, 0);
  return (
    <section className="rounded-lg bg-card ring-1 ring-foreground/10">
      <details>
        <summary className="cursor-pointer list-none px-4 py-3 text-sm">
          <span className="font-medium">
            Fields we already ask for ({totaal})
          </span>
          <span className="ml-2 text-muted-foreground">
            — check here first: a duplicate column header makes every filled
            brand file unreadable.
          </span>
        </summary>
        <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2">
          {buckets.map((b) => (
            <div key={b.key} data-bucket={b.key}>
              <h3 className="text-sm font-medium">
                {b.order}. {b.labelEn}
              </h3>
              <ul className="mt-1 space-y-0.5">
                {b.fields.map((f) => (
                  <li
                    key={f.key}
                    className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground"
                  >
                    <span>{f.labelEn}</span>
                    <span className="shrink-0 opacity-70">{f.niveau}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

// ── Archiveren, met een verse telling ───────────────────────────────────────

function ArchiveerKnop({
  rij,
  telAction,
  archiveerAction,
}: {
  rij: EigenVeldRij;
  telAction: TelActie;
  archiveerAction: ArchiveerActie;
}) {
  const [open, setOpen] = useState(false);
  const [vers, setVers] = useState<number | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [bezig, start] = useTransition();

  const vraag = () => {
    setOpen(true);
    setVers(null);
    setMelding(null);
    start(async () => {
      const uitkomst = await callAction(() => telAction(rij.id), {
        path: FIELDS_PATH,
      });
      if (uitkomst.kind === "value") {
        const v = uitkomst.value;
        if (v && "productsWithValue" in v) setVers(v.productsWithValue);
        else if (v && "error" in v) setMelding(v.error);
        // Alleen de no-op action van de screenshot-test komt hier: de echte
        // countProductsWithValueAction heeft `void` niet in zijn returntype en levert
        // altijd een getal. Dan valt de bevestiging terug op de teller van de
        // page-render — hooguit één render oud, en beter dan een lege zin.
        else setVers(rij.productsWithValue);
        return;
      }
      setMelding(
        uitkomst.kind === "signedOut"
          ? "Your session expired — nothing was archived. Sign in again."
          : "Could not count the products with a value; nothing was archived.",
      );
    });
  };

  const archiveer = () => {
    start(async () => {
      const uitkomst = await callAction(() => archiveerAction(rij.id), {
        path: FIELDS_PATH,
      });
      if (uitkomst.kind === "value" || uitkomst.kind === "arrived") {
        setOpen(false);
        return;
      }
      setMelding(
        uitkomst.kind === "signedOut"
          ? "Your session expired — nothing was archived. Sign in again."
          : "Archiving failed; the field is unchanged.",
      );
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={vraag}
        className="text-xs text-muted-foreground underline hover:text-foreground"
      >
        Archive
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={`Archive ${rij.labelEn}`}
      className="rounded-md bg-muted px-3 py-2 text-xs"
    >
      <p className="font-medium text-foreground">
        Archive “{rij.labelEn}”?
      </p>
      <p className="mt-1 text-muted-foreground">
        {vers === null
          ? "Counting products with a value…"
          : `${vers} product(s) currently have a value for this field.`}{" "}
        Those values are kept, but they no longer count towards any scorecard and
        the column disappears from the brand Excel.
      </p>
      {melding && (
        <p role="alert" className="mt-1 text-status-amber-ink">
          {melding}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={archiveer}
          disabled={bezig || vers === null}
          className="inline-flex h-7 items-center rounded-md bg-foreground px-2.5 text-xs font-medium text-background disabled:opacity-50"
        >
          Archive field
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground underline hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── De tabel ────────────────────────────────────────────────────────────────

export function CustomFieldsTable({
  rows,
  buckets,
  createAction,
  updateAction,
  telAction,
  archiveerAction,
}: {
  rows: EigenVeldRij[];
  buckets: BucketOptie[];
  createAction: VeldFormAction;
  updateAction: VeldFormAction;
  telAction: TelActie;
  archiveerAction: ArchiveerActie;
}) {
  const [bewerkId, setBewerkId] = useState<string | null>(null);
  const actief = rows.filter((r) => r.archivedAt === null);
  const gearchiveerd = rows.filter((r) => r.archivedAt !== null);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 font-medium">Your own fields ({actief.length})</h2>
        {actief.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No own fields yet. Everything the brand Excel asks for comes from the
            catalogue above.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg bg-card ring-1 ring-foreground/10">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-foreground/10 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Label</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Level</th>
                  <th className="px-3 py-2 font-medium">Products with value</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {actief.map((r) => (
                  <tr
                    key={r.id}
                    data-veld={r.id}
                    className="border-b border-foreground/5 align-top last:border-b-0"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.labelEn}</div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.bucketOrder}. {r.bucketLabelEn}
                    </td>
                    <td className="px-3 py-2">
                      <NiveauBadge niveau={r.niveau} />
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.productsWithValue}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {datum(r.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-start gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setBewerkId(bewerkId === r.id ? null : r.id)
                          }
                          className="text-xs text-muted-foreground underline hover:text-foreground"
                        >
                          {bewerkId === r.id ? "Close" : "Edit"}
                        </button>
                        <ArchiveerKnop
                          rij={r}
                          telAction={telAction}
                          archiveerAction={archiveerAction}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {bewerkId !== null &&
        (() => {
          const r = actief.find((x) => x.id === bewerkId);
          if (!r) return null;
          return (
            <CustomFieldForm
              key={r.id}
              waarden={{
                id: r.id,
                labelEn: r.labelEn,
                instructionEn: r.instructionEn,
                niveau: r.niveau,
                bucketKey: r.bucketKey,
              }}
              buckets={buckets}
              submitAction={updateAction}
              onCancel={() => setBewerkId(null)}
            />
          );
        })()}

      {bewerkId === null && (
        <CustomFieldForm
          waarden={null}
          buckets={buckets}
          submitAction={createAction}
        />
      )}

      {gearchiveerd.length > 0 && (
        <section>
          <h2 className="mb-2 font-medium">
            Archived ({gearchiveerd.length})
          </h2>
          <p className="mb-2 text-sm text-muted-foreground">
            Not asked for any more and not counted anywhere. Values that brands
            already delivered are still stored.
          </p>
          <ul className="space-y-1">
            {gearchiveerd.map((r) => (
              <li
                key={r.id}
                data-veld={r.id}
                className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted-foreground"
              >
                <span className="line-through">{r.labelEn}</span>
                <span className="text-xs tabular-nums">
                  archived {datum(r.archivedAt!)} ·{" "}
                  {r.productsWithValue} product(s) with a value
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
