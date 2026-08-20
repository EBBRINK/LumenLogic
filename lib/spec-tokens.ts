// Specwaarden herkennen in de vrije zoektekst.
//
// WAAROM DIT BESTAAT. De live teller (docs/goal-live-teller.md) legde bloot dat het
// klantvoorbeeld uit de demosessie niet werkt: wie "Entero 2700" typt, zoekt naar een
// productnaam die "2700" bevat — en die bestaat niet. De kleurtemperatuur staat bij Delta
// Light niet in de naam ("MOUNTING KIT ENTERO RD-S O.F.A.") maar in het veld `kelvin`.
// Resultaat: nul strenge treffers, terugval naar breed, en een getal dat omhoog gaat terwijl
// de gebruiker denkt te versmallen.
//
// Wat hier gebeurt: tokens die ondubbelzinnig een specwaarde zijn, worden uit de zoektekst
// gevist en als SPECFILTER toegepast in plaats van als naamwoord. Ze doen daarna niet meer
// mee in de tekstmatch. Omdat ze het bestaande SpecFilters-pad in gaan, erven ze meteen de
// regel die daar al geldt: ontbrekende data is geen afkeuring — een product zonder
// kelvin-waarde valt niet af, het komt in "Mogelijk — data onvolledig".
//
// DIT IS RADEN, EN DAT MOET JE ZIEN. Een geraden token is per definitie soms fout: "3000"
// kan een serienaam zijn. Daarom geeft deze functie terug wát hij herkende, zodat het scherm
// het kan tonen ("2700 read as colour temperature") en de gebruiker het kan corrigeren. Twee
// regels houden de schade klein:
//   • een EXPLICIET ingevuld specveld wint altijd van een geraden token;
//   • er wordt alleen geraden binnen plausibele grenzen (zie KELVIN_MIN/MAX).

/** Welke velden we uit de tekst kunnen vissen. Eén op één met `SpecFilters`. */
export type SpecVeld = "kelvin" | "cri" | "ip";

export type HerkendToken = {
  /** De tekst zoals de gebruiker hem typte ("2700K", "IP44"). */
  token: string;
  veld: SpecVeld;
  waarde: number;
  /**
   * Is deze waarde ook echt gebruikt? `false` als de gebruiker het bijbehorende specveld
   * zélf had ingevuld — dan wint dat, en zegt het scherm erbij dat het geraden token
   * genegeerd is. Het token verdwijnt in beide gevallen uit de tekstmatch: het was geen
   * naamwoord, ook niet als we de waarde niet overnemen.
   */
  toegepast: boolean;
};

export type SpecLezing = {
  /** De zoektekst zonder de herkende tokens. Dit is wat de tekstmatch nog te zien krijgt. */
  restTekst: string;
  herkend: HerkendToken[];
};

// Plausibele kleurtemperatuur in kelvin. Ondergrens 1800 (kaarslicht/amber), bovengrens 6500
// (daglicht). Bewust smal: het is de grens tussen "dit is ondubbelzinnig een kleurtemperatuur"
// en "dit kan van alles zijn". 1200 blijft dus tekst (dat is meestal een lumenwaarde), en een
// artikelnummer als 360048 valt er ook buiten.
const KELVIN_MIN = 1800;
const KELVIN_MAX = 6500;

// CRI loopt van 0 tot 100; onder de 50 komt in de praktijk niets voor dat je zou willen
// filteren, maar de grens hier is puur vormcontrole — de betekenis "minimaal" zit in de query.
const CRI_MAX = 100;

// IP-codes zijn twee cijfers (IP20, IP44, IP65). "IP6" of "IP440" is geen geldige code.
const IP_PATROON = /^ip[\s-]?(\d{2})$/i;
const CRI_PATROON = /^(?:cri|ra)[\s-]?(\d{1,3})$/i;
const KELVIN_MET_K = /^(\d{4})\s*k$/i;
const KAAL_GETAL = /^\d{3,4}$/;

function plausibeleKelvin(n: number): boolean {
  return n >= KELVIN_MIN && n <= KELVIN_MAX;
}

/**
 * Lees de specwaarden uit een vrije zoektekst.
 *
 * Zowel de aaneengeschreven vorm ("IP44", "2700K", "CRI90") als de vorm met spatie ("IP 44",
 * "CRI 90") wordt herkend; die laatste kost twee tokens en wordt daarom vooruitkijkend
 * gelezen. Een kaal getal telt alleen als kelvin binnen de plausibele grenzen.
 *
 * Deze functie is puur en weet niets van de database, het merk of de al ingevulde velden.
 * Het samenvoegen met expliciete specvelden gebeurt bij de aanroeper (lib/repo/products.ts),
 * zodat teller en lijst gegarandeerd dezelfde samenvoeging doen.
 */
export function leesSpecTokens(query: string): SpecLezing {
  const woorden = query.trim().split(/\s+/).filter((w) => w.length > 0);
  const rest: string[] = [];
  const herkend: HerkendToken[] = [];
  // Per veld houden we alleen de EERSTE lezing aan. Wie "2700 4000" typt, bedoelt geen twee
  // kleurtemperaturen; de tweede blijft dus gewoon tekst en valt vanzelf op in de lijst.
  const gevuld = new Set<SpecVeld>();

  const neem = (token: string, veld: SpecVeld, waarde: number): boolean => {
    if (gevuld.has(veld)) return false;
    gevuld.add(veld);
    herkend.push({ token, veld, waarde, toegepast: true });
    return true;
  };

  for (let i = 0; i < woorden.length; i++) {
    const w = woorden[i];
    const volgende = woorden[i + 1];

    // "IP 44" / "CRI 90" — prefix en getal apart getypt. Eerst proberen, anders zou "IP"
    // als tekstwoord blijven staan en de strenge AND-match onmogelijk maken.
    if (volgende && /^\d{1,3}$/.test(volgende)) {
      const prefix = w.toLowerCase();
      const n = Number.parseInt(volgende, 10);
      if (prefix === "ip" && volgende.length === 2 && neem(`${w} ${volgende}`, "ip", n)) {
        i++;
        continue;
      }
      if ((prefix === "cri" || prefix === "ra") && n <= CRI_MAX && neem(`${w} ${volgende}`, "cri", n)) {
        i++;
        continue;
      }
    }

    const ip = IP_PATROON.exec(w);
    if (ip && neem(w, "ip", Number.parseInt(ip[1], 10))) continue;

    const cri = CRI_PATROON.exec(w);
    if (cri) {
      const n = Number.parseInt(cri[1], 10);
      if (n <= CRI_MAX && neem(w, "cri", n)) continue;
    }

    const kelvinK = KELVIN_MET_K.exec(w);
    if (kelvinK) {
      const n = Number.parseInt(kelvinK[1], 10);
      if (plausibeleKelvin(n) && neem(w, "kelvin", n)) continue;
    }

    if (KAAL_GETAL.test(w)) {
      const n = Number.parseInt(w, 10);
      if (plausibeleKelvin(n) && neem(w, "kelvin", n)) continue;
    }

    rest.push(w);
  }

  return { restTekst: rest.join(" "), herkend };
}

/** Hoe het scherm een herkend token benoemt. Eén bron, voor de teller én het resultaatscherm. */
export const VELD_LABEL: Record<SpecVeld, string> = {
  kelvin: "colour temperature",
  cri: "CRI",
  ip: "IP rating",
};

/**
 * Hoe het scherm één herkend token verwoordt. Eén bron, want de live teller en het
 * resultaatscherm moeten dezelfde woorden gebruiken — anders lijkt het op twee verschillende
 * mechanismen terwijl het er één is.
 */
export function omschrijfHerkenning(h: HerkendToken): string {
  const kern = `${h.token} read as ${VELD_LABEL[h.veld]}`;
  // Niet toegepast = de gebruiker vulde het veld zelf in. Dat moet erbij, anders lijkt het
  // alsof de gok het overnam.
  return h.toegepast ? kern : `${kern} (your own value is used)`;
}
