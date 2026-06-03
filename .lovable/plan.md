# Dashboard refactor + new Visualization tab

## 1. Navigation
- Update `src/components/qa/AppShell.tsx` to add a new nav link **Visualización** between Dashboard and Importaciones, using a `LineChart` icon.

## 2. Data model (small additions)
- Extend `MachineRecord` in `src/lib/qa/types.ts` with an optional `state: "ok" | "warning" | "critical"` and `stateNote?: string`.
- Add `updateMachineState(id, state, note)` to `src/lib/qa/db.ts` (writes the existing `machines` store, bumping cache version is not needed).

## 3. Dashboard (`src/routes/index.tsx`) — simplified summary only
Replace the current per-test chart grid with a high-level overview:

- **Per-machine cards** (one card per machine in `MACHINES`):
  - Machine name + manual **state badge** (OK / Warning / Critical) with an inline `Select` so the user can change it; persists via `updateMachineState`.
  - Counts of tests in the active template, broken down by frequency (M / T / A) and totals.
  - Last import: date + file name (or "Sin importaciones").
  - "Última importación: OK / N puntos fuera de tolerancia" derived from the most recent import's measurements via `evaluateTolerance`.
- **Global OOT alerts panel** below the cards: list of `{machine, test, dataPoint, date, value}` for any out-of-tolerance measurement in the latest import per machine, with a link to open it in the new Visualization tab pre-filtered.

Remove all `TestChart` rendering, category/frequency filters, and the machine `Tabs` switcher from this page — they move to the Visualization tab.

## 4. New Visualization tab
Add route `src/routes/visualization.tsx` (file becomes `/visualization`).

Layout: two-column on `lg`, stacked on smaller screens, full viewport width via existing `AppShell`.

### Left column — Selection panel
1. **Machines**: multi-select (checkbox list of `MACHINES`).
2. **Tests**: multi-select. Source = union of tests across the selected machines' active templates, grouped by machine. Search box on top.
3. **Series tree**: for each selected test, render the nest tree (`walkDataPoints`) with checkboxes per data point and per nest (toggling a nest toggles its descendants). Default = all on.
4. **Filters**:
   - Date range (from / to) — uses `<input type="date">`.
   - "Solo fuera de tolerancia" toggle.
   - "Agrupar por nest" toggle — when on, sums/averages siblings under each nest into a single series (default = off, show individual points).

All selection state is mirrored in URL search params via `validateSearch` + `zodValidator` so views are shareable. Keys: `machines[]`, `tests[]`, `points[]`, `from`, `to`, `ootOnly`, `groupByNest`.

### Right column — Charts
- One chart card per selected test (reusing logic from `TestChart` but extended to accept an explicit series filter and date filter).
- Refactor `TestChart` minimally: add optional props `seriesFilter?: string[]`, `dateFrom?`, `dateTo?`, `ootOnly?`, `groupByNest?`. Existing Dashboard usage is removed, so no compatibility shim needed.
- When `groupByNest` is on, series key becomes the nest path (one less segment); values are averaged per date.
- Tooltip + legend always on in this view; chart height larger (`h-[320px]`).
- Empty state when no machines/tests selected: friendly hint card.

## 5. Cross-linking
- OOT alerts on the Dashboard link to `/visualization?machines=...&tests=...&ootOnly=true`.

## 6. Files touched
- `src/components/qa/AppShell.tsx` — add nav link.
- `src/lib/qa/types.ts` — add `state` to `MachineRecord`.
- `src/lib/qa/db.ts` — `updateMachineState` helper.
- `src/routes/index.tsx` — rewrite as summary dashboard.
- `src/routes/visualization.tsx` — new file (selection + charts).
- `src/components/qa/TestChart.tsx` — add filter props (series / date / OOT / groupByNest).
- `src/components/qa/VisualizationPanel.tsx` (new) — selection sidebar UI to keep the route file lean.

## Out of scope
- No changes to template editor, importer, or measurement schema.
- No backend; everything stays in IndexedDB as today.
