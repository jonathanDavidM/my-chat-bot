/** Cross-platform copy of dist-embed/ → dist/embed/ */
import { cp, rm } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "../dist-embed");
const DEST = join(__dirname, "../dist/embed");

await rm(DEST, { recursive: true, force: true });
await cp(SRC, DEST, { recursive: true });
console.log(`Copied ${SRC} → ${DEST}`);
