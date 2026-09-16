export type TemplateOrigin = "import" | "copy" | "manual";

export interface Template {
  id: string;
  name: string;
  description: string | null;
  origin: TemplateOrigin;
  source_template_id: string | null;
  source_import_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Section {
  id: string;
  template_id: string;
  name: string;
  sort_order: number;
}

export interface Item {
  id: string;
  section_id: string;
  name: string;
  sort_order: number;
}

export interface Comment {
  id: string;
  item_id: string;
  name: string;
  body_html: string;
  comment_type: string | null;
  sort_order: number;
}

export interface TemplateWithTree extends Template {
  sections: (Section & {
    items: (Item & { comments: Comment[] })[];
  })[];
}

export interface ImportWarning {
  /** Human-readable path, e.g. "Roof > Roof Covering > Asphalt shingles" */
  location: string;
  /** e.g. "unsupported-tag", "unsupported-attribute", "missing-column", "skipped-row" */
  kind: string;
  message: string;
}

export interface ImportJob {
  id: string;
  template_id: string | null;
  file_name: string;
  status: "succeeded" | "failed";
  sections_count: number;
  items_count: number;
  comments_count: number;
  warnings: ImportWarning[];
  error: string | null;
  created_at: string;
}
