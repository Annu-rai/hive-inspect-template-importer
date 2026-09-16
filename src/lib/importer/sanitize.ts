import sanitizeHtml from "sanitize-html";
import type { ImportWarning } from "@/lib/types";

/**
 * Rich text allowed inside a single comment's body. This is intentionally
 * narrow: formatting and links survive, anything that implies an external
 * asset, script, or complex layout does not. See NOTES.md "Formatting,
 * links, and rich content" for the reasoning.
 */
const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "span",
  "div",
  "a",
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  a: ["href", "target", "rel"],
};

const KNOWN_DANGEROUS_OR_UNSUPPORTED = new Set([
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "video",
  "audio",
  "svg",
  "font",
]);

function extractTagNames(html: string): Set<string> {
  const tags = new Set<string>();
  const re = /<\/?\s*([a-zA-Z][a-zA-Z0-9]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    tags.add(match[1].toLowerCase());
  }
  return tags;
}

export interface SanitizeResult {
  html: string;
  warnings: ImportWarning[];
}

/**
 * Sanitizes one comment's HTML body and reports, per location, exactly
 * what was stripped so the importer never silently drops content.
 */
export function sanitizeCommentHtml(
  rawHtml: string,
  location: string
): SanitizeResult {
  const warnings: ImportWarning[] = [];
  const presentTags = extractTagNames(rawHtml);

  const imgCount = (rawHtml.match(/<img\b/gi) ?? []).length;
  if (imgCount > 0) {
    warnings.push({
      location,
      kind: "unsupported-image",
      message: `${imgCount} embedded image${
        imgCount > 1 ? "s" : ""
      } found in this comment. Image/attachment import is not supported in this version; the image reference was removed and the surrounding text was kept.`,
    });
  }

  if (presentTags.has("table")) {
    warnings.push({
      location,
      kind: "unsupported-table",
      message:
        "A table was found in this comment. Tables are not supported; its text content was kept but the table structure was flattened.",
    });
  }

  for (const tag of presentTags) {
    if (
      KNOWN_DANGEROUS_OR_UNSUPPORTED.has(tag) &&
      tag !== "img" &&
      tag !== "table"
    ) {
      warnings.push({
        location,
        kind: "unsupported-tag",
        message: `Unsupported "<${tag}>" content was removed from this comment.`,
      });
    } else if (!ALLOWED_TAGS.includes(tag) && !KNOWN_DANGEROUS_OR_UNSUPPORTED.has(tag)) {
      warnings.push({
        location,
        kind: "unsupported-tag",
        message: `Unrecognized "<${tag}>" formatting was removed from this comment (not in the supported formatting set).`,
      });
    }
  }

  if (/style\s*=/.test(rawHtml)) {
    warnings.push({
      location,
      kind: "unsupported-styling",
      message:
        "Inline styling (colors, fonts, custom spacing) was found and removed. Bold, italic, underline, links, and lists are preserved.",
    });
  }

  const html = sanitizeHtml(rawHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer",
      }),
    },
  }).trim();

  return { html, warnings };
}
