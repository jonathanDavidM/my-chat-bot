/**
 * Pre-processes documents in server/docs/ into a single TypeScript file
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
  const { PDFParse } = require("pdf-parse");
  const data = await readFile(filePath);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
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

function cleanExtractedText(raw) {
  let text = raw.replace(/\r\n?/g, "\n");
  text = text.replace(/^-- \d+ of \d+ --\s*$/gm, "");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

async function build() {
  let content = "";

  try {
    const files = await readdir(DOCS_DIR);
    const supported = files.filter((f) => PARSERS[extname(f).toLowerCase()]);

    for (const file of supported) {
      const ext = extname(file).toLowerCase();
      const parser = PARSERS[ext];
      try {
        const raw = await parser(join(DOCS_DIR, file));
        const cleaned = cleanExtractedText(raw);
        content += `\n--- Document: ${file} ---\n${cleaned}\n`;
        console.log(`Processed: ${file} (${cleaned.length} chars)`);
      } catch (err) {
        console.error(`Failed to parse ${file}:`, err.message);
      }
    }
  } catch {
    console.log("No docs/ directory found, generating empty file");
  }

  const escaped = content.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
  const output = `// Auto-generated at build time. Do not edit manually.\nexport const COMPILED_DOCS = \`${escaped}\`;\n`;

  await writeFile(OUTPUT, output, "utf-8");
  console.log(`Written to ${OUTPUT}`);
}

build();
