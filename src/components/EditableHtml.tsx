"use client";

import { useState, useTransition } from "react";

export function EditableHtml({
  value,
  onSave,
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          setDraft(value);
          setEditing(true);
          setError(null);
        }}
        className="prose prose-sm max-w-none cursor-text rounded px-2 py-1 -mx-2 hover:bg-amber-50 hover:outline hover:outline-1 hover:outline-amber-300 [&_a]:text-blue-600 [&_a]:underline"
        title="Click to edit"
        dangerouslySetInnerHTML={{
          __html: value || '<span class="text-gray-400 italic">Empty comment</span>',
        }}
      />
    );
  }

  const commit = () => {
    startTransition(async () => {
      try {
        await onSave(draft);
        setError(null);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        autoFocus
        className="w-full min-h-[100px] border border-amber-400 rounded px-2 py-1 font-mono text-xs bg-white"
        value={draft}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
      <div className="text-xs text-gray-500">
        Preview:
        <div
          className="prose prose-sm max-w-none border border-dashed border-gray-300 rounded p-2 mt-1 [&_a]:text-blue-600 [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: draft }}
        />
      </div>
      {error && <span className="text-xs text-red-600">{error}</span>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={commit}
          disabled={pending}
          className="text-xs px-2 py-1 rounded bg-amber-600 text-white disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            setEditing(false);
          }}
          className="text-xs px-2 py-1 rounded border border-gray-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
