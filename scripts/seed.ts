/**
 * Seeds the database with the committed sample Spectora export so the
 * deployed app opens with something to explore, per the brief. Safe to
 * run multiple times: it skips seeding if a template imported from the
 * sample file already exists.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).
 * Run with: npm run seed
 */
import { config } from "dotenv";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseSpectoraExport } from "../src/lib/importer/parser";

if (existsSync(path.join(__dirname, "..", ".env.local"))) {
  config({ path: path.join(__dirname, "..", ".env.local") });
} else {
  config();
}

const SAMPLE_FILE = "spectora-export-sample.xlsx";

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and fill them in first."
    );
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: existingJob } = await db
    .from("import_jobs")
    .select("id, template_id")
    .eq("file_name", SAMPLE_FILE)
    .eq("status", "succeeded")
    .maybeSingle();

  if (existingJob?.template_id) {
    console.log(`Sample template already seeded (template_id=${existingJob.template_id}). Skipping.`);
    return;
  }

  const filePath = path.join(__dirname, "..", "samples", SAMPLE_FILE);
  const buf = readFileSync(filePath);
  const result = parseSpectoraExport(toArrayBuffer(buf), SAMPLE_FILE);
  if (!result.ok) {
    console.error("Sample file failed to parse:", result.error);
    process.exit(1);
  }

  const { data: template, error: templateErr } = await db
    .from("templates")
    .insert({
      name: "InterNACHI Residential (sample)",
      description: `Seeded from ${SAMPLE_FILE}`,
      origin: "import",
    })
    .select()
    .single();
  if (templateErr) throw templateErr;

  for (let sIdx = 0; sIdx < result.sections.length; sIdx++) {
    const section = result.sections[sIdx];
    const { data: sectionRow, error: sectionErr } = await db
      .from("sections")
      .insert({ template_id: template.id, name: section.name, sort_order: sIdx })
      .select()
      .single();
    if (sectionErr) throw sectionErr;

    for (let iIdx = 0; iIdx < section.items.length; iIdx++) {
      const item = section.items[iIdx];
      const { data: itemRow, error: itemErr } = await db
        .from("items")
        .insert({ section_id: sectionRow.id, name: item.name, sort_order: iIdx })
        .select()
        .single();
      if (itemErr) throw itemErr;

      if (item.comments.length) {
        const { error: commentsErr } = await db.from("comments").insert(
          item.comments.map((c, cIdx) => ({
            item_id: itemRow.id,
            name: c.name,
            body_html: c.bodyHtml,
            comment_type: c.commentType,
            sort_order: cIdx,
          }))
        );
        if (commentsErr) throw commentsErr;
      }
    }
  }

  const { data: job, error: jobErr } = await db
    .from("import_jobs")
    .insert({
      template_id: template.id,
      file_name: SAMPLE_FILE,
      status: "succeeded",
      sections_count: result.counts.sections,
      items_count: result.counts.items,
      comments_count: result.counts.comments,
      warnings: result.warnings,
    })
    .select()
    .single();
  if (jobErr) throw jobErr;

  await db.from("templates").update({ source_import_id: job.id }).eq("id", template.id);

  console.log(
    `Seeded template "${template.name}" (${template.id}) with ${result.counts.sections} sections, ${result.counts.items} items, ${result.counts.comments} comments.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
