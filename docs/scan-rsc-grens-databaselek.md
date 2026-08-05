# Scan: server/client-grens en databaselek-risico

*Datum: 5 augustus 2026 — snelle scan tijdens Timo's leersessie (blok 3, React Server Components), uitgevoerd door Claude op verzoek van Timo. Geen volledige security-audit.*

## Vraag

Lekt er databasecode of -configuratie naar de browser via client components?

## Aanpak

Drie greps over `app/`, `components/` en `lib/`:

1. Client components (`"use client"`) die iets uit `@/db` of Drizzle importeren
2. `NEXT_PUBLIC_`-variabelen (gaan per definitie naar de browser)
3. `DATABASE_URL`-verwijzingen in client-bestanden

## Bevindingen

| Check | Resultaat |
|---|---|
| Client components met db-import | 2 hits, beide onschuldig (zie onder) |
| `NEXT_PUBLIC_`-variabelen | geen |
| `DATABASE_URL` in client-bestanden | geen |

De twee hits — `components/admin/brand-form.tsx` en `components/admin/brand-delete-block.tsx` — importeren uitsluitend een **type**:

```ts
import type { BrandLifecycle } from "@/db/schema";
```

`import type` wordt bij het bouwen volledig weggegooid; er komt geen runtime-databasecode in de browser-bundel. Dit is zelfs het aanbevolen patroon (één bron van waarheid voor types, van schema tot formulier).

## Conclusie

Geen aanwijzingen voor databaselek over de RSC-grens. De server/client-splitsing wordt correct gebruikt: pagina's lezen data server-side, alleen interactieve componenten zijn client.

## Niet gecheckt (bewust buiten scope)

- **Autorisatie**: checkt elke server action / route wie de aanroeper is (Better Auth)? Dit is de logische vervolg-scan.
- Rate limiting, input-validatie, CSRF-aspecten van server actions
- Dependencies/supply chain
