"use client";

import { useState, useTransition } from "react";

export function EditableText({
  value,
  onSave,
  className,
  placeholder,
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
  className?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
          setError(null);
        }}
        className={`text-left hover:bg-amber-50 hover:outline hover:outline-1 hover:outline-amber-300 rounded px-1 -mx-1 ${className ?? ""}`}
        title="Click to edit"
      >
        {value || <span className="text-gray-400 italic">{placeholder ?? "Untitled"}</span>}
      </button>
    );
  }

  const commit = () => {
    const next = draft.trim();
    if (next === value) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      try {
        await onSave(next);
        setError(null);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <input
        autoFocus
        className={`border border-amber-400 rounded px-1 -mx-1 bg-white ${className ?? ""}`}
        value={draft}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
