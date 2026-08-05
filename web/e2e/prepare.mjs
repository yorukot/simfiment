import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const resultRoot = resolve("test-results");
const target = resolve(resultRoot, "e2e-data");
if (dirname(target) !== resultRoot) throw new Error("Refusing to clean an unexpected E2E data path");
rmSync(target, { recursive: true, force: true });
