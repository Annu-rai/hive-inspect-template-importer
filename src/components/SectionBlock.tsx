"use client";

import { useState } from "react";
import { EditableText } from "./EditableText";
import { EditableHtml } from "./EditableHtml";
import {
  updateSectionName,
  updateItemName,
  updateComment,
} from "@/app/actions";
import type { Section, Item, Comment } from "@/lib/types";

type SectionWithTree = Section & {
  items: (Item & { comments: Comment[] })[];
};

/**
 * A real Spectora template can carry hundreds of comments (the InterNACHI
 * Residential export used for this project has 392 across 69 items).
 * Mounting every comment as an interactive editable component up front
 * made the editor page unusably slow to hydrate. Sections render
 * collapsed by default and only mount their items/comments once expanded,
 * so the number of live editable components stays proportional to what's
 * actually open, not the whole template.
 */
export function SectionBlock({
  section,
  templateId,
  defaultOpen = false,
}: {
  section: SectionWithTree;
  templateId: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const commentCount = section.items.reduce((n, i) => n + i.comments.length, 0);

  return (
    <section className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500"
          title={open ? "Collapse section" : "Expand section"}
        >
          {open ? "▾" : "▸"}
        </button>
        <h2 className="text-lg font-semibold flex-1">
          <EditableText
            value={section.name}
            onSave={(v) => updateSectionName(section.id, templateId, v)}
          />
        </h2>
        <span className="text-xs text-gray-400 shrink-0">
          {section.items.length} item{section.items.length === 1 ? "" : "s"} ·{" "}
          {commentCount} comment{commentCount === 1 ? "" : "s"}
        </span>
      </div>

      {open && (
        <div className="space-y-4 pl-3 border-l-2 border-gray-100">
          {section.items.map((item) => (
            <div key={item.id}>
              <h3 className="font-medium text-gray-800 mb-2">
                <EditableText
                  value={item.name}
                  onSave={(v) => updateItemName(item.id, templateId, v)}
                />
              </h3>
              <div className="space-y-3 pl-3">
                {item.comments.length === 0 && (
                  <p className="text-xs text-gray-400 italic">No comments</p>
                )}
                {item.comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="bg-gray-50 rounded-md p-3 border border-gray-100"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-700">
                        <EditableText
                          value={comment.name}
                          onSave={(v) =>
                            updateComment(comment.id, templateId, { name: v })
                          }
                        />
                      </span>
                      {comment.comment_type && (
                        <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-200 rounded px-1.5 py-0.5">
                          {comment.comment_type}
                        </span>
                      )}
                    </div>
                    <EditableHtml
                      value={comment.body_html}
                      onSave={(v) =>
                        updateComment(comment.id, templateId, { bodyHtml: v })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
