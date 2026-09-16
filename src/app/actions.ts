"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { parseSpectoraExport } from "@/lib/importer/parser";
import { sanitizeCommentHtml } from "@/lib/importer/sanitize";
import type {
  Template,
  TemplateWithTree,
  ImportJob,
  ImportWarning,
} from "@/lib/types";

export async function listTemplates(): Promise<Template[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("templates")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Template[];
}

export async function getTemplateTree(
  templateId: string
): Promise<TemplateWithTree | null> {
  const db = getSupabaseAdmin();

  const { data: template, error: templateErr } = await db
    .from("templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  if (templateErr) throw new Error(templateErr.message);
  if (!template) return null;

  const { data: sections, error: sectionsErr } = await db
    .from("sections")
    .select("*")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });
  if (sectionsErr) throw new Error(sectionsErr.message);

  const sectionIds = (sections ?? []).map((s) => s.id);
  const { data: items, error: itemsErr } = sectionIds.length
    ? await db
        .from("items")
        .select("*")
        .in("section_id", sectionIds)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };
  if (itemsErr) throw new Error(itemsErr.message);

  const itemIds = (items ?? []).map((i) => i.id);
  const { data: comments, error: commentsErr } = itemIds.length
    ? await db
        .from("comments")
        .select("*")
        .in("item_id", itemIds)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };
  if (commentsErr) throw new Error(commentsErr.message);

  const commentsByItem = new Map<string, typeof comments>();
  for (const c of comments ?? []) {
    const list = commentsByItem.get(c.item_id) ?? [];
    list.push(c);
    commentsByItem.set(c.item_id, list);
  }
  const itemsBySection = new Map<string, (typeof items)>();
  for (const i of items ?? []) {
    const list = itemsBySection.get(i.section_id) ?? [];
    list.push(i);
    itemsBySection.set(i.section_id, list);
  }

  return {
    ...(template as Template),
    sections: (sections ?? []).map((s) => ({
      ...s,
      items: (itemsBySection.get(s.id) ?? []).map((i) => ({
        ...i,
        comments: commentsByItem.get(i.id) ?? [],
      })),
    })),
  };
}

export async function getImportJob(id: string): Promise<ImportJob | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("import_jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ImportJob | null;
}

export interface ImportOutcome {
  ok: boolean;
  templateId: string | null;
  importJobId: string;
  error?: string;
  counts?: { sections: number; items: number; comments: number };
  warnings?: ImportWarning[];
}

export async function importSpectoraFile(
  formData: FormData
): Promise<ImportOutcome> {
  const db = getSupabaseAdmin();
  const file = formData.get("file") as File | null;
  const templateNameOverride = (formData.get("templateName") as string) || "";

  if (!file) {
    throw new Error("No file was provided.");
  }

  const buffer = await file.arrayBuffer();
  const result = parseSpectoraExport(buffer, file.name);

  if (!result.ok) {
    const { data: job, error: jobErr } = await db
      .from("import_jobs")
      .insert({
        file_name: file.name,
        status: "failed",
        error: result.error,
      })
      .select()
      .single();
    if (jobErr) throw new Error(jobErr.message);
    return { ok: false, templateId: null, importJobId: job.id, error: result.error };
  }

  const templateName = templateNameOverride || result.templateNameGuess;

  const { data: template, error: templateErr } = await db
    .from("templates")
    .insert({
      name: templateName,
      description: `Imported from ${file.name}`,
      origin: "import",
    })
    .select()
    .single();
  if (templateErr) throw new Error(templateErr.message);

  for (let sIdx = 0; sIdx < result.sections.length; sIdx++) {
    const section = result.sections[sIdx];
    const { data: sectionRow, error: sectionErr } = await db
      .from("sections")
      .insert({
        template_id: template.id,
        name: section.name,
        sort_order: sIdx,
      })
      .select()
      .single();
    if (sectionErr) throw new Error(sectionErr.message);

    for (let iIdx = 0; iIdx < section.items.length; iIdx++) {
      const item = section.items[iIdx];
      const { data: itemRow, error: itemErr } = await db
        .from("items")
        .insert({
          section_id: sectionRow.id,
          name: item.name,
          sort_order: iIdx,
        })
        .select()
        .single();
      if (itemErr) throw new Error(itemErr.message);

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
        if (commentsErr) throw new Error(commentsErr.message);
      }
    }
  }

  const { data: job, error: jobErr } = await db
    .from("import_jobs")
    .insert({
      template_id: template.id,
      file_name: file.name,
      status: "succeeded",
      sections_count: result.counts.sections,
      items_count: result.counts.items,
      comments_count: result.counts.comments,
      warnings: result.warnings,
    })
    .select()
    .single();
  if (jobErr) throw new Error(jobErr.message);

  await db
    .from("templates")
    .update({ source_import_id: job.id })
    .eq("id", template.id);

  revalidatePath("/");

  return {
    ok: true,
    templateId: template.id,
    importJobId: job.id,
    counts: result.counts,
    warnings: result.warnings,
  };
}

export async function importSpectoraFileAction(
  _prevState: ImportOutcome | null,
  formData: FormData
): Promise<ImportOutcome> {
  return importSpectoraFile(formData);
}

export async function duplicateTemplate(templateId: string): Promise<string> {
  const db = getSupabaseAdmin();
  const tree = await getTemplateTree(templateId);
  if (!tree) throw new Error("Template not found.");

  const { data: copy, error: copyErr } = await db
    .from("templates")
    .insert({
      name: `Copy of ${tree.name}`,
      description: tree.description,
      origin: "copy",
      source_template_id: tree.id,
    })
    .select()
    .single();
  if (copyErr) throw new Error(copyErr.message);

  for (const section of tree.sections) {
    const { data: sectionRow, error: sectionErr } = await db
      .from("sections")
      .insert({
        template_id: copy.id,
        name: section.name,
        sort_order: section.sort_order,
      })
      .select()
      .single();
    if (sectionErr) throw new Error(sectionErr.message);

    for (const item of section.items) {
      const { data: itemRow, error: itemErr } = await db
        .from("items")
        .insert({
          section_id: sectionRow.id,
          name: item.name,
          sort_order: item.sort_order,
        })
        .select()
        .single();
      if (itemErr) throw new Error(itemErr.message);

      if (item.comments.length) {
        const { error: commentsErr } = await db.from("comments").insert(
          item.comments.map((c) => ({
            item_id: itemRow.id,
            name: c.name,
            body_html: c.body_html,
            comment_type: c.comment_type,
            sort_order: c.sort_order,
          }))
        );
        if (commentsErr) throw new Error(commentsErr.message);
      }
    }
  }

  revalidatePath("/");
  return copy.id;
}

export async function updateTemplateName(id: string, name: string) {
  const db = getSupabaseAdmin();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Template name cannot be empty.");
  const { error } = await db.from("templates").update({ name: trimmed }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
  revalidatePath(`/templates/${id}`);
}

export async function updateSectionName(id: string, templateId: string, name: string) {
  const db = getSupabaseAdmin();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Section name cannot be empty.");
  const { error } = await db.from("sections").update({ name: trimmed }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/templates/${templateId}`);
}

export async function updateItemName(id: string, templateId: string, name: string) {
  const db = getSupabaseAdmin();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Item name cannot be empty.");
  const { error } = await db.from("items").update({ name: trimmed }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/templates/${templateId}`);
}

export async function updateComment(
  id: string,
  templateId: string,
  fields: { name?: string; bodyHtml?: string }
) {
  const db = getSupabaseAdmin();
  const update: Record<string, string> = {};
  if (fields.name !== undefined) {
    const trimmed = fields.name.trim();
    if (!trimmed) throw new Error("Comment name cannot be empty.");
    update.name = trimmed;
  }
  if (fields.bodyHtml !== undefined) {
    const { html } = sanitizeCommentHtml(fields.bodyHtml, "(edit)");
    update.body_html = html;
  }
  const { error } = await db.from("comments").update(update).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/templates/${templateId}`);
}
