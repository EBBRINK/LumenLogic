// TypeScript 7 is de native (Go) compiler: het npm-pakket `typescript` levert alleen
// nog de `tsc`-binary, géén JavaScript-API meer (lib/typescript.js is weg — Microsoft
// brengt de programmatic API terug in 7.1). typescript-eslint draait volledig op die
// oude API en crasht daarom al bij het inladen:
//
//   TypeError: Cannot read properties of undefined (reading 'Cjs')
//     at @typescript-eslint/typescript-estree/dist/create-program/shared.js
//
// Microsoft's overbrugging is `@typescript/typescript6`: TypeScript 6.0 onder een eigen
// pakketnaam (bin `tsc6`), zodat hij naast typescript@7 kan staan zonder bin-conflict.
// typescript-eslint moet die kopie dan wél vinden onder de naam `typescript`.
//
// Waarom een script en geen override: `typescript` is een *peer* dependency van
// typescript-estree, en bun kent geen nested overrides ("Bun currently does not support
// nested overrides") — een platte override zou óók node_modules/typescript vervangen,
// en dan verliest de editor de TS7-taalserver. Eén symlink op @typescript-eslint/-niveau
// dekt elk @typescript-eslint/*-pakket in één keer, want Node loopt bij `require` de
// node_modules-mappen van elke bovenliggende directory af.
//
// Verwijder dit script zodra typescript-eslint TypeScript 7 ondersteunt (7.1-API).
import { existsSync, mkdirSync, symlinkSync, lstatSync, unlinkSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const modules = join(root, "node_modules");
const source = join(modules, "@typescript", "typescript6");

// De pakketten in de lint-keten die de oude API daadwerkelijk aanroepen. `@typescript-eslint`
// als scope-map volstaat voor álle @typescript-eslint/*-pakketten; `ts-api-utils` is een
// losse root-afhankelijkheid van typescript-estree en heeft dus zijn eigen kopie nodig.
const consumers = ["@typescript-eslint", "ts-api-utils"];

// Productie-installs (zonder devDependencies): niets te doen, en zeker geen harde fout —
// dit script hangt in postinstall en mag `bun install` nooit laten klappen.
if (!existsSync(source)) process.exit(0);

const linked = [];
for (const consumer of consumers) {
  if (!existsSync(join(modules, consumer))) continue;
  const targetDir = join(modules, consumer, "node_modules");
  const target = join(targetDir, "typescript");
  mkdirSync(targetDir, { recursive: true });
  if (lstatSync(target, { throwIfNoEntry: false })) unlinkSync(target);
  symlinkSync(relative(targetDir, source), target, "junction");
  linked.push(consumer);
}

if (linked.length) {
  console.log(`${linked.join(", ")} → @typescript/typescript6 (TS7 heeft geen JS-API)`);
}

// En dan de tweede helft van dezelfde munt. `@typescript/typescript6` hangt zelf op
// `@typescript/old` (= npm:typescript@^6), en dát pakket declareert een bin `tsc`. Bun hoist
// die naar node_modules/.bin/tsc en overschrijft daarmee de `tsc` van typescript@7 — welke van
// de twee wint hangt af van de installvolgorde. Gemeten: ná een incrementele `bun install`
// gaf `bunx tsc --version` ineens 6.0.3. `next build` merkt er niets van (het resolvet
// `typescript/bin/tsc` als module, niet via .bin), maar `bun run typecheck` typecheckt dan
// stilletjes met de verkeerde compiler. Daarom zetten we .bin/tsc hier hard terug.
const realTsc = join(modules, "typescript", "bin", "tsc");
const binTsc = join(modules, ".bin", "tsc");
if (existsSync(realTsc) && existsSync(join(modules, ".bin"))) {
  if (lstatSync(binTsc, { throwIfNoEntry: false })) unlinkSync(binTsc);
  symlinkSync(relative(join(modules, ".bin"), realTsc), binTsc, "file");
  console.log("node_modules/.bin/tsc → typescript@7 (niet de tsc van @typescript/old)");
}
