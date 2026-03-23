import { readdir, readFile } from "fs/promises";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");
const mammoth = require("mammoth");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DOCS_DIR = join(__dirname, "../../docs");

async function parsePdf(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const data = await pdf(buffer);
  return data.text;
}

async function parseDocx(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function parseText(filePath: string): Promise<string> {
  return readFile(filePath, "utf-8");
}

const PARSERS: Record<string, (path: string) => Promise<string>> = {
  ".pdf": parsePdf,
  ".docx": parseDocx,
  ".doc": parseDocx,
  ".txt": parseText,
  ".md": parseText,
};

export async function loadDocuments(): Promise<string> {
  try {
    const files = await readdir(DOCS_DIR);
    const supported = files.filter((f) => PARSERS[extname(f).toLowerCase()]);

    if (supported.length === 0) {
      console.log("No documents found in server/docs/");
      return "";
    }

    const sections: string[] = [];

    for (const file of supported) {
      const ext = extname(file).toLowerCase();
      const parser = PARSERS[ext];
      try {
        const content = await parser(join(DOCS_DIR, file));
        sections.push(`\n--- Document: ${file} ---\n${content.trim()}`);
        console.log(`Loaded document: ${file}`);
      } catch (err) {
        console.error(`Failed to parse ${file}:`, err);
      }
    }

    return sections.join("\n");
  } catch {
    console.log("No docs/ directory found, skipping document loading");
    return "";
  }
}
