# Hive Template Importer

Import a Spectora "Export to spreadsheet → Export HTML Text" template into a
structured, editable database, then edit it or duplicate it without touching
the original. Built for the Hive Inspect Forward Deployed Engineer take-home.

- **Live app:** https://hive-inspect-template-importer.vercel.app (open, no login required)
- **Sample input (real):** [`samples/spectora-export-internachi-residential.xls`](samples/spectora-export-internachi-residential.xls) — an actual Spectora export, see [Sample input file](#sample-input-file) below.
- **Second sample (hand-built, for generalization):** [`samples/spectora-export-constructed-sample.xlsx`](samples/spectora-export-constructed-sample.xlsx)
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
npm run seed   # imports samples/spectora-export-internachi-residential.xls so the app opens with something to explore
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
src/components/             EditableText, EditableHtml, TemplateEditor, SectionBlock, TemplateListItem
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

[`samples/spectora-export-internachi-residential.xls`](samples/spectora-export-internachi-residential.xls)
is a **real** Spectora export: signed up for a Spectora free trial, added
the **"InterNACHI Residential"** template (by Spectora, from their Template
Center — "based on the InterNACHI Standards of Practice") to the account,
and used **Templates → ⋮ → Export to spreadsheet → Export HTML Text**. 13
sections, 69 items, 392 comments.

The first build of the parser was against a hand-constructed guess at this
format (still committed as
[`samples/spectora-export-constructed-sample.xlsx`](samples/spectora-export-constructed-sample.xlsx),
used as the second-file generalization check). Running the real export
through it surfaced real issues worth naming:

- **Two header-matching bugs.** Spectora appends explanatory text to some
  headers — `"Comment Type (info, limit, defect)"`, `"Recommendation (from
  list)"` — which didn't match the exact-string synonym list at all
  (`comment_type` silently stayed null, recommendations weren't merged in).
  And a guessed synonym, `"category"` for `section`, collided with
  Spectora's real `"Category (-1: Low, 0: Med, 1: High)"` severity column,
  misrouting it into `Section`. Both fixed in `parser.ts` — see NOTES.md.
- **A real scale problem.** 392 comments meant ~880 independently-editable
  fields on one page. The editor was unusably slow to hydrate with all of
  them mounted at once; sections now render collapsed by default and only
  mount their items/comments when expanded (`SectionBlock.tsx`). This was
  the actual hard problem in this project — see NOTES.md.
- **Confirmation, not just correction:** the fill-down assumption (section/
  item names only on the first row of their group), the HTML-in-cell
  assumption, and the sanitizer's link handling (42 real `<a href>` comments
  in this template) all matched the real file with no changes needed.

Drop another export into `samples/` and run `npm run check-import` (add its
filename to `scripts/check-import.ts`) to check it with no DB involved, or
upload it through the app's Import page directly — the parser matches
columns by a liberal, annotation-stripping synonym table, not fixed
position, specifically so it isn't locked to one file's exact headers.

## What each command needs

- `npm run dev` / `npm run build`: `.env.local` with both Supabase vars.
- `npm run seed`: same, plus the schema already applied.
- `npm run check-import`: nothing — pure parser logic, no network calls.
