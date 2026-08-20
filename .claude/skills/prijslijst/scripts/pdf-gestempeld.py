#!/usr/bin/env python3
"""Detecteert of een prijslijst-PDF een GESTEMPELDE herdruk is (stap 0 van /prijslijst).

    python3 scripts/pdf-gestempeld.py <bestand.pdf> [max_paginas]

Waarom dit bestaat
------------------
Een herdruk-PDF heeft nieuwe prijzen over de oude heen gedrukt, met een wit vlak ertussen. De
oude prijzen staan dan nog gewoon in de tekstlaag. Een normale extractie levert dus MEER rijen
op dan het document toont, met plausibele maar verouderde bedragen — en de rijtelling die de
skill voorschrijft vangt dat per definitie niet, want die telt te veel in plaats van te weinig.

Gemeten op Luceplan (nachtrun 11 aug 2026): een naïeve extractie gaf 1.264 "rijen" waarvan ~40 %
spoken; de tekstlaag gaf 1.101,00 waar zichtbaar 1.312,00 stond.

Wat het meet
------------
1. OVERLAP — tekstfragmenten die elkaar ruimtelijk overlappen maar verschillende tekst dragen.
   Dat is het directe bewijs van een stempel: twee waarden op dezelfde plek.
2. FONTSUBSETS — hoeveel verschillende ingebedde fonts dezelfde tekstsoort zetten. Een herdruk
   voegt vaak een nieuw subset toe voor de gestempelde laag.

Afhankelijkheid: pdfplumber (`pip install pdfplumber`).

Uitvoer: een oordeel op stdout en exitcode 0 (schoon) of 1 (gestempeld — verifieer tegen pixels).
"""

import sys
from collections import Counter, defaultdict

try:
    import pdfplumber
except ImportError:
    sys.exit("pdfplumber ontbreekt — installeer met: pip install pdfplumber")

# Twee tekstfragmenten heten overlappend als hun rechthoeken elkaar voor meer dan deze fractie
# van de kleinste van de twee bedekken. 0.5 is streng genoeg om regelafstand-ruis te weren en
# ruim genoeg om een stempel te vangen, die vrijwel exact op de oude waarde ligt.
OVERLAP_DREMPEL = 0.5

# Onder dit aantal overlappende paren noemen we een PDF schoon.
#
# ── De drempel is gemeten, niet gekozen ─────────────────────────────────────
# Gedraaid over de zes PDF's van de nachtrun (11 aug 2026), elk over hun VOLLE lengte:
#
#   luceplan-Prijslijst_2024-25.pdf        14.499 paren op 68 van 118 pagina's   GESTEMPELD
#   lodes-Prijslijst_Lodes_Outdoor_2026        4 paren op 2 pagina's             schoon
#   jacco-maris-Pricelist_NLBE_2026            1 paar  op 1 pagina               schoon
#   astro / hollands-licht / lodes-indoor      0 paren                           schoon
#
# Luceplan is onafhankelijk bevestigd gestempeld (de verwerkende agent vond er 410 dubbele
# prijsposities en verouderde bedragen in de tekstlaag). Tussen 4 en 14.499 zit drie ordes van
# grootte, dus de precieze drempel is niet kritisch — 10 ligt ruim in het gat.
GESTEMPELD_VANAF = 10

# ── En een tweede, schaalvaste maat: paren per pagina ────────────────────────
# De absolute drempel schaalt niet mee met de dikte van het document. Lodes-outdoor haalt 0,13
# valse paren per pagina; bij die ruisdichtheid tikt een schone catalogus van ~80 pagina's de 10
# aan en krijgt ten onrechte GESTEMPELD. Daarom telt de dichtheid mee.
#
# Gemeten dichtheden op de zes nachtrun-PDF's: luceplan 122,9 paren/pagina, lodes-outdoor 0,13,
# jacco-maris 0,01, de rest 0,00. Drie ordes ertussen, dus 1,0 ligt ruim in het gat.
GESTEMPELD_DICHTHEID = 1.0


def _overlapt(a, b) -> bool:
    """Overlappen twee woord-rechthoeken meer dan de drempel?"""
    x = min(a["x1"], b["x1"]) - max(a["x0"], b["x0"])
    y = min(a["bottom"], b["bottom"]) - max(a["top"], b["top"])
    if x <= 0 or y <= 0:
        return False
    snij = x * y
    opp_a = (a["x1"] - a["x0"]) * (a["bottom"] - a["top"])
    opp_b = (b["x1"] - b["x0"]) * (b["bottom"] - b["top"])
    kleinste = min(opp_a, opp_b)
    return kleinste > 0 and snij / kleinste > OVERLAP_DREMPEL


def analyseer(pad: str, max_paginas: int | None = None) -> int:
    paren = 0
    voorbeelden = []
    fonts: Counter = Counter()
    paginas_met_overlap = set()

    with pdfplumber.open(pad) as pdf:
        paginas = pdf.pages[:max_paginas] if max_paginas else pdf.pages
        totaal = len(paginas)
        for nr, pagina in enumerate(paginas, start=1):
            for teken in pagina.chars:
                fonts[teken.get("fontname", "?")] += 1

            woorden = pagina.extract_words(use_text_flow=False)
            # Emmers per rasterblok van 20pt: alleen woorden in hetzelfde blok kunnen elkaar
            # raken, wat de vergelijking lineair houdt in plaats van kwadratisch.
            emmers = defaultdict(list)
            for w in woorden:
                emmers[(int(w["x0"] // 20), int(w["top"] // 20))].append(w)

            for (bx, by), groep in emmers.items():
                buren = []
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        buren.extend(emmers.get((bx + dx, by + dy), []))
                for i, a in enumerate(groep):
                    for b in buren:
                        if a is b or a["text"] == b["text"]:
                            continue
                        if _overlapt(a, b):
                            paren += 1
                            paginas_met_overlap.add(nr)
                            if len(voorbeelden) < 8:
                                voorbeelden.append(
                                    f"p{nr}: {a['text']!r} ligt op {b['text']!r} "
                                    f"(x≈{a['x0']:.0f} y≈{a['top']:.0f})"
                                )
    paren //= 2  # elk paar wordt van beide kanten geteld

    print(f"bestand      : {pad}")
    print(f"pagina's     : {totaal}")
    print(f"fontsubsets  : {len(fonts)}")
    for naam, n in fonts.most_common(6):
        print(f"               {n:8d}x  {naam}")
    print(f"overlappende tekstparen : {paren} (op {len(paginas_met_overlap)} pagina's)")
    for v in voorbeelden:
        print(f"               {v}")

    if max_paginas:
        print()
        print(f"LET OP: alleen de eerste {max_paginas} pagina's zijn bekeken. Bij Luceplan zaten")
        print("  de stempels pas vanaf p15 en op 68 van de 118 pagina's — een steekproef van de")
        print("  eerste pagina's gaf daar ten onrechte 'schoon'. Draai zonder paginagrens.")

    dichtheid = paren / totaal if totaal else 0.0
    print(f"paren per pagina        : {dichtheid:.2f}")

    if paren >= GESTEMPELD_VANAF and dichtheid >= GESTEMPELD_DICHTHEID:
        print()
        print("OORDEEL: GESTEMPELD — er staat een tweede tekstlaag over de eerste.")
        print("  Vertrouw de tekstlaag NIET. Render elke pagina en verifieer elke prijs tegen")
        print("  de pixels vóór je hem overneemt; wat je niet kunt verifiëren gaat naar")
        print("  'controleren'. Meld het aantal geverifieerde en weggelaten rijen.")
        return 1

    print()
    print("OORDEEL: schoon — geen tweede tekstlaag gevonden.")
    print("  De gewone waarschuwing blijft staan: PDF-tabellen verliezen stiller rijen dan")
    print("  Excel, dus tel artikelnummer-patronen als verliescontrole.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    grens = int(sys.argv[2]) if len(sys.argv) > 2 else None
    sys.exit(analyseer(sys.argv[1], grens))
