# Hive Template Importer

Import a Spectora "Export to spreadsheet → Export HTML Text" template into a
structured, editable database, then edit it or duplicate it without touching
the original. Built for the Hive Inspect Forward Deployed Engineer take-home.

- **Live app:** (fill in after deploy)
- **Sample input:** [`samples/spectora-export-sample.xlsx`](samples/spectora-export-sample.xlsx) — see [Sample input file](#sample-input-file) below for what it is and why.
- **Failure-case input:** [`samples/spectora-export-wrong-format.html`](samples/spectora-export-wrong-format.html)
- **Full context on decisions, cuts, and limitations:** [`NOTES.md`](NOTES.md)

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack) — scaffolded with `create-next-app`, then built out.
- **Supabase** (Postgres) for persistence, accessed only from server actions via the service-role key.
- **Tailwind CSS v4** + `@tailwindcss/typography` for styling.
- **SheetJS (`xlsx`)**, installed from SheetJS's own CDN (`cdn.sheetjs.com`), not the `xlsx` npm package — the npm-published version has unpatched prototype-pollution/ReDoS advisories, which matters here because this library parses untrusted user uploads.
- **`sanitize-html`** to allowlist-sanitize rich text pulled out of the spreadsheet.
- No UI framework/starter beyond `create-next-app`'s default template; no ORM (plain `@supabase/supabase-js` queries).

## Setup

```bash
npm install
cp .env.example .env.local   # fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
```

### Database

1. Create a Supabase project (or reuse one).
2. Run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) in the Supabase SQL Editor (SQL Editor → New query → paste → Run). It's idempotent (`create table if not exists`, etc.) except for the RLS policy statements, which will error on a second run — that's fine, it means it's already applied.
3. If `npm run seed` (below) reports the tables as missing right after running the migration, Supabase's API layer just needs its schema cache refreshed: run `NOTIFY pgrst, 'reload schema';` in the SQL Editor, or use Project Settings → API → "Reload schema".

### Environment variables

Only two, both server-only (never sent to the browser — see `src/lib/supabase/server.ts`):

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Supabase Project Settings → Data API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Project Settings → API Keys → `service_role` (not `anon`) |

### Run it

```bash
npm run seed   # imports samples/spectora-export-sample.xlsx so the app opens with something to explore
npm run dev
```

Open http://localhost:3000.

### Other scripts

```bash
npm run check-import   # parses both sample files with no DB involved; prints the extracted tree + every warning
npm run build           # production build
```

## Deployment (Vercel)

The live URL was deployed with:

```bash
vercel link
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel deploy --prod
```

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` must be set as Vercel project environment variables (Project → Settings → Environment Variables) for the deployed build. The database itself is a Supabase project provisioned directly at supabase.com (see `NOTES.md` for why this ended up manual rather than through Vercel's Supabase marketplace integration).

No authentication is in front of the app — anyone with the URL can use it. See `NOTES.md` for why that's an acceptable cut for this brief.

## Repo layout

```
src/app/                    Next.js App Router pages + server actions (actions.ts)
  page.tsx                  Dashboard: list templates, import, duplicate
  import/                   Upload UI + import result/warnings panel
  templates/[id]/           Template editor
src/components/             EditableText, EditableHtml, TemplateEditor, TemplateListItem
src/lib/importer/
  parser.ts                 Spreadsheet -> {sections, items, comments} + warnings
  sanitize.ts                Rich-text allowlist sanitizer + per-comment warnings
src/lib/supabase/server.ts  Service-role Supabase client (server-only)
src/lib/types.ts            Shared domain types
supabase/migrations/        SQL schema
scripts/
  generate-sample-export.cjs  Builds the committed sample .xlsx (see below)
  check-import.ts             Manual parser verification against both samples
  seed.ts                     Seeds the DB from the sample file
samples/                    Committed input files (sample + failure case)
```

## Sample input file

**We did not have a real Spectora export when this was built.** The brief
asks for Spectora's "Export to spreadsheet → Export HTML Text" output loaded
from an InterNACHI Residential template; getting one requires a Spectora
trial signup and walking through their UI, which wasn't completed in the
build window for this submission.

[`samples/spectora-export-sample.xlsx`](samples/spectora-export-sample.xlsx)
is a **hand-constructed approximation** of that export — an InterNACHI-style
residential inspection outline (Roof, Exterior, Structure, Electrical,
Plumbing, Heating), built with the documented shape of a Spectora spreadsheet
export in mind: `Section` / `Item` / `Comment Name` / `Comment Text` columns,
section and item names only present on the first row of their group (fill-down),
and HTML markup inside the comment text cell. Generated by
[`scripts/generate-sample-export.cjs`](scripts/generate-sample-export.cjs),
which documents this reasoning inline.

It deliberately includes messy content the importer has to handle honestly:
an embedded `<img>`, an HTML `<table>`, inline `style=` attributes, a row
with no comment name, and an extra column (`Internal ID`) the schema doesn't
model — see [`NOTES.md`](NOTES.md) for how each is handled.

**If you have a real Spectora export**, drop it into `samples/` and either
run `npm run check-import` against it directly (edit the filename at the
bottom of `scripts/check-import.ts`) or upload it through the app's Import
page — the parser matches columns by a liberal set of header synonyms
(case/whitespace-insensitive), not by exact position, specifically so it
isn't locked to the one file we built against.

## What each command needs

- `npm run dev` / `npm run build`: `.env.local` with both Supabase vars.
- `npm run seed`: same, plus the schema already applied.
- `npm run check-import`: nothing — pure parser logic, no network calls.
