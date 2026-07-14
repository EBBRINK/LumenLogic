// Vite `?raw`-imports (o.a. migratie-SQL in de tests) leveren de bestandsinhoud als string.
declare module "*?raw" {
  const content: string;
  export default content;
}

// Vite `?url`-imports (o.a. de fixture-PDF in lib/pdf/armaturenboek.test.ts) leveren
// een URL waarop de test het bestand kan ophalen.
declare module "*?url" {
  const url: string;
  export default url;
}
