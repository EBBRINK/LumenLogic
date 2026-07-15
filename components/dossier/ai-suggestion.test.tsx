// White-box RSC-render/screenshottests van het AI suggestion-blok (B4/stap 8) op de
// review-kaarten: een gele review-kaart en een rood-kaart mét vangnet-suggesties,
// licht/donker × mobiel/desktop. Plus asserts op het label, de twee knoppen en de
// render-guard (defense in depth, ijzeren regel 4): in tender-fase verschijnt een
// suggestie van een ánder merk dan gevraagd nooit — bij 'awarded' wél.
import { page } from "vitest/browser";
import { afterEach, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { noopAction } from "@/lib/test-actions";
import { ReviewQueue } from "./review-queue";
import type { AiSuggestionRow, RedLinkLine, ReviewItem } from "./types";

const viewports = {
  mobile: { width: 375, height: 812 },
  desktop: { width: 1280, height: 800 },
} as const;

const geelSuggestion: AiSuggestionRow = {
  id: "ai1",
  productId: "p1",
  name: "SASSO 100 SQ SP CEIL 2700K",
  brandName: "XAL",
  articleCode: "L360-SASSO100-27",
  rationale:
    "Zelfde SASSO 100-familie in de gevraagde 2700K; overige specs identiek aan de aanvraag.",
};

const pending: ReviewItem[] = [
  {
    id: "s1",
    fixtureCode: "Lp301",
    brandText: "XAL",
    productText: "SASSO 100",
    status: "geel",
    reviewKind: "geel",
    deviations: [
      {
        field: "Kelvin",
        requested: 2700,
        delivered: 3000,
        verdict: "geel",
        note: "300K koeler dan gevraagd",
      },
    ],
    candidates: [],
    reqColor: null,
    aiSuggestions: [geelSuggestion],
  },
];

const rood: RedLinkLine[] = [
  {
    id: "r1",
    fixtureCode: "Lr701",
    brandText: "Flos",
    productText: "ORIONNOVA QX5",
    noMatchReason: "merk in catalogus, maar geen passend product gevonden",
    aiSuggestions: [
      {
        id: "ai2",
        productId: "p2",
        name: "Bellhop Glass C2",
        brandName: "Flos",
        articleCode: "F-BELL-C2",
        rationale: "Dichtstbijzijnde Flos-armatuur op vorm en lichtstroom.",
      },
    ],
  },
];

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background p-6 text-foreground">{children}</div>
  );
}

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

const ui = (
  <Screen>
    <ReviewQueue
      dossierId="d1"
      pending={pending}
      done={[]}
      rood={rood}
      phase="tender"
      decideAction={noopAction}
      linkAction={noopAction}
      aiUseAction={noopAction}
      aiDismissAction={noopAction}
    />
  </Screen>
);

for (const theme of ["light", "dark"] as const) {
  for (const [device, viewport] of Object.entries(viewports)) {
    test(`review-ai-suggestie (${theme}, ${device})`, async () => {
      await page.viewport(viewport.width, viewport.height);
      if (theme === "dark") document.documentElement.classList.add("dark");
      await renderServer(ui);
      // wachten op écht gerenderde inhoud — body alleen is te vroeg (async flush)
      await expect
        .element(page.getByText(/AI suggestion — found automatically/).first())
        .toBeInTheDocument();
      await page.screenshot({
        path: `./review-ai-suggestie.${theme}.${device}.test.png`,
      });
    });
  }
}

test("AI suggestion-blok: label, product, rationale en beide knoppen", async () => {
  await renderServer(ui);
  // eerst awaiten (render flusht async), daarna pas synchroon tellen
  await expect
    .element(page.getByText(/AI suggestion — found automatically/).first())
    .toBeInTheDocument();
  // duidelijk gelabeld als AI suggestion, op beide kaarttypes
  expect(page.getByText(/AI suggestion — found automatically/).elements().length).toBe(2);
  await expect
    .element(page.getByText("SASSO 100 SQ SP CEIL 2700K"))
    .toBeInTheDocument();
  await expect.element(page.getByText("L360-SASSO100-27")).toBeInTheDocument();
  await expect
    .element(page.getByText(/Zelfde SASSO 100-familie/))
    .toBeInTheDocument();
  expect(
    page.getByRole("button", { name: /Use as manual choice/ }).elements().length,
  ).toBe(2);
  expect(page.getByRole("button", { name: /^Dismiss$/ }).elements().length).toBe(2);
});

test("render-guard: in tender-fase geen suggestie van een ander merk; bij awarded wél", async () => {
  const anderMerk: ReviewItem = {
    ...pending[0],
    aiSuggestions: [
      {
        id: "ai3",
        productId: "p3",
        name: "Bellhop Glass C2",
        brandName: "Flos", // ≠ gevraagd merk XAL
        articleCode: "F-BELL-C2",
        rationale: "alternatief van een ander merk",
      },
    ],
  };
  await renderServer(
    <Screen>
      <ReviewQueue
        dossierId="d1"
        pending={[anderMerk]}
        done={[]}
        phase="tender"
        decideAction={noopAction}
        aiUseAction={noopAction}
        aiDismissAction={noopAction}
      />
    </Screen>,
  );
  // eerst wachten tot de kaart er staat — daarna pas de afwezigheid asserten
  await expect
    .element(page.getByText(/Same brand, deviation within the yellow margin/))
    .toBeInTheDocument();
  // defense in depth (regel 4): het blok verschijnt niet, ook al staat de suggestie er
  expect(page.getByText(/AI suggestion/).query()).toBeNull();
  expect(page.getByText(/alternatief van een ander merk/).query()).toBeNull();
});

test("render-guard: bij phase 'awarded' verschijnt het andere merk wel", async () => {
  const anderMerk: ReviewItem = {
    ...pending[0],
    aiSuggestions: [
      {
        id: "ai3",
        productId: "p3",
        name: "Bellhop Glass C2",
        brandName: "Flos",
        articleCode: "F-BELL-C2",
        rationale: "alternatief van een ander merk",
      },
    ],
  };
  await renderServer(
    <Screen>
      <ReviewQueue
        dossierId="d1"
        pending={[anderMerk]}
        done={[]}
        phase="awarded"
        decideAction={noopAction}
        aiUseAction={noopAction}
        aiDismissAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText(/alternatief van een ander merk/))
    .toBeInTheDocument();
});
