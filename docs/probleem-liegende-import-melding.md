# Probleem: de import zegt "mislukt" terwijl hij geslaagd is

Gemeld 21 jul 2026, productie, TNO-armaturenboek. Dit document is fase 1 van
`/goal liegende-import-melding`: eerst bewijzen wat er gebeurt, pas daarna een plan.

## 1. Wat er te zien was

Op `/projects/<id>` na een PDF-upload, tegelijk op één scherm:

- bovenaan de pagina: **"20 spec lines imported from the PDF and matched"**
  (`app/projects/[id]/page.tsx:55`, gevoed door de query-parameter `?pdf=20`)
- in de uploadkaart eronder, rood: **"Import failed — please try again."**
  (`components/dossier/pdf-upload-card.tsx:284`)

Events-tabel (read-only gelezen door de sprintmaster) — één `pdf_import`-event,
geen tweede poging, geen foutevent:

```
09:55:02  pdf_import  imported: 20 · route: leesroute · batches: 1
          truncated: 0 · costEur: 0.0216
```

De import slaagde dus: 20 regels weggeschreven, €0,0216 uitgegeven, en de UI
noemde het een mislukking.

## 2. Wat er precies in die `catch` terechtkomt — bewezen, niet gegokt

Het vermoeden uit de opdracht was: de action redirect naar dezelfde route, dus de
component blijft gemount en de foutstatus blijft staan. Dat klopt, maar het is
maar de hélft. De vraag "wat komt er in de catch terecht?" heeft een harder
antwoord, en die zit in de Next-runtime zelf.

Next 16.2.10 (`package.json`), `node_modules/next/dist/client/components/router-reducer/reducers/server-action-reducer.js`,
regels 215–234:

```js
if (redirectLocation !== undefined) {
    // If the action triggered a redirect, the action promise will be rejected with
    // a redirect so that it's handled by RedirectBoundary as we won't have a valid
    // action result to resolve the promise with. This will effectively reset the state of
    // the component that called the action as the error boundary will remount the tree.
    ...
    const redirectError = createRedirectErrorForAction(redirectHref, navigateType);
    reject(redirectError);          // ← internal redirect
} else {
    resolve(actionResult);          // ← alleen zónder redirect
}
```

**Een server action die `redirect()` aanroept, laat de client-side action-promise
niet resolven maar *rejecten*.** Het gegooide object is een gewone `Error` met
`message = "NEXT_REDIRECT"` en `digest = "NEXT_REDIRECT;push;/projects/<id>?pdf=20&run=…&route=leesroute;307;"`
(`redirect.js:42-50`), plus `error.handled = true` (`server-action-reducer.js:308-312`).

Dat is geen fout. Dat is Next' manier om te zeggen "ik navigeer nu".

De keten in `components/dossier/pdf-upload-card.tsx`:

| regel | wat er gebeurt |
|---|---|
| 276 | `await importAction({...})` |
| — | server: `app/projects/actions.ts:240` (leesroute) of `:279` (gewone route) roept `redirect()` aan |
| — | client-reducer: `reject(redirectError)` → de `await` op 276 **gooit** |
| 283 | `} catch {` — vangt álles, ongedifferentieerd |
| 284 | `setError("Import failed — please try again.")` |

De comment op regel 282 ("bij succes redirect de action zelf; deze component
verdwijnt dan") is op twee punten onjuist:

1. De redirect gaat naar **dezelfde route** (`/projects/<id>`, alleen andere
   query-parameters). Next doet dan een SPA-navigatie; de component blijft op
   dezelfde plek in de boom gemount en behoudt zijn `useState`. Er is geen
   remount die de foutstatus wist.
2. Zelfs bij een échte routewissel zou de comment niet kloppen als excuus voor
   een lege `catch`: het `reject` gebeurt sowieso, en de `setError` op 284 draait
   sowieso vóór/naast de navigatie.

De normale opvang hiervoor is de `RedirectBoundary` — die vangt de rejection als
hij tot een error boundary doorloopt. Hier gebeurt dat nooit, omdat de lege
`catch` op 283 hem opslokt.

Netto: **elke geslaagde import komt in de foutafhandeling terecht.** Dit is geen
randgeval van het TNO-boek; het gebeurt bij álle geslaagde PDF-imports. Dat het
nu pas opviel, komt doordat de rode regel voorheen door een échte routewissel
uit beeld verdween.

## 3. Geldt hetzelfde voor de OCR-tak?

**Ja, en daar is de schade groter.**

`finishOcrAction` (`app/projects/actions.ts:430`) redirect naar
`/projects/<id>?ocr=…&run=…` — dus ook hier rejectet de promise.

De aanroep staat op `pdf-upload-card.tsx:225`, binnen de `try { … } finally { pdf.destroy() }`
van `runOcrLoop`. Die `finally` vangt niets, dus de rejection loopt door naar
`onSubmit` regel 272 (`await runOcrLoop(...)`) en belandt in **dezelfde lege catch
op 283**. Gevolgen:

- de gebruiker ziet "Import failed — please try again." na een geslaagde OCR-run
  van soms honderden pagina's die echt geld heeft gekost;
- `setDone(...)` op regel 232-236 wordt **nooit** bereikt in productie. De
  eerlijke afrondmelding, inclusief de belangrijke variant
  *"OCR finished — N of M pages failed (see the events log)"*, is dode code op
  de deploy. Wie een OCR-run had met gefaalde pagina's, kreeg die telling niet
  te zien — alleen "Import failed";
- "please try again" is bij OCR actief schadelijk advies: opnieuw proberen kost
  opnieuw geld (het hervat-pad vangt veel op, maar de melding stuurt de
  gebruiker de verkeerde kant op).

De OCR-tak op regel 262 (`catch` rond `extractPagesFromPdf`) is **niet** besmet:
daar zit geen server action in, alleen browser-extractie. Die catch is wel te
breed (hij verklaart elke extractiefout tot "corrupted PDF"), maar hij liegt niet
over de uitkomst en valt buiten dit probleem.

`startOcrAction` en `ocrPageAction` redirecten niet — die geven `{error}` /
`{stopped}` terug en worden correct afgehandeld.

## 4. Hoe breed is het in de repo?

`grep -rn "NEXT_REDIRECT\|isRedirectError"` over de hele repo (buiten
`node_modules`) geeft **nul treffers** — er is nergens code die dit onderscheid
maakt. De vraag is dus: welke client components awaiten een redirectende action
binnen een `try/catch`?

Doorzocht: alle `"use client"`-bestanden in `app/` en `components/` die het woord
`catch` bevatten. Dat zijn er drie:

| bestand | catch rond | besmet? |
|---|---|---|
| `components/dossier/pdf-upload-card.tsx` | server actions (import + OCR-finish) | **JA** — regel 283 |
| `components/product/compare-tray.tsx:60,72` | `localStorage` lezen/schrijven | nee |
| `components/data/brand-message-block.tsx:31,37` | clipboard-API | nee |

Alle overige redirectende actions (er zijn er 22, zie `grep -rn "redirect("`)
worden aangeroepen via `<form action={…}>` of een server component. Daar handelt
Next de rejection zelf af en is er geen `catch` die hem inslikt.

**Conclusie: het is vandaag één bestand.** Maar het is een voetangel die elke
volgende client-side action-aanroep opnieuw kan raken, en niets in de repo
waarschuwt ervoor. Dat is een bewuste ontwerpvraag voor fase 2, geen
vanzelfsprekendheid.

## 5. Waarom hebben de tests dit niet gevangen?

`components/dossier/pdf-upload.test.tsx` test de flow uitgebreid — inclusief
"OCR finished — opening the results…" (regel 390, 439, 507). Die test slaagt,
terwijl productie die tekst nooit toont.

Oorzaak: de stubs in `lib/test-actions.ts` / `pdf-upload-test-stubs.tsx`
modelleren de succesroute als **`Promise<void>` die netjes resolvet**. De echte
Next-runtime rejectet daar. De test dekt dus een succespad dat in productie niet
bestaat.

Dit is de kern van de testschuld: er is geen enkele test die een succesvolle,
redirectende action nabootst zoals Next hem werkelijk aflevert.

## 6. Welke echte fouten moeten wél zichtbaar blijven?

De gebruiker moet een mislukte import kunnen onderscheiden van een geslaagde.
Alles hieronder moet ná de fix nog steeds zichtbaar zijn, en de meetlat voor
fase 2 is: geen van deze mag stil worden.

**A. Fouten die de action zelf teruggeeft (`{error}`) — nu al correct, moeten zo blijven:**
- `"Ongeldige import-aanroep."` (actions.ts:169)
- tekstlaag > 5 MB (actions.ts:173)
- `"OCR is unavailable: no AI key is configured…"` (actions.ts:322)
- `"This PDF has more than 500 pages."` (actions.ts:317)
- `"Unknown project."` (actions.ts:325)

**B. Client-side fouten vóór de action — moeten zichtbaar blijven:**
- bestand > 100 MB (card:250)
- onleesbare/beschadigde PDF (card:263)

**C. OCR-loop-uitkomsten — moeten zichtbaar blijven:**
- budget op / key weg (card:197-201), inclusief hoeveel pagina's bleven liggen
- per-tegel-fouten geteld in de afrondmelding (card:232-236) — die moet
  overigens *voor het eerst* zichtbaar wórden

**D. Fouten die nu ten onrechte niets zeggen en zichtbaar moeten wórden:**
- netwerkfout / server 500 tijdens de action (nu: "Import failed — please try
  again.", wat toevallig juist is, maar via dezelfde catch die ook succes vangt —
  dus onbetrouwbaar en niet te onderscheiden)
- ongeldig action-antwoord (`server-action-reducer.js:114-122` gooit
  `"An unexpected response was received from the server."`)
- een crash in `runOcrLoop` zelf (bv. rasterisatie die omvalt) — nu volledig
  onzichtbaar behalve als generieke "Import failed"

**Expliciet géén oplossing:** de melding onderdrukken, of de `catch` leegmaken.
Een geslaagde import die "mislukt" toont is fout; een mislukte import die zwijgt
is erger. De echte vraag voor fase 2 is niet "hoe onderdruk ik deze melding" maar
**"hoe weet deze UI het verschil tussen slagen en falen"**.

## 7. Samenvatting in één alinea

Een server action die `redirect()` aanroept, laat zijn client-side promise
*rejecten* met een `NEXT_REDIRECT`-error — dat is Next' navigatiesignaal, geen
fout. `pdf-upload-card.tsx:283` vangt dat met een lege `catch` en verklaart elke
geslaagde import (en elke geslaagde OCR-run) tot mislukking. Omdat de redirect
naar dezelfde route gaat, blijft de component gemount en blijft de rode regel
staan náást de groene succesmelding. De tests missen het omdat hun stubs de
succesroute als een nette `resolve` modelleren in plaats van als de `reject` die
Next werkelijk levert.
