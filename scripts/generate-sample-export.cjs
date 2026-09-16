/**
 * Builds a hand-constructed approximation of a Spectora
 * "Export to spreadsheet -> Export HTML Text" file.
 *
 * IMPORTANT: this is NOT a real Spectora export. At build time we did not
 * yet have a Spectora trial account with an exported template, so this
 * script recreates the documented shape of that export (a spreadsheet
 * with Section/Item/Comment rows, section and item names only present on
 * the first row of their group, and HTML markup inside the comment text
 * cell) using an InterNACHI-style residential inspection outline as
 * realistic content. See NOTES.md for how to swap in a real export.
 *
 * It also deliberately includes messy/edge-case rows (an inline image,
 * a table, inline styling, a missing comment name, an unrecognized
 * column, a stray blank row) so the importer's warning system has
 * something real to catch.
 */
const XLSX = require("xlsx");
const path = require("node:path");

const rows = [
  ["Section", "Item", "Comment Name", "Comment Text", "Type", "Recommendation", "Internal ID"],

  // Roof
  ["Roof", "Roof Covering", "Asphalt shingles - serviceable",
    "<p>The roof covering is <strong>asphalt shingle</strong>. At the time of inspection it appeared to be functioning as intended, with normal wear for its age.</p>",
    "Informative", "", "RC-001"],
  ["Roof", "Roof Covering", "Granule loss noted",
    "<p>Moderate granule loss was observed on multiple slopes, most visibly on the <em>south-facing</em> plane. See <a href=\"https://www.nachi.org/roof-inspection\">InterNACHI's roof inspection guide</a> for background.</p>",
    "Limitation", "Monitor annually; budget for replacement within 5-8 years.", "RC-002"],
  ["", "Gutters &amp; Downspouts", "Debris in gutters",
    "<p>Leaf and debris accumulation was present in the rear gutters, restricting flow.</p><ul><li>North side</li><li>Rear span</li></ul>",
    "Deficiency", "Clean gutters and confirm downspouts discharge away from the foundation.", "RC-010"],

  // Exterior
  ["Exterior", "Siding", "Vinyl siding - general condition",
    "<p>Siding material is vinyl lap. No significant damage was observed from ground level.</p>",
    "Informative", "", "EX-001"],
  ["", "Siding", "",
    "<p>A small section of siding near the rear utility meter was loose.</p><img src=\"https://cdn.example-spectora.invalid/photos/siding-1234.jpg\" alt=\"loose siding\" />",
    "Limitation", "", "EX-004"],
  ["", "Grading &amp; Drainage", "Negative grading at foundation",
    "<p style=\"color:#c00;font-family:Arial\">Grading slopes toward the foundation along the west wall.</p>",
    "Deficiency", "Regrade to slope away from the structure a minimum of 6 inches over 10 feet.", "EX-011"],

  // Structure
  ["Structure", "Foundation", "Poured concrete foundation",
    "<p>Foundation type is poured concrete. No signs of significant settlement were observed.</p>",
    "Informative", "", "ST-001"],
  ["Structure", "Foundation", "Hairline cracking",
    "<table><tr><td>Location</td><td>Width</td></tr><tr><td>Northeast corner</td><td>&lt;1/16 in</td></tr></table><p>Hairline, non-structural cracking typical of curing shrinkage.</p>",
    "Informative", "", "ST-003"],

  // Electrical - exercise "General" fallback (no Item value at all for this row)
  ["Electrical", "", "Panel is a 200A Square D",
    "<p>Main panel is rated 200A and manufactured by Square D. Double-tapped breakers were not observed.</p>",
    "Informative", "", "EL-001"],

  // blank spacer row (should be silently skipped, no warning)
  ["", "", "", "", "", "", ""],

  // Plumbing - row with comment text but no comment name (importer should derive one + warn)
  ["Plumbing", "Water Heater", "",
    "<p>40-gallon gas water heater located in the garage, approximately 9 years old based on the manufacture date on the data plate.</p>",
    "Informative", "", "PL-001"],

  // Heating - a row that references content Spectora tracks that we intentionally don't model (recommendation column, already merged) plus an unrecognized column ("Internal ID") consistently present throughout to demonstrate column-level (not row-spam) warnings.
  ["Heating", "Furnace", "Gas furnace operates at time of inspection",
    "<p>Furnace activated normally using thermostat controls and ran through a full cycle without abnormal noise or odor.</p>",
    "Informative", "Recommend annual professional service.", "HV-001"],
];

const ws = XLSX.utils.aoa_to_sheet(rows);
ws["!cols"] = [
  { wch: 12 },
  { wch: 20 },
  { wch: 32 },
  { wch: 70 },
  { wch: 12 },
  { wch: 40 },
  { wch: 10 },
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Comments");

const outPath = path.join(__dirname, "..", "samples", "spectora-export-sample.xlsx");
XLSX.writeFile(wb, outPath);
console.log("Wrote", outPath);
