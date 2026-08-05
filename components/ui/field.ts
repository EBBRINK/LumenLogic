// Gedeelde invoertokens — één bron van waarheid voor élk formulierveld.
//
// WAAROM DIT BESTAND BESTAAT (reviewzwerm 2.5a, B9/B10). `components/ui/input.tsx` stond
// op de kit-maten (44px, radius 6px, grijs vlak, ring rgba(45,90,140,.1)), maar er is geen
// bouwsteen voor `<select>` en `<textarea>`. Gevolg: 26 velden droegen een eigen,
// handgeschreven klassenreeks op 32/36px — tegen besluit **O9** in, dat `formuliervelden`
// letterlijk in de 44px-lijst noemt — en zeven daarvan sleepten de afgeschafte
// shadcn-resten mee (`dark:bg-input/30`, focus-halo `ring-ring/50`), waardoor er twee
// verschillende focusstijlen naast elkaar stonden.
//
// Een volwaardig `<Select>`-component was de duurdere route en lost hetzelfde op: de
// tokens moeten hoe dan ook op één plek staan. Dit is die plek. Een native `<select>` of
// `<textarea>` pakt `veldClass`/`tekstvakClass`; `Input` is er de component-verpakking van.
//
// DESIGN.md §6 "Invoer": achtergrond #F5F7FA (dark #2A3145 via --muted, §3), rand 1px
// #D0D6E0 (--input), radius 6px (--radius-lg), padding 12x14px, focus = wit vlak + rand
// --ring + ring `0 0 0 3px rgba(45,90,140,.1)` = `ring-3 ring-ring/10`.
//
// Wijzig je hier iets, dan wijzigt élk veld mee. Dat is de bedoeling; zet de reden erbij.

/** Alles behalve hoogte en padding — de eigenschappen die veld én tekstvak delen. */
const VELD_TOKENS =
  "rounded-lg border border-input bg-muted transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/10 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40";

/**
 * Eén regel hoog veld: `<input>` en `<select>`. 44px (`h-11`) is besluit O9 —
 * niet naar h-8/h-9 terugbrengen omdat het "in een toolbar staat"; de compacte
 * uitzondering in O9 gaat over **knop**maten, niet over velden.
 *
 * Tekstmaat blijft `text-base` op mobiel (16px voorkomt de iOS-focuszoom) en zakt op
 * md naar 14px; de kit zegt 15px, zie open vraag V10 in het 2.0b-plan.
 *
 * Breedte staat er bewust NIET in: een veld in een toolbar is `w-auto`, een veld in een
 * formulier `w-full`. De aanroeper bepaalt dat.
 */
export const veldClass = `h-11 px-3.5 py-1 text-base md:text-sm ${VELD_TOKENS}`;

/**
 * Meerregelig veld: `<textarea>`. Geen vaste hoogte — O9's 44px slaat op de tastbare
 * regelhoogte van een enkelvoudig veld; een tekstvak groeit met `rows`.
 */
export const tekstvakClass = `px-3.5 py-2.5 text-base md:text-sm ${VELD_TOKENS}`;
