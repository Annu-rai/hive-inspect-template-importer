import { notFound } from "next/navigation";
import Link from "next/link";
import { getTemplateTree } from "@/app/actions";
import { TemplateEditor } from "@/components/TemplateEditor";

export const dynamic = "force-dynamic";

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tree = await getTemplateTree(id);
  if (!tree) notFound();

  return (
    <div>
      <div className="max-w-4xl mx-auto pt-4 px-4">
        <Link href="/" className="text-sm text-gray-500 hover:underline">
          &larr; All templates
        </Link>
      </div>
      <TemplateEditor tree={tree} />
    </div>
  );
}
