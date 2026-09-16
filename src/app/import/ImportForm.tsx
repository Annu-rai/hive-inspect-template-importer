"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importSpectoraFileAction, type ImportOutcome } from "@/app/actions";

const initialState: ImportOutcome | null = null;

const WARNING_KIND_LABEL: Record<string, string> = {
  "unrecognized-column": "Unrecognized column",
  "duplicate-column": "Duplicate column",
  "skipped-row": "Skipped row",
  "missing-comment-name": "Missing comment name",
  "unsupported-image": "Image not imported",
  "unsupported-table": "Table not imported",
  "unsupported-tag": "Unsupported formatting",
  "unsupported-styling": "Inline styling removed",
  "extra-sheet": "Extra sheet ignored",
};

export function ImportForm() {
  const [state, formAction, pending] = useActionState(
    importSpectoraFileAction,
    initialState
  );

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <Link href="/" className="text-sm text-gray-500 hover:underline">
        &larr; All templates
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">Import a Spectora template</h1>
      <p className="text-sm text-gray-500 mb-6">
        Upload the file from Spectora&apos;s <strong>Export to spreadsheet &rarr; Export HTML Text</strong>{" "}
        option (.xlsx). The plain-text export is not supported.
      </p>

      <form action={formAction} className="space-y-4 border border-gray-200 rounded-lg p-5">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="templateName">
            Template name (optional)
          </label>
          <input
            id="templateName"
            name="templateName"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            placeholder="Defaults to the file name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="file">
            Spectora export file
          </label>
          <input
            id="file"
            name="file"
            type="file"
            required
            accept=".xlsx,.xls,.csv"
            className="w-full text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded bg-amber-600 text-white text-sm hover:bg-amber-700 disabled:opacity-50"
        >
          {pending ? "Importing..." : "Import"}
        </button>
      </form>

      {state && !state.ok && (
        <div className="mt-6 border border-red-200 bg-red-50 rounded-lg p-4">
          <h2 className="font-medium text-red-800 mb-1">Import failed</h2>
          <p className="text-sm text-red-700">{state.error}</p>
          <p className="text-xs text-red-600 mt-2">
            Nothing was created for this attempt&mdash;no partial template was saved.
          </p>
        </div>
      )}

      {state && state.ok && (
        <div className="mt-6 border border-green-200 bg-green-50 rounded-lg p-4">
          <h2 className="font-medium text-green-800 mb-1">Import succeeded</h2>
          <p className="text-sm text-green-800">
            {state.counts?.sections} sections, {state.counts?.items} items,{" "}
            {state.counts?.comments} comments imported.
          </p>
          <Link
            href={`/templates/${state.templateId}`}
            className="inline-block mt-2 text-sm text-green-900 underline"
          >
            Open the imported template &rarr;
          </Link>

          {state.warnings && state.warnings.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-amber-800">
                {state.warnings.length} thing{state.warnings.length === 1 ? "" : "s"} to
                review (not silently dropped):
              </h3>
              <ul className="mt-2 space-y-1 max-h-72 overflow-y-auto text-xs">
                {state.warnings.map((w, i) => (
                  <li key={i} className="border border-amber-200 bg-amber-50 rounded px-2 py-1">
                    <span className="font-medium text-amber-800">
                      {WARNING_KIND_LABEL[w.kind] ?? w.kind}
                    </span>
                    {w.location !== "(file)" && (
                      <span className="text-gray-500"> &middot; {w.location}</span>
                    )}
                    <div className="text-gray-700">{w.message}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
