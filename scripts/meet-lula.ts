// Zeven cellen (192 producten) kregen `onzeker` omdat de naam "Bracket" bevat en de bron ze zelf
// als accessoire-context vlagde. Is Lula een armatuurfamilie of een beugel? Kijken wat de
// catalogus zelf zegt.
//   bun --env-file=.env.branch scripts/meet-lula.ts
import { assertBranchDb, logGuard } from "./branch-guard";

async function main() {
  logGuard(await assertBranchDb(process.cwd()));
  const { db } = await import("@/db/client");
  const { products, brands } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rijen = await db
    .select({ merk: brands.name, naam: products.name })
    .from(products)
    .innerJoin(brands, eq(brands.id, products.brandId));

  const lula = rijen.filter((r) => /\blula\b/i.test(r.naam ?? ""));
  const metBracket = lula.filter((r) => /\bbracket\b/i.test(r.naam ?? ""));
  const zonder = lula.filter((r) => !/\bbracket\b/i.test(r.naam ?? ""));
  console.log(`Lula: ${lula.length} producten — mét 'Bracket' ${metBracket.length}, zonder ${zonder.length}`);
  console.log(`\n  zonder Bracket (is er een familie?):`);
  for (const n of [...new Set(zonder.map((r) => r.naam))].slice(0, 10)) console.log(`      ${n}`);
  console.log(`\n  mét Bracket:`);
  for (const n of [...new Set(metBracket.map((r) => r.naam))].slice(0, 6)) console.log(`      ${n}`);

  // Draagt 'Bracket' catalogusbreed een armatuur of een beugel?
  const bracket = rijen.filter((r) => /\bbracket\b/i.test(r.naam ?? ""));
  const perMerk = new Map<string, number>();
  for (const r of bracket) perMerk.set(r.merk ?? "?", (perMerk.get(r.merk ?? "?") ?? 0) + 1);
  console.log(`\n"bracket" catalogusbreed: ${bracket.length} — ${[...perMerk].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
  for (const n of [...new Set(bracket.filter((r) => !/\blula\b/i.test(r.naam ?? "")).map((r) => `${r.merk} · ${r.naam}`))].slice(0, 8))
    console.log(`      ${n}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
