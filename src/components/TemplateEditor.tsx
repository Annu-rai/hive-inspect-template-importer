"use client";

import { useRouter } from "next/navigation";
import { EditableText } from "./EditableText";
import { EditableHtml } from "./EditableHtml";
import {
  updateTemplateName,
  updateSectionName,
  updateItemName,
  updateComment,
  duplicateTemplate,
} from "@/app/actions";
import type { TemplateWithTree } from "@/lib/types";
import { useState, useTransition } from "react";

export function TemplateEditor({ tree }: { tree: TemplateWithTree }) {
  const router = useRouter();
  const [duplicating, startDuplicate] = useTransition();
  const [copyError, setCopyError] = useState<string | null>(null);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-2xl font-semibold">
          <EditableText
            value={tree.name}
            onSave={(v) => updateTemplateName(tree.id, v)}
          />
        </h1>
        <button
          type="button"
          disabled={duplicating}
          onClick={() =>
            startDuplicate(async () => {
              try {
                const id = await duplicateTemplate(tree.id);
                router.push(`/templates/${id}`);
              } catch (e) {
                setCopyError(e instanceof Error ? e.message : "Failed to duplicate");
              }
            })
          }
          className="shrink-0 text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          {duplicating ? "Duplicating..." : "Duplicate template"}
        </button>
      </div>
      {copyError && <p className="text-sm text-red-600 mb-4">{copyError}</p>}
      <p className="text-sm text-gray-500 mb-8">
        {tree.origin === "copy" ? "Copy of another template. " : ""}
        {tree.description}
      </p>

      <div className="space-y-8">
        {tree.sections.map((section) => (
          <section key={section.id} className="border border-gray-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-3">
              <EditableText
                value={section.name}
                onSave={(v) => updateSectionName(section.id, tree.id, v)}
              />
            </h2>
            <div className="space-y-4 pl-3 border-l-2 border-gray-100">
              {section.items.map((item) => (
                <div key={item.id}>
                  <h3 className="font-medium text-gray-800 mb-2">
                    <EditableText
                      value={item.name}
                      onSave={(v) => updateItemName(item.id, tree.id, v)}
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
                                updateComment(comment.id, tree.id, { name: v })
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
                            updateComment(comment.id, tree.id, { bodyHtml: v })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
