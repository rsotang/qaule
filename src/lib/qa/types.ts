export type MachineId = "TB1" | "TB2" | "TB3";

export const MACHINES: { id: MachineId; name: string }[] = [
  { id: "TB1", name: "TrueBeam 1" },
  { id: "TB2", name: "TrueBeam 2" },
  { id: "TB3", name: "TrueBeam 3" },
];

export type Frequency = "monthly" | "quarterly" | "annual";
export type Category =
  | "mechanical_unit"
  | "mechanical_table"
  | "geometric"
  | "mlc"
  | "dosimetric_photon"
  | "dosimetric_electron"
  | "monitor_system";

export const CATEGORY_LABELS: Record<Category, string> = {
  mechanical_unit: "Mecánico Unidad",
  mechanical_table: "Mecánico Mesa",
  geometric: "Geométrico Haz",
  mlc: "MLC",
  dosimetric_photon: "Dosimétrico Fotones",
  dosimetric_electron: "Dosimétrico Electrones",
  monitor_system: "Sistema Monitor",
};

export type Tolerance =
  | { type: "pm"; nominal: number; delta: number }
  | { type: "range"; min: number; max: number }
  | { type: "abs"; delta: number }
  | { type: "none" };

export interface CellRef {
  sheet: string;
  address: string; // A1
  label?: string;
}

/** Tolerance entered by the user — either literal text or a workbook cell reference */
export type ToleranceValue =
  | { kind: "literal"; text: string }
  | { kind: "cellRef"; sheet: string; address: string };

export interface DataPoint {
  id: string;
  kind: "data";
  name: string;
  cell?: CellRef;
  unit?: string;
  tolerance?: ToleranceValue;
  /** parsed/derived for plotting; recomputed at import time */
  parsedTolerance?: Tolerance;
}

export interface Nest {
  id: string;
  kind: "nest";
  name: string;
  children: TreeNode[];
}

export type TreeNode = Nest | DataPoint;

export interface TestDef {
  id: string;
  name: string;
  category: Category;
  frequency: Frequency;
  admin: {
    performers?: CellRef[];
    date?: CellRef;
  };
  root: Nest;
}

export interface Template {
  id: string;
  machineId: MachineId;
  name: string;
  version: number;
  createdAt: string;
  defaultDateCell?: CellRef;
  tests: TestDef[];
}

export interface MachineRecord {
  id: MachineId;
  name: string;
  activeTemplateId?: string;
}

export interface ImportRecord {
  id: string;
  machineId: MachineId;
  fileName: string;
  importedAt: string;
  sourceDate: string;
  fileHash: string;
}

export interface Measurement {
  id: string;
  importId: string;
  machineId: MachineId;
  testId: string;
  /** dot-joined nest path + data-point name; also the chart series key */
  cellLabel: string;
  date: string;
  value: number;
}

// ---------- tree helpers ----------

export function emptyNest(name = "raíz"): Nest {
  return { id: `nest-${Math.random().toString(36).slice(2, 9)}`, kind: "nest", name, children: [] };
}

export function newNest(name = "Nuevo grupo"): Nest {
  return { id: `nest-${Math.random().toString(36).slice(2, 9)}`, kind: "nest", name, children: [] };
}

export function newDataPoint(name = "Nuevo dato"): DataPoint {
  return { id: `dp-${Math.random().toString(36).slice(2, 9)}`, kind: "data", name };
}

export interface WalkedDataPoint {
  dp: DataPoint;
  path: string[]; // names of ancestor nests excluding root
}

export function walkDataPoints(test: TestDef): WalkedDataPoint[] {
  const out: WalkedDataPoint[] = [];
  const walk = (node: TreeNode, path: string[]) => {
    if (node.kind === "data") {
      out.push({ dp: node, path });
    } else {
      for (const c of node.children) walk(c, [...path, node.name]);
    }
  };
  // Skip root name in path
  for (const c of test.root.children) walk(c, []);
  return out;
}

export function dpSeriesLabel(walked: WalkedDataPoint): string {
  return [...walked.path, walked.dp.name].filter(Boolean).join(" / ");
}

export function allBoundCells(test: TestDef): CellRef[] {
  const refs: CellRef[] = [];
  for (const w of walkDataPoints(test)) if (w.dp.cell) refs.push(w.dp.cell);
  if (test.admin.date) refs.push(test.admin.date);
  if (test.admin.performers) for (const p of test.admin.performers) refs.push(p);
  return refs;
}

/** Update a single node anywhere in the tree (immutably). */
export function updateNode(root: Nest, id: string, patch: (n: TreeNode) => TreeNode): Nest {
  const visit = (n: TreeNode): TreeNode => {
    if (n.id === id) return patch(n);
    if (n.kind === "nest") return { ...n, children: n.children.map(visit) };
    return n;
  };
  return visit(root) as Nest;
}

export function addChild(root: Nest, parentId: string, child: TreeNode): Nest {
  return updateNode(root, parentId, (n) =>
    n.kind === "nest" ? { ...n, children: [...n.children, child] } : n,
  );
}

export function removeNode(root: Nest, id: string): Nest {
  const visit = (n: Nest): Nest => ({
    ...n,
    children: n.children.filter((c) => c.id !== id).map((c) => (c.kind === "nest" ? visit(c) : c)),
  });
  return visit(root);
}

// ---------- tolerance helpers ----------

/** Parse literal tolerance text such as "±2", "2", "1.5 - 3", "≤0.5" into a Tolerance. */
export function parseToleranceText(text: string): Tolerance {
  const t = text.trim().replace(",", ".");
  if (!t) return { type: "none" };
  const pm = t.match(/^[±+\-]?\s*(\d+(?:\.\d+)?)$/);
  const range = t.match(/^(-?\d+(?:\.\d+)?)\s*[-–a]\s*(-?\d+(?:\.\d+)?)$/i);
  const le = t.match(/^[≤<]=?\s*(\d+(?:\.\d+)?)$/);
  if (range) return { type: "range", min: parseFloat(range[1]), max: parseFloat(range[2]) };
  if (le) return { type: "abs", delta: parseFloat(le[1]) };
  if (t.startsWith("±")) {
    const n = parseFloat(t.slice(1));
    if (isFinite(n)) return { type: "abs", delta: n };
  }
  if (pm) return { type: "abs", delta: parseFloat(pm[1]) };
  return { type: "none" };
}

export function evaluateTolerance(
  tol: Tolerance | undefined,
  value: number,
): { inTolerance: boolean; deviation: number } {
  if (!tol) return { inTolerance: true, deviation: 0 };
  switch (tol.type) {
    case "pm":
      return { inTolerance: Math.abs(value - tol.nominal) <= tol.delta, deviation: value - tol.nominal };
    case "abs":
      return { inTolerance: Math.abs(value) <= tol.delta, deviation: value };
    case "range":
      return { inTolerance: value >= tol.min && value <= tol.max, deviation: 0 };
    case "none":
      return { inTolerance: true, deviation: 0 };
  }
}

export function toleranceBand(tol: Tolerance | undefined): { min: number; max: number } | null {
  if (!tol) return null;
  switch (tol.type) {
    case "pm":
      return { min: tol.nominal - tol.delta, max: tol.nominal + tol.delta };
    case "abs":
      return { min: -tol.delta, max: tol.delta };
    case "range":
      return { min: tol.min, max: tol.max };
    case "none":
      return null;
  }
}
