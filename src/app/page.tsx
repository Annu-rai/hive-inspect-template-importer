import Link from "next/link";
import { listTemplates } from "@/app/actions";
import { TemplateListItem } from "@/components/TemplateListItem";

export const dynamic = "force-dynamic";

export default async function Home() {
  const templates = await listTemplates();

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Templates</h1>
          <p className="text-sm text-gray-500">
            Import a Spectora export, edit it, or duplicate an existing template.
          </p>
        </div>
        <Link
          href="/import"
          className="text-sm px-4 py-2 rounded bg-amber-600 text-white hover:bg-amber-700"
        >
          Import template
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-lg p-10 text-center text-gray-500">
          No templates yet.{" "}
          <Link href="/import" className="text-amber-700 underline">
            Import your first Spectora export
          </Link>
          .
        </div>
      ) : (
        <ul className="space-y-3">
          {templates.map((t) => (
            <TemplateListItem key={t.id} template={t} />
          ))}
        </ul>
      )}
    </div>
  );
}
