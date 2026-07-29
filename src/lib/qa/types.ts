export type MachineId = "TB1" | "TB2" | "TB3" | "IMG1" | "IMG2" | "IMG3" | "CTSIM";

export const MACHINES: { id: MachineId; name: string }[] = [
  { id: "TB1", name: "TrueBeam 1" },
  { id: "TB2", name: "TrueBeam 2" },
  { id: "TB3", name: "TrueBeam 3" },
  { id: "IMG1", name: "Sistema de Imagen TB1" },
  { id: "IMG2", name: "Sistema de Imagen TB2" },
  { id: "IMG3", name: "Sistema de Imagen TB3" },
  { id: "CTSIM", name: "CT Simulador" },
];

export type Frequency = "monthly" | "quarterly" | "semiannual" | "annual";
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

/** A user-supplied value: either typed text or a workbook cell reference. */
export type TextOrRef =
  | { kind: "text"; text: string }
  | { kind: "cellRef"; sheet: string; address: string };

/** Back-compat alias used by older code paths. */
export type ToleranceValue = TextOrRef;

export function textValue(text: string): TextOrRef {
  return { kind: "text", text };
}
export function refValue(sheet: string, address: string): TextOrRef {
  return { kind: "cellRef", sheet, address };
}
export function isCellRefValue(v: TextOrRef | undefined): v is { kind: "cellRef"; sheet: string; address: string } {
  return !!v && v.kind === "cellRef";
}
/** Human display of a TextOrRef without resolving the workbook. */
export function displayTextOrRef(v: TextOrRef | undefined, placeholder = ""): string {
  if (!v) return placeholder;
  if (v.kind === "text") return v.text || placeholder;
  if (!v.sheet || !v.address) return placeholder;
  return `[${v.sheet}!${v.address}]`;
}

export interface DataPoint {
  id: string;
  kind: "data";
  /** Display name — typed text or cell reference */
  name: TextOrRef;
  /** Value cell (where the measured number lives) */
  cell?: CellRef;
  /** Optional add-ins (user toggles them on) */
  unit?: TextOrRef;
  tolerance?: TextOrRef;
  reference?: TextOrRef;
  /** parsed/derived for plotting; recomputed at import time */
  parsedTolerance?: Tolerance;
}

export interface Nest {
  id: string;
  kind: "nest";
  name: TextOrRef;
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

export type MachineState = "ok" | "warning" | "critical";

export interface MachineRecord {
  id: MachineId;
  name: string;
  activeTemplateId?: string;
  state?: MachineState;
  stateNote?: string;
}

export interface ImportRecord {
  id: string;
  machineId: MachineId;
  fileName: string;
  importedAt: string;
  sourceDate: string;
  fileHash: string;
}

export interface CalendarEntry {
  testName: string;
  /** Specific scheduled dates (YYYY-MM-DD) */
  dates: string[];
  /** Months scheduled with no specific day (YYYY-MM) */
  months: string[];
  performer?: string;
}

export interface CalendarRecord {
  id: "default";
  updatedAt: string;
  fileName?: string;
  entries: CalendarEntry[];
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
  return { id: `nest-${Math.random().toString(36).slice(2, 9)}`, kind: "nest", name: textValue(name), children: [] };
}

export function newNest(name = "Nuevo grupo"): Nest {
  return { id: `nest-${Math.random().toString(36).slice(2, 9)}`, kind: "nest", name: textValue(name), children: [] };
}

export function newDataPoint(name = "Nuevo dato"): DataPoint {
  return { id: `dp-${Math.random().toString(36).slice(2, 9)}`, kind: "data", name: textValue(name) };
}

export interface WalkedDataPoint {
  dp: DataPoint;
  path: TextOrRef[]; // names of ancestor nests excluding root
}

export function walkDataPoints(test: TestDef): WalkedDataPoint[] {
  const out: WalkedDataPoint[] = [];
  const walk = (node: TreeNode, path: TextOrRef[]) => {
    if (node.kind === "data") {
      out.push({ dp: node, path });
    } else {
      for (const c of node.children) walk(c, [...path, node.name]);
    }
  };
  for (const c of test.root.children) walk(c, []);
  return out;
}

export function dpSeriesLabel(walked: WalkedDataPoint): string {
  return [...walked.path.map((p) => displayTextOrRef(p, "?")), displayTextOrRef(walked.dp.name, "?")]
    .filter(Boolean)
    .join(" / ");
}

export function allBoundCells(test: TestDef): CellRef[] {
  const refs: CellRef[] = [];
  const visit = (node: TreeNode) => {
    if (node.kind === "data") {
      if (node.cell) refs.push(node.cell);
      for (const v of [node.name, node.unit, node.tolerance, node.reference]) {
        if (isCellRefValue(v) && v.sheet && v.address) refs.push({ sheet: v.sheet, address: v.address });
      }
    } else {
      if (isCellRefValue(node.name) && node.name.sheet && node.name.address)
        refs.push({ sheet: node.name.sheet, address: node.name.address });
      for (const c of node.children) visit(c);
    }
  };
  for (const c of test.root.children) visit(c);
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

/** Deep-clone a node, assigning fresh ids to every nested element. */
export function cloneNodeDeep(node: TreeNode): TreeNode {
  if (node.kind === "nest") {
    return {
      id: `nest-${Math.random().toString(36).slice(2, 9)}`,
      kind: "nest",
      name: node.name,
      children: node.children.map(cloneNodeDeep),
    };
  }
  return {
    ...node,
    id: `dp-${Math.random().toString(36).slice(2, 9)}`,
    cell: node.cell ? { ...node.cell } : undefined,
  };
}

/** Insert `newNode` as a sibling immediately after the node with id `afterId`. */
export function insertAfter(root: Nest, afterId: string, newNode: TreeNode): Nest {
  const visit = (n: Nest): Nest => {
    const idx = n.children.findIndex((c) => c.id === afterId);
    if (idx !== -1) {
      const next = [...n.children];
      next.splice(idx + 1, 0, newNode);
      return { ...n, children: next };
    }
    return {
      ...n,
      children: n.children.map((c) => (c.kind === "nest" ? visit(c) : c)),
    };
  };
  return visit(root);
}

// ---------- tolerance helpers ----------

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

// ---------- calendar tasks (traceability) ----------

export interface CalendarTask {
  /** `${ym}::${testName}` */
  id: string;
  ym: string;
  testName: string;
  done: boolean;
  completedBy?: string;
  completedByName?: string;
  completedAt?: string;
  note?: string;
}

export function calendarTaskId(ym: string, testName: string): string {
  return `${ym}::${testName.trim().toLowerCase()}`;
}
