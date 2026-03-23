/**
 * Pre-processes all documents in server/docs/ into a single TypeScript file
 * that can be imported by the serverless function. Run at build time.
 */
import { readdir, readFile, writeFile } from "fs/promises";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, "../server/docs");
const OUTPUT = join(__dirname, "../server/src/knowledge/compiled-docs.ts");

async function parsePdf(filePath) {
  const pdf = require("pdf-parse");
  const buffer = await readFile(filePath);
  const data = await pdf(buffer);
  return data.text;
}

async function parseDocx(filePath) {
  const mammoth = require("mammoth");
  const buffer = await readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function parseText(filePath) {
  return readFile(filePath, "utf-8");
}

const PARSERS = {
  ".pdf": parsePdf,
  ".docx": parseDocx,
  ".doc": parseDocx,
  ".txt": parseText,
  ".md": parseText,
};

async function build() {
  let content = "";

  try {
    const files = await readdir(DOCS_DIR);
    const supported = files.filter((f) => PARSERS[extname(f).toLowerCase()]);

    for (const file of supported) {
      const ext = extname(file).toLowerCase();
      const parser = PARSERS[ext];
      try {
        const text = await parser(join(DOCS_DIR, file));
        content += `\n--- Document: ${file} ---\n${text.trim()}\n`;
        console.log(`Processed: ${file}`);
      } catch (err) {
        console.error(`Failed to parse ${file}:`, err.message);
      }
    }
  } catch {
    console.log("No docs/ directory found, generating empty file");
  }

  const escaped = content.replace(/`/g, "\\`").replace(/\$/g, "\\$");
  const output = `// Auto-generated at build time. Do not edit manually.\nexport const COMPILED_DOCS = \`${escaped}\`;\n`;

  await writeFile(OUTPUT, output, "utf-8");
  console.log(`Written to ${OUTPUT}`);
}

build();
