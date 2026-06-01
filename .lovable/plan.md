# Plan: Nested Template Editor

## Goal
Replace the flat `cells[]` per test with a tree of **nests** that can contain other nests or **data points**. Each test also gets **admin cells** (performers, date). Each data point has its own cell ref, tolerance, and unit.

## New data model (`src/lib/qa/types.ts`)

```ts
type ToleranceValue =
  | { kind: "literal"; text: string }      // free text, e.g. "±2 mm"
  | { kind: "cellRef"; sheet: string; address: string };

interface DataPoint {
  id: string;
  kind: "data";
  name: string;                // e.g. "Beam center"
  cell: CellRef;               // single cell with the value
  unit?: string;
  tolerance?: ToleranceValue;  // optional
  // optional structured tolerance preserved for charting
  parsedTolerance?: Tolerance;
}

interface Nest {
  id: string;
  kind: "nest";
  name: string;                // e.g. "Energy 6 MV" / "Profile" / "PDD"
  children: Array<Nest | DataPoint>;
}

interface TestDef {
  id: string;
  name: string;                // e.g. "Sistema Monitor Starcheck"
  category: Category;
  frequency: Frequency;
  admin: {
    performers?: CellRef[];    // one or more name cells
    date?: CellRef;
  };
  root: Nest;                  // top-level container; children are nests or data points
}
```

Keep `evaluateTolerance` / `toleranceBand` working off `parsedTolerance` when present (parse simple `±X`, `X-Y`, or cell-ref-resolved numbers later in the import pipeline).

## UI: `templates.$machine.tsx` rewrite

A tree editor on the left, a cell picker on the right.

```text
[ + Add test ]
▾ Sistema Monitor Starcheck     [✎ name] [🗑]
   Admin:
     Performers: [+ add cell] (B3) (B4)
     Date:       (B2)               [pick]
   ▾ Energy 6 MV                [+ nest] [+ data] [🗑]
      ▾ Profile                 [+ nest] [+ data] [🗑]
         • Beam center  C10  unit:[mm]  tol:[±2]      [🗑]
         • Homogeneity  D10   unit:[%]  tol:[ref H2]  [🗑]
      ▸ PDD
   ▸ Energy 10 MV
```

Interactions:
- **+ nest** / **+ data** buttons on each Nest add a child.
- A data row shows: name input, cell ref chip (click to pick), unit input, tolerance input with a toggle "text ↔ cell ref".
- Clicking any chip activates that slot; next cell click in the right-side `CellPicker` fills it. A small "Active target" indicator shows what's being assigned (e.g. "Filling: Beam center → value cell").
- Admin cells use the same picker flow.

Reuse existing `CellPicker`; extend `selected` to highlight all addresses currently bound across the active test.

## Migration
- Bump IndexedDB `qa-dashboard` from v1 → v2; on upgrade, convert old `Template.tests[].cells[]` into a single `root` nest with each cell as a `DataPoint`, leaving `admin` empty. Old `defaultDateCell` becomes each test's `admin.date` if not set.
- Drop `autoBuildTemplate`'s assumption of flat cells; reshape its output to use the new model (each detected code → test with `root` containing detected value cells as data points). Keep behavior so existing seeded templates still load.

## Import pipeline (`imports.tsx`, `seed.ts` consumers)
- Replace flat `test.cells` traversal with a recursive walk over `root` that yields `{ testId, path: string[], dataPoint }` and produces `Measurement` rows. `cellLabel` becomes the joined nest path + data point name.
- Tolerance parsing: if `tolerance.kind === "literal"`, regex `±N`, `N-M`, or plain number → `parsedTolerance`. If `cellRef`, resolve from the workbook at import time.

## Files touched
- `src/lib/qa/types.ts` — new model + tolerance parser helper.
- `src/lib/qa/db.ts` — schema v2 + migration.
- `src/lib/qa/seed.ts` — emit new shape.
- `src/lib/qa/excel.ts` — (if needed) helper to resolve a `CellRef` to a value.
- `src/routes/templates.$machine.tsx` — full editor rewrite.
- `src/routes/imports.tsx` — recursive measurement extraction.
- `src/components/qa/TestChart.tsx` — read from data points instead of cells.

## Out of scope (for this iteration)
- Reordering nests via drag & drop (use simple up/down buttons).
- Sharing nests across tests.
- Importing tolerances from the workbook automatically.

Ready to implement on approval.