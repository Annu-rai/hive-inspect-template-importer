/**
 * Manual verification script: runs the parser (no DB, no server) against
 * the committed sample files and prints what it extracted. Used during
 * development to check that content survives import and that the
 * failure case behaves honestly. Run with: npm run check-import
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseSpectoraExport } from "../src/lib/importer/parser";

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function run(fileName: string) {
  console.log(`\n=== ${fileName} ===`);
  const filePath = path.join(__dirname, "..", "samples", fileName);
  const buf = readFileSync(filePath);
  const result = parseSpectoraExport(toArrayBuffer(buf), fileName);

  if (!result.ok) {
    console.log("FAILED (expected for the wrong-format sample):");
    console.log(" ", result.error);
    return;
  }

  console.log("Counts:", result.counts);
  console.log(`Warnings: ${result.warnings.length}`);
  for (const w of result.warnings) {
    console.log(`  [${w.kind}] ${w.location}: ${w.message}`);
  }
  console.log("\nSection/Item/Comment tree:");
  for (const s of result.sections) {
    console.log(`- ${s.name}`);
    for (const i of s.items) {
      console.log(`  - ${i.name} (${i.comments.length} comment${i.comments.length === 1 ? "" : "s"})`);
      for (const c of i.comments) {
        const plain = c.bodyHtml.replace(/<[^>]+>/g, "").slice(0, 70);
        console.log(`    - ${c.name}: "${plain}${plain.length === 70 ? "..." : ""}"`);
      }
    }
  }
}

run("spectora-export-internachi-residential.xls");
run("spectora-export-constructed-sample.xlsx");
run("spectora-export-wrong-format.html");
