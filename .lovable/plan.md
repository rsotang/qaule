## Goal

A browser-only QA dashboard for three linacs (TB1, TB2, TB3) that ingests monthly `.xlsm` files and shows time-series of numeric QA parameters with tolerance bands. All data, parsed values, and mapping templates live in the browser (IndexedDB). No backend, no login.

## How import works

1. User picks a machine (TB1/TB2/TB3) and uploads its monthly `.xlsm`.
2. App parses the workbook with `xlsx` (SheetJS) entirely in the browser.
3. App applies the **active mapping template** for that machine: each test definition says "read cell `E15` on sheet `C. Mecanico Unidad (m)`", and the value plus an auto-detected date (from the standard `Fecha:` cell on each sheet, falling back to a date input on upload) becomes one data point.
4. App stores measurements in IndexedDB, keyed by `(machine, testId, date)`. Re-importing the same file updates instead of duplicating.

## Mapping template editor (the visual cell-picker)

A dedicated `/templates` page lets the user define what tests exist and where their values live, without code changes.

- Upload a reference `.xlsm` (e.g. the March file you provided) once.
- Browse it sheet-by-sheet in a spreadsheet-like grid (`react-data-grid` or a lightweight custom grid). Frozen headers, scroll, click a cell to select it.
- For each test entry, fill: name, category (mechanical, geometric, dosimetric, monitor system, MLC...), energy/modality tag (6MV, 10MV, 6FFF, electron 6/9/12/15/18 MeV, N/A), frequency (monthly / quarterly / annual), unit, tolerance (± value or min/max), and one or more cell references picked by clicking.
- Multi-cell tests supported (e.g. gantry 0/90/180/270 → 4 cells under one test, plotted as 4 series).
- Templates are versioned per machine. TB1, TB2, TB3 can share a base template or diverge. Export/import template as JSON for backup or to share between machines.
- A "Detect Fecha" helper scans each sheet for the `Fecha:` label and remembers the date cell location so monthly imports auto-date themselves.

To seed the work, I'll pre-build an initial template from your March TB2 file covering the obvious numeric tests I already see:

- `C. Mecanico Unidad (m)`: gantry angle indicator errors (4 angles), laser-vs-reticle distances, ceiling laser deviations
- `C.Dosim Haz Cuba(FOT)` for 6/10 MV: Zmax, TPR20/10, field size X/Y, penumbra ±, flatness/homogeneity, symmetry X/Y, IU X/Y
- `C.Dosim Haz Cuba(ELEC)` for electron energies: equivalent dosimetric params
- `Caract Sistema Monitor Fot/Elect`: output (UM2 per 100 MU), repeatability, P,T correction
- `Param Geom Haz Rad y sist colim`: Winston-Lutz components, field-light vs radiation coincidence
- `MLC PD (m)`: MLC picket-fence / leaf position deviations

You can edit, delete, or add to any of these in the template editor.

## Dashboard

`/` route — main view:

- Machine selector (TB1 / TB2 / TB3) and a multi-select for energies.
- Category filter and frequency filter (monthly / quarterly / annual) so quarterly and annual tests don't get squashed against the monthly density.
- Grid of small-multiple line charts (Recharts), one per test. Each chart:
  - X axis = date, Y axis = value with unit.
  - Tolerance band shown as a translucent green region; out-of-tolerance points highlighted red.
  - Hover tooltip shows date, value, deviation, and the source file name.
  - Multi-series tests (e.g. 4 gantry angles, or 6/10 MV) plotted as overlaid lines.
- A "click a chart → detail" view with the full history table, CSV export of that test, and the ability to delete a bad import.
- A small status header: per-machine last-import date and count of out-of-tolerance points in the last 12 months.

## Imports page

`/imports` route — manages uploaded files:

- Drag-and-drop one or several `.xlsm` files; each is assigned to a machine (auto-detected from the `Equipo:` cell when possible, otherwise asked).
- Shows a preview: which tests were extracted, with values; user confirms before committing to IndexedDB.
- Lists past imports with file name, machine, date, count of values; delete reverses the import.

## Technical details

- **Stack:** TanStack Start (already set up), Tailwind, shadcn/ui, Recharts, `xlsx` (SheetJS) for parsing, `idb` for typed IndexedDB access, `zod` for template schema validation. Everything client-side — no server functions, no Lovable Cloud.
- **Routes:** `src/routes/index.tsx` (dashboard), `src/routes/imports.tsx`, `src/routes/templates.tsx`, `src/routes/templates.$machine.tsx` (per-machine editor).
- **Data model (IndexedDB):**
  - `machines`: `{ id: 'TB1'|'TB2'|'TB3', name, activeTemplateId }`
  - `templates`: `{ id, machineId, version, createdAt, tests: TestDef[] }` where `TestDef = { id, name, category, energy, frequency, unit, tolerance: {type:'pm'|'range', ...}, cells: [{sheet, address, label?}], dateCell?: {sheet, address} }`
  - `imports`: `{ id, machineId, fileName, importedAt, sourceDate, fileHash }`
  - `measurements`: `{ id, importId, machineId, testId, cellLabel, date, value, inTolerance }`
- **Parsing:** `xlsx` reads cells by A1 address. Empty/non-numeric cells become null (skipped). Dates parsed from Excel serial or string. Re-importing the same `(machineId, fileHash)` overwrites previous measurements from that file.
- **Tolerance evaluation:** done at render time from `TestDef.tolerance`, not stored, so editing a tolerance updates the chart immediately.
- **Backup:** Settings page button to export all IndexedDB contents (templates + measurements) as a single JSON file, and re-import. Critical because data is browser-local.

## Out of scope (for this first build)

- The qualitative `Resultados` sheet (can be added later).
- Frequency due-date reminders and out-of-tolerance email alerts.
- Multi-user sync — you chose local-only.

## Build order

1. Project shell: routes, IndexedDB wrapper, machine seed (TB1/TB2/TB3), shared layout with nav.
2. Excel parser utility + `Fecha:` auto-detect, with unit tests against your sample file.
3. Template editor with cell picker; seed an initial TB2 template from your March file.
4. Imports page (upload → preview → commit).
5. Dashboard with filters, small-multiple charts, tolerance bands, detail view.
6. Backup export/import.
