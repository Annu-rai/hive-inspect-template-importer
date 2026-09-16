# NOTES

Context for reviewers: what's cut and why, what's actually supported, how
it was checked, and time spent. See `README.md` for setup/stack.

## The sample input, honestly

The brief supplies no template and expects a real Spectora
"Export to spreadsheet → Export HTML Text" file committed to the repo. That
signup/export step wasn't completed in this build window, so
`samples/spectora-export-sample.xlsx` is a **hand-constructed approximation**
of that export, not a real one — see the header comment in
`scripts/generate-sample-export.cjs` and the "Sample input file" section of
`README.md` for exactly what was assumed and why. Every design decision below
about column names, fill-down behavior, etc. is downstream of that
assumption and may need adjusting against a real export.

The importer is deliberately **not** hardcoded to this one file: columns are
matched by a synonym table (case/whitespace-insensitive), not by fixed
position or exact header text, and `npm run check-import` exists specifically
to let a real export be dropped in and checked without touching the DB or UI.

## Data model

`templates -> sections -> items -> comments`, one row per node, plain
foreign keys, `sort_order` for ordering (see `supabase/migrations/0001_init.sql`).
`comments.body_html` is sanitized HTML; nothing else in the schema holds
markup. `import_jobs` records one row per upload attempt (success or
failure) with the full warning list, so an import's provenance is
inspectable later, not just at upload time.

Duplication (`duplicateTemplate` in `src/app/actions.ts`) does a full
row-by-row deep copy — new `sections`/`items`/`comments` rows, new ids,
`source_template_id` pointing back for lineage/display only. No rows are
shared between a template and its copies, so editing one can't touch the
other by construction, not by convention.

## Formatting, links, and rich content: what's handled and what's not

The comment body allowlist (`src/lib/importer/sanitize.ts`) is: `p`, `br`,
`strong`/`b`, `em`/`i`, `u`, `ul`/`ol`/`li`, `span`/`div`, and `a` (href
restricted to `http`/`https`/`mailto`, and rewritten to open in a new tab).
That covers the formatting a narrative comment plausibly needs: paragraphs,
emphasis, lists, links.

Explicitly **not** supported, and never silently dropped — each produces a
per-comment warning naming the location (`Section > Item > Comment`) and is
shown in the import summary:

- **Images** (`<img>`) — reference is stripped, surrounding text kept. No
  asset hosting/rehosting was built; even if the original `src` were kept,
  it likely points at Spectora's own media store and wouldn't resolve
  outside it anyway. This is the biggest real content-preservation gap if
  a real template embeds inline photos in comment text (common in
  inspection software) — see "Known limitations."
- **Tables** — structure is flattened, text content is kept as plain text
  run together (see the "Hairline cracking" sample comment).
- **Inline `style=` attributes** and any other tag not in the allowlist
  (`script`, `iframe`, `font`, etc.) — stripped, warned once per comment.
- **Extra spreadsheet columns** the schema doesn't model — warned once per
  *column* (with a non-empty cell count), not once per row, so a 500-row
  file with an unrecognized column doesn't produce 500 warnings.

One exception built in beyond the minimum: a `Recommendation` column (if
present) isn't dropped — it's appended into the comment's `body_html` as a
labeled paragraph, because collapsing two closely-related narrative fields
into one preserves the inspector's words, whereas a schema column we
weren't sure existed in every export didn't seem worth adding speculatively.

**Missing from the export vs. unsupported by the importer** — these are
different failure modes and the importer treats them differently: a blank
cell (nothing there) is just skipped, no warning. Content that *is* present
but the importer can't represent (an image, a table, a style attribute, an
unrecognized column) always produces a warning naming exactly what was
found and where. The one case that produces neither — genuinely ambiguous
content — is a row with text but no section context at all (can't happen
with fill-down unless the *first* data row is missing its section); that's
treated as a skipped row with a warning, not silently dropped.

## The editor: how far it goes, and why

Section names, item names, and comment names are single-line inline-edit
(`EditableText`). Comment bodies are edited as raw HTML in a textarea with a
live rendered preview underneath (`EditableHtml`), sanitized again on save
through the same allowlist as import — so hand-typed `<script>` or a pasted
`<table>` gets caught on edit exactly like it would on import.

**Cut deliberately:** a WYSIWYG toolbar (bold/italic/link buttons instead of
typing tags). A non-technical inspector will find raw HTML tags in a
textarea unfamiliar, and this is the one place I'd spend the *next* chunk of
time — see "What I'd do next." It was cut because a minimal, correct
allowlist-sanitized textarea+preview proves the save/persist path and the
sanitizer reuse just as well as a rich editor would, for a fraction of the
time, and getting import right mattered more for this brief than editor
polish.

Also cut: reordering sections/items/comments, deleting them, and adding new
ones from scratch. The brief's baseline is "change section names, item
names, and comment text" — renaming and rewriting, not restructuring. An
inspector reorganizing a four-year-tuned template is a real need, just not
one I judged as more valuable than import fidelity in two days.

## The chosen "go further": making import trustworthy

The customer problem: an inspector migrating a template they've tuned for
years has exactly one thing to verify before they trust the new system —
*did everything survive, and if not, what didn't?* A silent partial import
is the worst possible outcome here, worse than a visible failure, because
it looks like success.

So the time went into: every skip/strip/unsupported-content case producing
a specific, located warning (not a generic "some content was modified"
banner); an import summary screen showing exact counts (sections/items/
comments) plus the full warning list before the inspector ever opens the
template; a hard failure path that creates *nothing* in the DB (verified —
see below) rather than a half-populated template; and an `import_jobs`
audit row so that provenance survives past the upload screen. This is also
why column-not-modeled warnings are deduplicated to one-per-column instead
of one-per-row — a trustworthy warning list is one a person will actually
read, which means not drowning the real issues in repetition.

## Known limitations

- **No image/attachment import.** Flagged, not silently dropped, but not
  brought in either. See above.
- **No multi-sheet handling beyond "read the first sheet, warn if there are
  others."** If a real Spectora export splits content across sheets, this
  importer misses it (with a warning that it did).
- **20,000 data-row cap** on a single import, as a sanity bound — not
  tuned against real export sizes since none were available.
- **No authentication.** The deployed URL is open to anyone who has it.
  Acceptable for a take-home demo; not acceptable for the real product.
  The schema has RLS enabled with service-role-only policies as a starting
  point, but there's no `owner_id`/tenant column yet — see "What I'd do
  next."
- **No delete, reorder, or add-new** for sections/items/comments (see
  editor section above).
- **Header matching is a synonym guess**, not verified against Spectora's
  actual column names, because no real export was available. If a real
  export uses different header text, `npm run check-import` against it will
  either work or fail loudly ("Could not find a Section or Comment Text
  column...") — it won't silently misread columns, but the synonym list
  may need a real entry added.

## What I'd do next (given more time)

1. Get a real Spectora export and re-validate every assumption above
   against it — this is the single highest-value next step, everything
   else is downstream of it.
2. A minimal WYSIWYG toolbar over the same sanitizer, for the
   non-technical-inspector editing experience.
3. Reorder (drag) and delete for sections/items/comments.
4. Auth + an `owner_id` column so this isn't a single shared workspace.

## How this was checked

- `npm run check-import` runs the parser (no DB) against both committed
  samples and prints the full extracted tree plus every warning — this is
  the fastest way to see parser behavior change, and was run repeatedly
  while building the parser. It also caught a real bug: item-name fill-down
  was leaking across section boundaries (an "Electrical" section with no
  item value was inheriting "Foundation" from the *previous* section's last
  item instead of falling back to "General") — fixed in `parser.ts`, and
  the fix is visible in the git history.
- The full browser flow was driven end-to-end (import the sample file →
  see the warnings panel → open the template → edit a section name → edit a
  comment body → duplicate → confirm the original is unchanged and the
  copy has the edit → hard-reload and re-check the DB directly to confirm
  edits persisted server-side, not just in client state) before calling any
  of it done.
- The failure case (`samples/spectora-export-wrong-format.html`, simulating
  someone uploading Spectora's plain-text export instead of the spreadsheet
  export) was run through the same UI path and confirmed to produce a clear
  error with zero rows written — verified directly against the database,
  not just the UI response.
- A hydration mismatch (`toLocaleString()` defaulting to different locales
  on the server vs. the browser) was caught from the Next.js dev-overlay
  error badge during manual testing and fixed by pinning an explicit locale.
- `npm run build` (production build, typechecked) passes clean.

## Credits / starting point

Scaffolded with `create-next-app` (Next.js's own starter: TypeScript,
Tailwind, App Router, ESLint). No other starter, template, or boilerplate
was used. Database schema, importer, sanitizer, server actions, and UI are
original to this submission. Libraries used as libraries, not copied from:
`@supabase/supabase-js`, SheetJS `xlsx` (installed from SheetJS's own CDN,
not the outdated/unpatched npm package — see README), `sanitize-html`,
`@tailwindcss/typography`.

## Approximate time spent

Built in a single extended AI-pair-programming session (Claude Code):
schema + migration, parser + sanitizer, server actions, editor/import UI,
Supabase provisioning, end-to-end browser verification, and this
documentation. Wall-clock time wasn't tracked precisely; the work fits
comfortably inside the brief's two-focused-days envelope, with the
Spectora/Hive/Binsr product exploration and the real export file (see
above) still outstanding.
