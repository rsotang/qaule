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
  /** Machine the entry belongs to (undefined = applies to all machines) */
  machineId?: MachineId;
  /** Test group, e.g. "QC IGRT", "C. Mecánico Unidad(m)" */
  category?: string;
  detail?: string;
  patientId?: string;
  course?: string;
  plan?: string;
  /** Estimated duration, e.g. "10'" */
  time?: string;
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

// ---------- moving nodes ----------

interface FoundParent {
  parent: Nest;
  index: number;
  node: TreeNode;
}

function findParent(root: Nest, id: string): FoundParent | null {
  const visit = (n: Nest): FoundParent | null => {
    const idx = n.children.findIndex((c) => c.id === id);
    if (idx !== -1) return { parent: n, index: idx, node: n.children[idx] };
    for (const c of n.children) {
      if (c.kind === "nest") {
        const r = visit(c);
        if (r) return r;
      }
    }
    return null;
  };
  return visit(root);
}

/** Remove a node from the tree, returning the new root (no id changes). */
function detach(root: Nest, id: string): Nest {
  const visit = (n: Nest): Nest => ({
    ...n,
    children: n.children.filter((c) => c.id !== id).map((c) => (c.kind === "nest" ? visit(c) : c)),
  });
  return visit(root);
}

/** Move a node up or down among its siblings. */
export function moveNodeVertical(root: Nest, id: string, dir: -1 | 1): Nest {
  const found = findParent(root, id);
  if (!found) return root;
  const target = found.index + dir;
  if (target < 0 || target >= found.parent.children.length) return root;
  const next = [...found.parent.children];
  const [n] = next.splice(found.index, 1);
  next.splice(target, 0, n);
  return updateNode(root, found.parent.id, (p) => ({ ...(p as Nest), children: next })) as Nest;
}

/** Can the node be moved into the sibling nest directly above it? */
export function canIndent(root: Nest, id: string): boolean {
  const found = findParent(root, id);
  if (!found || found.index === 0) return false;
  return found.parent.children[found.index - 1].kind === "nest";
}

/** Move a node inside the previous sibling nest (as its last child). */
export function indentNode(root: Nest, id: string): Nest {
  const found = findParent(root, id);
  if (!found || found.index === 0) return root;
  const prev = found.parent.children[found.index - 1];
  if (prev.kind !== "nest") return root;
  const detached = detach(root, id);
  return addChild(detached, prev.id, found.node);
}

/** Can the node be moved out of its parent nest? */
export function canOutdent(root: Nest, id: string): boolean {
  const found = findParent(root, id);
  return !!found && found.parent.id !== root.id;
}

/** Move a node out of its parent nest, placing it right after the parent. */
export function outdentNode(root: Nest, id: string): Nest {
  const found = findParent(root, id);
  if (!found || found.parent.id === root.id) return root;
  const detached = detach(root, id);
  return insertAfter(detached, found.parent.id, found.node);
}

/** Move a node into a specific nest (as last child). Rejects moving a nest into itself. */
export function moveNodeInto(root: Nest, id: string, targetNestId: string): Nest {
  if (id === targetNestId) return root;
  const found = findParent(root, id);
  if (!found) return root;
  if (found.node.kind === "nest") {
    const containsTarget = (n: TreeNode): boolean =>
      n.id === targetNestId ||
      (n.kind === "nest" && n.children.some(containsTarget));
    if (containsTarget(found.node)) return root;
  }
  const detached = detach(root, id);
  if (targetNestId === root.id) return { ...detached, children: [...detached.children, found.node] };
  return addChild(detached, targetNestId, found.node);
}

/** List of nests available as move targets (excluding the node itself and its descendants). */
export function listNestTargets(root: Nest, excludeId: string): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const walk = (n: Nest, path: string[]) => {
    for (const c of n.children) {
      if (c.kind !== "nest") continue;
      if (c.id === excludeId) continue;
      const label = [...path, displayTextOrRef(c.name, "grupo")].join(" / ");
      out.push({ id: c.id, label });
      walk(c, [...path, displayTextOrRef(c.name, "grupo")]);
    }
  };
  walk(root, []);
  return out;
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
  /** True when the test has been physically measured */
  measured: boolean;
  measuredBy?: string;
  measuredByName?: string;
  measuredAt?: string;
  /** True when the test results have been analyzed/reviewed */
  analyzed: boolean;
  analyzedBy?: string;
  analyzedByName?: string;
  analyzedAt?: string;
  /** Legacy computed state: both measured and analyzed */
  done: boolean;
  completedBy?: string;
  completedByName?: string;
  completedAt?: string;
  note?: string;
}

export function calendarTaskDone(task: CalendarTask): boolean {
  return task.measured && task.analyzed;
}

export function calendarTaskId(ym: string, testName: string, machineId?: string): string {
  const base = `${ym}::${testName.trim().toLowerCase()}`;
  return machineId ? `${base}::${machineId.toLowerCase()}` : base;

}
