import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageDirectory = dirname(require.resolve("@material-symbols/font-400/package.json"));
const declaration = await readFile(resolve(packageDirectory, "index.d.ts"), "utf8");
const names = [...declaration.matchAll(/^\s+"([a-z0-9_]+)",?$/gm)]
  .map((match) => match[1])
  .filter(Boolean)
  .sort((left, right) => left.localeCompare(right, "en"));

if (names.length < 1_000) {
  throw new Error(`Expected the complete Material Symbols registry, found ${names.length} names.`);
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputs = [
  resolve(scriptDirectory, "../src/components/ui/material_icon_names.txt"),
  resolve(scriptDirectory, "../../internal/service/material_icon_names.txt"),
];
await Promise.all(outputs.map((output) => writeFile(output, `${names.join("\n")}\n`)));
console.log(`Wrote ${names.length} Material Symbol names to ${outputs.length} registries.`);
