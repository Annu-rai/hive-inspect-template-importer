-- Hive template importer schema
-- Models a Spectora-style report template as a strict hierarchy:
-- template -> section -> item -> comment
--
-- "comment" here means a library narrative entry attached to an item
-- (Spectora calls these "comments" too: canned/edited text an inspector
-- picks or types for a given item, e.g. "Roof Covering" -> "Asphalt
-- shingles show granule loss, recommend...").
--
-- Copies (duplicates) are modeled as fully independent rows with a
-- pointer back to their origin (source_template_id) purely for lineage/
-- display ("Copy of ..."). Editing a copy never touches the original
-- because no rows are shared between them.

create extension if not exists "pgcrypto";

create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  -- 'import': created by uploading a Spectora export
  -- 'copy': created by duplicating another template
  -- 'manual': created directly in the app (not required by the brief, kept open)
  origin text not null default 'manual' check (origin in ('import', 'copy', 'manual')),
  source_template_id uuid references templates(id) on delete set null,
  source_import_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A narrative/comment entry under an item. body_html is sanitized HTML
-- (a restricted tag allowlist -- see src/lib/importer/sanitize.ts).
-- This is the one place raw rich text is allowed to live; the template
-- as a whole is never stored as a single opaque HTML blob.
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  name text not null,
  body_html text not null default '',
  comment_type text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per upload attempt. Keeps the full warning/skip trail so an
-- inspector (or us, reviewing later) can see exactly what happened to
-- their four-year-old template, even for imports that partially failed.
create table if not exists import_jobs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references templates(id) on delete set null,
  file_name text not null,
  status text not null check (status in ('succeeded', 'failed')),
  sections_count integer not null default 0,
  items_count integer not null default 0,
  comments_count integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

alter table templates add constraint templates_source_import_fk
  foreign key (source_import_id) references import_jobs(id) on delete set null;

create index if not exists sections_template_id_idx on sections(template_id);
create index if not exists items_section_id_idx on items(section_id);
create index if not exists comments_item_id_idx on comments(item_id);
create index if not exists import_jobs_template_id_idx on import_jobs(template_id);

-- updated_at maintenance
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists templates_set_updated_at on templates;
create trigger templates_set_updated_at before update on templates
  for each row execute function set_updated_at();

drop trigger if exists sections_set_updated_at on sections;
create trigger sections_set_updated_at before update on sections
  for each row execute function set_updated_at();

drop trigger if exists items_set_updated_at on items;
create trigger items_set_updated_at before update on items
  for each row execute function set_updated_at();

drop trigger if exists comments_set_updated_at on comments;
create trigger comments_set_updated_at before update on comments
  for each row execute function set_updated_at();

-- RLS: this is a single-tenant internal tool for the hackathon brief
-- (no multi-user auth was in scope). Enable RLS but allow all access
-- through the service-role key used server-side; the anon key is not
-- used for writes. See NOTES.md for what a real multi-tenant policy
-- would add (owner_id column + per-row policies).
alter table templates enable row level security;
alter table sections enable row level security;
alter table items enable row level security;
alter table comments enable row level security;
alter table import_jobs enable row level security;

create policy "service role full access templates" on templates
  for all using (true) with check (true);
create policy "service role full access sections" on sections
  for all using (true) with check (true);
create policy "service role full access items" on items
  for all using (true) with check (true);
create policy "service role full access comments" on comments
  for all using (true) with check (true);
create policy "service role full access import_jobs" on import_jobs
  for all using (true) with check (true);
