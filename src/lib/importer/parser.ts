import * as XLSX from "xlsx";
import { sanitizeCommentHtml } from "./sanitize";
import type { ImportWarning } from "@/lib/types";

export interface ParsedComment {
  name: string;
  bodyHtml: string;
  commentType: string | null;
}

export interface ParsedItem {
  name: string;
  comments: ParsedComment[];
}

export interface ParsedSection {
  name: string;
  items: ParsedItem[];
}

export interface ParseSuccess {
  ok: true;
  templateNameGuess: string;
  sections: ParsedSection[];
  warnings: ImportWarning[];
  counts: { sections: number; items: number; comments: number };
}

export interface ParseFailure {
  ok: false;
  error: string;
}

export type ParseResult = ParseSuccess | ParseFailure;

/**
 * Canonical field -> accepted header spellings (case/whitespace-insensitive).
 * Spectora's exact header text is unknown to us (see NOTES.md) so this is
 * deliberately liberal; unmatched columns are reported, never silently
 * merged into the wrong field.
 */
const HEADER_SYNONYMS: Record<string, string[]> = {
  section: ["section", "section name"],
  item: ["item", "item name", "component", "sub-item"],
  commentName: ["comment name", "comment title", "library comment", "comment"],
  commentText: [
    "comment text",
    "text",
    "narrative",
    "comment body",
    "html",
    "description",
  ],
  commentType: ["type", "comment type", "severity", "rating", "condition"],
  recommendation: ["recommendation", "recommended action", "action"],
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    // Spectora appends explanatory annotations to some headers, e.g.
    // "Comment Type (info, limit, defect)" or "Recommendation (from list)".
    // Strip a trailing "(...)" before matching so these still resolve.
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function matchHeader(h: string): string | null {
  const norm = normalizeHeader(h);
  for (const [canonical, synonyms] of Object.entries(HEADER_SYNONYMS)) {
    if (synonyms.includes(norm)) return canonical;
  }
  return null;
}

function cell(row: unknown[], idx: number | undefined): string {
  if (idx === undefined) return "";
  const v = row[idx];
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

const MAX_SHEET_ROWS = 20000;

export function parseSpectoraExport(
  data: ArrayBuffer,
  fileName: string
): ParseResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(data, { type: "array" });
  } catch {
    return {
      ok: false,
      error:
        "This file could not be read as a spreadsheet (.xlsx/.xls/.csv). Make sure you're uploading the file from Spectora's \"Export to spreadsheet\" option, not the plain-text export.",
    };
  }

  if (!workbook.SheetNames.length) {
    return { ok: false, error: "The spreadsheet has no sheets." };
  }

  const warnings: ImportWarning[] = [];

  if (workbook.SheetNames.length > 1) {
    warnings.push({
      location: "(file)",
      kind: "extra-sheet",
      message: `The file has ${workbook.SheetNames.length} sheets. Only the first sheet ("${workbook.SheetNames[0]}") was imported; the others were not read.`,
    });
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });

  if (rows.length < 2) {
    return {
      ok: false,
      error:
        "The spreadsheet has a header row but no data rows, or is empty.",
    };
  }

  if (rows.length - 1 > MAX_SHEET_ROWS) {
    return {
      ok: false,
      error: `The spreadsheet has ${
        rows.length - 1
      } data rows, which is more than this importer supports (${MAX_SHEET_ROWS}).`,
    };
  }

  const headerRow = rows[0].map((h) => String(h ?? ""));
  const colIndex: Record<string, number> = {};
  const unrecognizedColumns: { name: string; nonEmptyCount: number }[] = [];

  headerRow.forEach((h, idx) => {
    if (!h.trim()) return;
    const canonical = matchHeader(h);
    if (canonical) {
      if (colIndex[canonical] !== undefined) {
        warnings.push({
          location: "(file)",
          kind: "duplicate-column",
          message: `Column "${h}" (column ${idx + 1}) duplicates "${
            headerRow[colIndex[canonical]]
          }" for the same field; only the first was used.`,
        });
        return;
      }
      colIndex[canonical] = idx;
    } else {
      let nonEmptyCount = 0;
      for (let r = 1; r < rows.length; r++) {
        if (String(rows[r][idx] ?? "").trim()) nonEmptyCount++;
      }
      if (nonEmptyCount > 0) unrecognizedColumns.push({ name: h, nonEmptyCount });
    }
  });

  if (colIndex.section === undefined && colIndex.commentText === undefined) {
    return {
      ok: false,
      error:
        'Could not find a "Section" or "Comment Text" column in the header row. This doesn\'t look like a Spectora "Export to spreadsheet → Export HTML Text" file. Found columns: ' +
        headerRow.filter((h) => h.trim()).join(", "),
    };
  }

  for (const col of unrecognizedColumns) {
    warnings.push({
      location: "(file)",
      kind: "unrecognized-column",
      message: `Column "${col.name}" was not recognized and was not imported (${col.nonEmptyCount} non-empty cell${col.nonEmptyCount === 1 ? "" : "s"}).`,
    });
  }

  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection | null = null;
  let currentItem: ParsedItem | null = null;
  let lastSectionName = "";
  let lastItemName = "";

  const getOrCreateSection = (name: string): ParsedSection => {
    let s = sections.find((s) => s.name === name);
    if (!s) {
      s = { name, items: [] };
      sections.push(s);
    }
    return s;
  };
  const getOrCreateItem = (section: ParsedSection, name: string): ParsedItem => {
    let i = section.items.find((i) => i.name === name);
    if (!i) {
      i = { name, comments: [] };
      section.items.push(i);
    }
    return i;
  };

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rawSection = cell(row, colIndex.section);
    const rawItem = cell(row, colIndex.item);
    const rawCommentName = cell(row, colIndex.commentName);
    const rawCommentText = cell(row, colIndex.commentText);
    const rawCommentType = cell(row, colIndex.commentType) || null;
    const rawRecommendation = cell(row, colIndex.recommendation);

    const rowHasAnyData =
      rawSection || rawItem || rawCommentName || rawCommentText || rawRecommendation;
    if (!rowHasAnyData) continue; // blank spacer row: nothing to warn about

    // Fill-down: Spectora-style exports often only print the section/item
    // name on the first row of that group and leave it blank below.
    const sectionName = rawSection || lastSectionName;
    if (rawSection && rawSection !== lastSectionName) {
      // Entering a new section resets which item "General" fill-down
      // applies to, so an item name never leaks across section boundaries.
      lastItemName = "";
    }
    if (rawSection) lastSectionName = rawSection;

    if (!sectionName) {
      warnings.push({
        location: `(row ${r + 1})`,
        kind: "skipped-row",
        message:
          "Row has content but no section context (no Section value on this or any earlier row). Row was skipped.",
      });
      continue;
    }

    const itemName = rawItem || lastItemName || "General";
    if (rawItem) lastItemName = rawItem;
    if (!rawItem && !lastItemName) {
      // first time we fall back to "General" for this section, note it once
    }

    if (!rawCommentName && !rawCommentText && !rawRecommendation) {
      // Section/Item heading row with nothing else - still preserves hierarchy.
      currentSection = getOrCreateSection(sectionName);
      currentItem = getOrCreateItem(currentSection, itemName);
      continue;
    }

    currentSection = getOrCreateSection(sectionName);
    currentItem = getOrCreateItem(currentSection, itemName);

    const location = `${sectionName} > ${itemName} > ${
      rawCommentName || "(unnamed comment)"
    }`;

    let bodyHtmlSource = rawCommentText;
    if (rawRecommendation) {
      bodyHtmlSource += `${
        bodyHtmlSource ? "<p></p>" : ""
      }<p><strong>Recommendation:</strong> ${rawRecommendation}</p>`;
    }

    const { html, warnings: sanitizeWarnings } = sanitizeCommentHtml(
      bodyHtmlSource,
      location
    );
    warnings.push(...sanitizeWarnings);

    let commentName = rawCommentName;
    if (!commentName) {
      const stripped = html.replace(/<[^>]+>/g, "").trim();
      commentName = stripped ? stripped.slice(0, 60) : "Untitled comment";
      warnings.push({
        location: `(row ${r + 1})`,
        kind: "missing-comment-name",
        message: `Row had no comment name; derived one from its text: "${commentName}".`,
      });
    }

    currentItem.comments.push({
      name: commentName,
      bodyHtml: html,
      commentType: rawCommentType,
    });
  }

  const counts = {
    sections: sections.length,
    items: sections.reduce((n, s) => n + s.items.length, 0),
    comments: sections.reduce(
      (n, s) => n + s.items.reduce((m, i) => m + i.comments.length, 0),
      0
    ),
  };

  if (counts.sections === 0) {
    return {
      ok: false,
      error:
        "No sections could be extracted from this file. Nothing was imported.",
    };
  }

  const templateNameGuess = fileName.replace(/\.[^.]+$/, "");

  return { ok: true, templateNameGuess, sections, warnings, counts };
}
