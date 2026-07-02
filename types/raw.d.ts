// Vite `?raw`-imports (o.a. migratie-SQL in de tests) leveren de bestandsinhoud als string.
declare module "*?raw" {
  const content: string;
  export default content;
}
