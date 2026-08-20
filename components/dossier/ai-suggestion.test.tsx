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
    .element(page.getByText(/Same brand, deviation within the yellow margin/).first())
    .toBeInTheDocument();
  // defense in depth (regel 4): het blok verschijnt niet, ook al staat de suggestie er
  expect(page.getByText(/AI suggestion/).query()).toBeNull();
  expect(page.getByText(/alternatief van een ander merk/).query()).toBeNull();
});

// A14 (reviewzwerm 2.5a): de render-guard deed `.includes()`, dus een submerk waarvan
// het moedermerk een deelstring is glipte erdoorheen — "deltalight".includes("delta").
// Dat is precies het paar dat in een ERP-merkentabel staat, dus dit is de zaak waar de
// oude situatie gepakt zou zijn.
test("render-guard A14: 'Delta' toont geen 'Delta Light' in tender", async () => {
  const submerk: ReviewItem = {
    ...pending[0],
    brandText: "Delta",
    aiSuggestions: [
      {
        id: "ai4",
        productId: "p4",
        name: "CONCURRENT XYZ",
        brandName: "Delta Light", // submerk — bevat 'Delta', maar ís het niet
        articleCode: "DL-XYZ",
        rationale: "submerk moet in tender geweerd worden",
      },
    ],
  };
  await renderServer(
    <Screen>
      <ReviewQueue
        dossierId="d1"
        pending={[submerk]}
        done={[]}
        phase="tender"
        decideAction={noopAction}
        aiUseAction={noopAction}
        aiDismissAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText(/Same brand, deviation within the yellow margin/).first())
    .toBeInTheDocument();
  expect(page.getByText(/AI suggestion/).query()).toBeNull();
  expect(page.getByText(/submerk moet in tender geweerd worden/).query()).toBeNull();
});

// De tegenproef bij A14: gelijkheid mag geen legitieme match slopen. De normalisatie
// blijft doen wat ze deed — hoofdletters, spaties en streepjes tellen niet mee.
test("render-guard A14: schrijfwijze-variant van hetzelfde merk blijft wél zichtbaar", async () => {
  const zelfdeMerk: ReviewItem = {
    ...pending[0],
    brandText: "LEDS-C4",
    aiSuggestions: [
      {
        id: "ai5",
        productId: "p5",
        name: "AFRODITA RECESSED",
        brandName: "LedsC4", // andere schrijfwijze, hetzelfde merk
        articleCode: "LC4-AFR",
        rationale: "zelfde merk, andere schrijfwijze",
      },
    ],
  };
  await renderServer(
    <Screen>
      <ReviewQueue
        dossierId="d1"
        pending={[zelfdeMerk]}
        done={[]}
        phase="tender"
        decideAction={noopAction}
        aiUseAction={noopAction}
        aiDismissAction={noopAction}
      />
    </Screen>,
  );
  await expect
    .element(page.getByText(/zelfde merk, andere schrijfwijze/))
    .toBeInTheDocument();
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
