// Het adres van Brink Licht zelf — de referentie waartegen we `brands.factory_distance_km`
// meten (sprint 1.7). Eén constante, geen geocoding, geen herrekenmechanisme: zonder
// kaartdienst is herrekenen per definitie handwerk, en een "herbereken"-knop zou theater
// zijn. Bewust een eigen bestand, niet lib/company.ts: er bestaat al een `organizations`-
// tabel, en "company" zou daar tegenaan lezen.
export const BRINK_ADDRESS = "Veldzigt 30A, 3454 PW Utrecht";

// Verhuis-werklijst — met de hand, na een adreswijziging hierboven. Elke afstand die dan
// nog een waarde heeft, is gemeten tegen het OUDE adres en moet opnieuw bepaald worden:
//
//   select id, name, factory_location, factory_distance_km
//     from brands where factory_distance_km is not null;
//
// Geen geocoding, dus geen automatische herberekening. Voor/ná de verhuizing is af te
// lezen uit het tijdstip van het event `brand_environment_changed` (dat draagt actor en
// tijdstip), niet uit een aparte stempelkolom.
