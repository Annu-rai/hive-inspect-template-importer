"use client";

import { useRouter } from "next/navigation";
import { EditableText } from "./EditableText";
import { SectionBlock } from "./SectionBlock";
import { updateTemplateName, duplicateTemplate } from "@/app/actions";
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

      <div className="space-y-4">
        {tree.sections.map((section, idx) => (
          <SectionBlock
            key={section.id}
            section={section}
            templateId={tree.id}
            defaultOpen={idx === 0}
          />
        ))}
      </div>
    </div>
  );
}
