// Offline curation tool: fetch every registered official source and store a plain-text snapshot.
// Snapshots are the evidence that official program facts were copied verbatim (see docs/PROGRAM_DATA.md).
// The app never fetches these pages at runtime (DEC-012).
//
// Usage: pnpm snapshot:sources
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const contentDir = fileURLToPath(new URL("../src/data/content/", import.meta.url));
const snapshotDir = `${contentDir}source-snapshots/`;

const NAMED_ENTITIES = { nbsp: " ", quot: '"', apos: "'", amp: "&", lt: "<", gt: ">", "#39": "'" };

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&(nbsp|quot|apos|amp|lt|gt);/g, (_, name) => NAMED_ENTITIES[name]);
}

/** Main page content only (skips navigation/footer), as normalized text lines. */
export function htmlToSnapshotText(html) {
  const start = html.indexOf('id="maincontent"');
  const end = html.indexOf('id="footer"', start);
  const main = start >= 0 ? html.slice(start, end > start ? end : undefined) : html;
  return decodeEntities(
    main
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(br|\/p|\/li|\/h[1-6]|\/div|\/tr|\/td|li|h[1-6])[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[   ]/g, " ")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('id="maincontent"'))
    .join("\n");
}

async function main() {
  const { sources } = JSON.parse(await readFile(`${contentDir}sources.json`, "utf8"));
  await mkdir(snapshotDir, { recursive: true });
  for (const source of sources) {
    const response = await fetch(source.url, { headers: { "User-Agent": "COLMAN-StudyMatch-curation" } });
    if (!response.ok) {
      throw new Error(`${source.id}: HTTP ${response.status} for ${source.url}`);
    }
    const text = htmlToSnapshotText(await response.text());
    await writeFile(`${snapshotDir}${source.id}.txt`, `${text}\n`, "utf8");
    console.log(`${source.id}: ${text.length} chars`);
  }
  console.log("Snapshots updated. Update retrieved_at in sources.json and re-run `pnpm test` to re-verify facts.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
