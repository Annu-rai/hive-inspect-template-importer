# NOTES

Context for reviewers: what's cut and why, what's actually supported, how
it was checked, and time spent. See `README.md` for setup/stack.

## The sample input

[`samples/spectora-export-internachi-residential.xls`](samples/spectora-export-internachi-residential.xls)
is a **real** Spectora export. Signed up for a Spectora free trial, added
their **"InterNACHI Residential"** template (Template Center → Spectora →
"based on the InterNACHI Standards of Practice") to the account, and used
**Templates → ⋮ → Export to spreadsheet → Export HTML Text**. 13 sections,
69 items, 392 comments.

The parser was first built against a hand-constructed guess at the export
format (still committed as `samples/spectora-export-constructed-sample.xlsx`,
now used as the second-file generalization check the brief asks for). Running
the real file through it was the single most useful thing done on this
project — it found two real bugs immediately:

1. **Header matching broke on annotated headers.** Spectora's real headers
   include explanatory text — `"Comment Type (info, limit, defect)"`,
   `"Recommendation (from list)"` — but the synonym matcher did an exact-string
   comparison, so neither matched anything. `comment_type` silently stayed
   null on every row; recommendations never got merged into comment bodies.
   Fixed by stripping a trailing `"(...)"` annotation before comparing
   (`normalizeHeader` in `parser.ts`).
2. **A guessed synonym actively misrouted real data.** The synonym list had
   `"category"` mapped to the `section` field (a guess, no real export to
   check it against at the time). Spectora's actual `"Category (-1: Low, 0:
   Med, 1: High)"` column is a *severity score*, not a section name — after
   fix #1 stripped its annotation down to `"category"`, it collided directly
   and got flagged as a duplicate `Section` column, silently discarding a
   real column. Removed the guess; it's now correctly just an
   unrecognized-but-visible column.

Everything else about the parser's assumptions held up against the real
file with no changes needed: the fill-down behavior (section/item names
only printed on the first row of their group), HTML directly inside the
comment-text cell, and the sanitizer's link handling — this template has 42
real `<a href="...">` comments, and every one round-tripped correctly
(scheme allowed, rewritten to `target="_blank" rel="noopener"`).

**A concrete example of "missing from the export" vs. "unsupported by the
importer"** (the distinction the brief asks about): one real comment
("Doorknob Hole") contains `<div class="youtube-embed-wrapper" style="...">
</div>` — an empty wrapper. Spectora's own spreadsheet export already
stripped the actual YouTube `<iframe>` out of that div before we ever saw
the file; there's no video content to lose. Our sanitizer does still flag
it (`unsupported-styling`, since the wrapper carries an inline `style=`),
which is correct behavior for the div — but the video itself is missing
from the *export*, not something our importer failed to support.

Another real example: the "Temperature" comment's `Recommendation (from
list)` cell literally contains the text `"pro"` — clearly truncated data in
Spectora's own template. The importer imports it verbatim rather than
guessing at what it should say. Preserving the customer's actual data,
oddities included, matters more than silently "fixing" it.

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
restricted to `http`/`https`/`mailto`, rewritten to open in a new tab). That
covers what real comments in the InterNACHI template actually use:
paragraphs, and links (42 of them) to external repair/DIY resources.

Explicitly **not** supported, and never silently dropped — each produces a
per-comment warning naming the location (`Section > Item > Comment`) and is
shown in the import summary:

- **Images** (`<img>`) — reference is stripped, surrounding text kept. Not
  hit in the real InterNACHI export (zero `<img>` tags in its 392 comments),
  but exercised via the constructed second sample. No asset hosting/rehosting
  was built; even if the original `src` were kept, it likely points at
  Spectora's own media store and wouldn't resolve outside it.
- **Tables** — structure flattened, text kept. Also not present in the real
  export; exercised via the constructed sample.
- **Inline `style=` attributes** and any tag outside the allowlist (`script`,
  `iframe`, `font`, etc.) — stripped, warned once per comment. Hit for real
  once, in the YouTube-embed-wrapper case above.
- **Extra spreadsheet columns** the schema doesn't model — warned once per
  *column* (with a non-empty cell count), not once per row. The real export
  has nine of these (`Category`, `Multiple Choice Options`, `Unit Type
  Options`, `Order (w/i item)`, `Answer Type`, `Default Value`, `Default
  Estimate Min/Max`, `Uses`, `Last Modified`, ten `Default Photo N` slots) —
  see "Known limitations" for what two of those actually represent.

One exception built in beyond the minimum: a `Recommendation` column (if
present) isn't dropped — it's appended into the comment's `body_html` as a
labeled paragraph. In the real export this fires on real rows (e.g. "Negative
Grading": the main narrative plus a separate `Recommendation: monitor` cell,
merged into one comment body).

**Missing from the export vs. unsupported by the importer** — different
failure modes, handled differently: a blank cell is just skipped, no warning.
Content that *is* present but the importer can't represent (an image, a
table, a style attribute, an unrecognized column) always produces a warning
naming exactly what was found and where. See the YouTube-embed example above
for a case that's genuinely *missing from the export itself*, which the
importer correctly can't distinguish from "author never added a video" —
it just has nothing to warn about beyond the leftover empty wrapper it does
strip.

## The editor: how far it goes, and why

Section names, item names, and comment names are single-line inline-edit
(`EditableText`). Comment bodies are edited as raw HTML in a textarea with a
live rendered preview underneath (`EditableHtml`), sanitized again on save
through the same allowlist as import.

**Cut deliberately:** a WYSIWYG toolbar (bold/italic/link buttons instead of
typing tags). A non-technical inspector will find raw HTML tags in a
textarea unfamiliar — see "What I'd do next."

Also cut: reordering sections/items/comments, deleting them, and adding new
ones from scratch. The brief's baseline is "change section names, item
names, and comment text" — renaming and rewriting, not restructuring.

## Scale: the actual hard problem in this project

The real template has 392 comments across 69 items — roughly 880
independently-editable fields (each with its own name and, for comments, a
body). Rendering the editor with every one of them mounted as a live
interactive component made the page unusably slow: hydration alone made
clicking anything take multiple seconds, and the page was borderline
unresponsive to browser automation tooling during testing.

This was the actual "difficult case" for this project — a hand-built 11-comment
mock template never would have surfaced it, and the brief's warning that a
customer's real four-year-tuned template won't be small turned out to be
exactly right. Fixed by making sections collapse by default
(`src/components/SectionBlock.tsx`): a collapsed section renders only its
name and an item/comment count, and only mounts its items/comments (and
their `EditableText`/`EditableHtml` instances) once expanded. The first
section opens by default so the page isn't empty on load; the rest are one
click away. Verified after the fix: expanding a 43-comment section (Plumbing)
renders instantly, and editing/saving inside it still persists correctly.

This is the improvement referenced as "handle a difficult case well" — it
wasn't chosen in the abstract, it's a direct fix for a problem the real
customer file actually caused.

## Known limitations

- **No image/attachment import.** Flagged, not silently dropped, but not
  brought in either.
- **`Multiple Choice Options` / `Answer Type` columns aren't modeled.** ~83
  of the 392 real comments are actually checkbox/dropdown-style question
  definitions (e.g. "In Attendance" → "Home Owner, Client, Client's Agent,
  Listing Agent") rather than narrative text — they have no `Comment Text`.
  These import as comments with the name preserved and an empty body; their
  options data shows up as a visible "not imported" warning rather than
  being modeled as real multiple-choice fields. Preserves the hierarchy and
  is honest about the gap, but a real implementation would likely want a
  distinct field type here rather than treating everything as a text comment.
- **`Order (w/i item)` isn't read** — sort order comes from row order in the
  file instead, which matched this column's values exactly in the real
  export, but isn't guaranteed to for every export.
- **No multi-sheet handling beyond "read the first sheet, warn if there are
  others."** The real export is single-sheet, so this is unverified against
  a multi-sheet case.
- **20,000 data-row cap** on a single import (392 real rows is nowhere near
  it, but it's an untuned guess, not a measured limit).
- **No authentication.** The deployed URL is open to anyone who has it.
  Acceptable for a take-home demo; not acceptable for the real product. The
  schema has RLS enabled with service-role-only policies as a starting
  point, but there's no `owner_id`/tenant column yet.
- **No delete, reorder, or add-new** for sections/items/comments.
- **Editor scale fix is section-level only.** A single item with an
  unusually large number of comments would still mount all of them once its
  section is expanded. Didn't hit this in the real 392-comment file (max
  was 12 comments in one item), so didn't build item-level lazy-mounting too.

## What I'd do next (given more time)

1. Model `Multiple Choice Options`/`Answer Type` as real fields instead of
   text comments with empty bodies — the biggest remaining fidelity gap
   against the real export.
2. A minimal WYSIWYG toolbar over the same sanitizer.
3. Reorder (drag) and delete for sections/items/comments.
4. Auth + an `owner_id` column so this isn't a single shared workspace.
5. Try the Room-by-Room Residential and InterNACHI Commercial templates
   from the same Template Center to see if either breaks a different
   assumption (multi-choice-heavy content, different column set, etc.).

## Using Hive Inspect (for the walkthrough's Hive-feedback section)

Signed up for the Hive Inspect free trial and used the account for this
exploration. Two things worth being direct about:

- **Hive has its own native Spectora template importer** (Templates → Upload
  → select "Spectora" as source → upload the same `.xls`/`.xlsx` export this
  project targets). Tried it against the exact real InterNACHI Residential
  file committed here. It does more than this project does in one respect —
  it explicitly downloads and rehosts referenced images to Hive's own cloud
  storage ("Downloading and uploading images to our secure cloud"), and has
  an "Import cost estimates" option that carries Spectora's cost-estimate
  ranges into recommendations, with an honest caveat that stock Spectora
  templates default the same range on every comment and should be reviewed
  afterward. Both are real fidelity wins this project explicitly punted on
  (see "Known limitations").
- **The import UI didn't reflect its own success.** After uploading, the
  "Processing Your Template — this may take up to 5 minutes" spinner never
  advanced, well past 5 minutes. Reloading the page showed the import had
  actually succeeded — the new template was sitting in the list the whole
  time. For a product whose core value proposition here is *replacing* what
  this project builds, a stuck "are we done yet" state is the one thing to
  get right — it's the exact trust problem this project's own "go further"
  chose to solve for. Also hit two other stuck-loading states in the same
  session (a template failing to open after being clicked in the sidebar
  twice in a row; an inspection's "services" data never finishing loading
  across multiple reloads, which left the Edit/Preview Reports actions doing
  nothing visible) — no console errors in either case, just requests that
  never resolved. Didn't fully complete the "publish a sample report"
  walkthrough as a result; the demo inspection Hive seeds new accounts with
  already shows a report in "Published" status, which is what's shown in the
  video instead.

## Using Binsr (optional comparison)

Signed up for Binsr's free trial and tried its template importer against
the same real InterNACHI Residential file, for comparison.

**Binsr's approach is structurally different from Spectora/Hive's.** Where
Hive's importer asks which competitor a file came from (Spectora, HIP,
HomeGauge, Horizon) and applies source-specific column mapping, Binsr offers
two general-purpose paths for *any* CSV/Excel: an "AI-Powered Import" that
lets an LLM infer the structure, and a "Manual CSV Import" described
explicitly as "no AI, fully deterministic — full mapping control." Offering
a non-AI fallback alongside the AI one, with that framing, is a real
trust-conscious design choice — it's solving the same problem this
project's "go further" chose to solve, from a different angle. Binsr also
gates the AI import behind an explicit "I confirm that I own or have
authorization to use this template" checkbox before processing, which
neither Spectora nor Hive's flow has.

**Result quality, checked directly against this project's own output:**
ran the real file through Binsr's AI-Powered Import and the counts matched
this project's parser exactly at every level — 13 sections, 69 line items,
392 comments overall, and section-by-section (Exterior: 7 items/50 comments,
Roof: 5/35, Plumbing: 7/43, all identical) and item-by-item (Siding,
Flashing & Trim: 12 comments, matching exactly). Spot-checked several
comment bodies against the source spreadsheet cell-for-cell — narrative
text came through verbatim, no paraphrasing or invented content. One real
advantage over this project: Binsr's AI correctly modeled the multiple-choice
question rows (e.g. "Siding Material") as actual Checklist-type fields with
their option lists intact, rather than importing them as text comments with
an empty body and a discarded options column — exactly the gap called out
in "Known limitations" above.

Two independent implementations — this project's deterministic parser and
Binsr's LLM-based one — reaching identical structural counts on the same
392-row real-world file is reassuring evidence for both: it suggests the
file's structure is unambiguous enough that a well-built importer, AI or
not, should get it right.

One UI rough edge, minor compared to Hive's: the "Generate AI Strategy"
button click didn't visibly advance the step tracker at first, though the
underlying API call (`/api/migration/template`, confirmed via the network
tab) had already returned 200 — unlike Hive's case, there was still a
pending request in flight the whole time, so this reads as "slow AI
processing with laggy UI feedback," not a stuck/broken state.

## How this was checked

- `npm run check-import` runs the parser (no DB) against all three sample
  files and prints the full extracted tree plus every warning. Caught two
  real bugs against the real file (see "The sample input" above) and one
  earlier bug against the constructed sample: item-name fill-down leaking
  across section boundaries.
- The full browser flow was driven end-to-end against the real 392-comment
  template: import → warnings panel → open the template → expand a section
  → edit a section name and a comment body → hard-reload and re-check the
  database directly (not just the UI) to confirm edits persisted → duplicate
  → confirm the original is unchanged and the copy independently carries the
  edit.
- The failure case (`samples/spectora-export-wrong-format.html`, simulating
  someone uploading Spectora's plain-text export instead of the spreadsheet
  export) produces a clear error with zero rows written — verified directly
  against the database.
- The scale fix was verified by measuring: before the `SectionBlock` change,
  opening the real template made the page unresponsive; after, expanding a
  43-comment section renders and becomes editable effectively instantly, and
  a comment-name edit inside it round-tripped to the database correctly.
- A hydration mismatch (`toLocaleString()` defaulting to different locales
  on the server vs. the browser) was caught from the Next.js dev-overlay
  error badge and fixed by pinning an explicit locale.
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
Supabase provisioning, Vercel deployment, Hive Inspect + Spectora trial
signups, the real Spectora export and the two bug fixes it surfaced, the
editor scale fix, exploring Hive's own Spectora importer, and end-to-end
verification against the real file. Wall-clock time wasn't tracked
precisely; the work fits inside the brief's two-focused-days envelope.
Still outstanding: Binsr exploration and the walkthrough video.
