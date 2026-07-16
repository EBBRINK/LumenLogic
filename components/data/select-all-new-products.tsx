"use client";
// Kleine client-eiland bij het voorstel-scherm (besluit 4): nieuwe producten staan default
// UIT — een tikfout in een artikelcode maakt anders stil een dubbelproduct. Dat besluit is
// alleen houdbaar als een eerste levering van 400 rijen geen 400 kliks kost; deze knop is
// de tegenhanger ervan.
//
// Apart bestandje zodat template-proposal.tsx een RSC blijft (precedent: ImportProposal):
// het voorstel is data, niet interactie, en 400 productgroepen hoeven niet naar de browser
// om één vinkje te kunnen zetten.
import { Button } from "@/components/ui/button";

/** Sleutelprefix uit newProductSelectionKey() in lib/template-diff.ts (`np.r{rij}`).
 *  Hier gespiegeld omdat de knop op NAAM selecteert en niet op de diff — verandert het
 *  contract, dan breekt de test op de sleutel, niet stilletjes de knop. */
const NIEUW_PRODUCT_PREFIX = "np.r";

export function SelectAllNewProducts({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={(e) => {
        const form = e.currentTarget.closest("form");
        if (!form) return;
        for (const el of form.querySelectorAll<HTMLInputElement>(
          `input[type="checkbox"][name^="${NIEUW_PRODUCT_PREFIX}"]`,
        )) {
          // Geblokkeerde voorstellen (geen naam) hebben geen checkbox en zijn hier dus
          // per constructie onbereikbaar — de knop kan niets aanvinken wat niet mag.
          el.checked = true;
        }
      }}
    >
      Select all new products ({count})
    </Button>
  );
}
