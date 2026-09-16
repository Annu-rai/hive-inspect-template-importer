"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { duplicateTemplate } from "@/app/actions";
import type { Template } from "@/lib/types";

const ORIGIN_LABEL: Record<Template["origin"], string> = {
  import: "Imported",
  copy: "Copy",
  manual: "Manual",
};

export function TemplateListItem({ template }: { template: Template }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="flex items-center justify-between gap-4 border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-300">
      <div className="min-w-0">
        <Link href={`/templates/${template.id}`} className="font-medium hover:underline">
          {template.name}
        </Link>
        <div className="text-xs text-gray-500 mt-0.5">
          <span className="uppercase tracking-wide bg-gray-100 rounded px-1.5 py-0.5 mr-2">
            {ORIGIN_LABEL[template.origin]}
          </span>
          Updated{" "}
          {new Date(template.updated_at).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </div>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              const id = await duplicateTemplate(template.id);
              router.push(`/templates/${id}`);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to duplicate");
            }
          })
        }
        className="shrink-0 text-sm px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
      >
        {pending ? "Duplicating..." : "Duplicate"}
      </button>
    </li>
  );
}
