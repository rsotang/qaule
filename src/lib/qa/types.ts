/** Machine identifier. Base machines are seeded, but users can add their own. */
export type MachineId = string;

export type MachineKind = "linac" | "imaging" | "ct" | "other" | (string & {});

export const MACHINE_KIND_LABELS: Partial<Record<MachineKind, string>> = {
  linac: "Acelerador lineal",
  imaging: "Sistema de imagen",
  ct: "TC / Simulador",
  other: "Otro",
};

/** Un tipo de máquina configurable (persistido en la BD). */
export interface MachineKindDef {
  id: string;
  name: string;
  builtin: boolean;
  categories: string[];
  /** Identificador del icono que se muestra en el panel QA (nombre del archivo en /iconos/, sin extensión). */
  icon?: string | null;
}

/** Iconos disponibles para los tipos de máquina (archivos en public/iconos/). */
export const MACHINE_ICONS: { id: string; label: string }[] = [
  { id: "linac", label: "Acelerador lineal" },
  { id: "ct", label: "TC" },
  { id: "arco-quirurgico", label: "Arco quirúrgico" },
  { id: "cbct-dental", label: "CBCT dental" },
  { id: "cbctlinac", label: "CBCT en linac" },
  { id: "dental", label: "Dental" },
  { id: "generalrx", label: "RX general" },
  { id: "hdr", label: "HDR" },
  { id: "mamo", label: "Mamografía" },
  { id: "mr", label: "Resonancia" },
  { id: "pet", label: "PET" },
  { id: "portatilrx", label: "RX portátil" },
  { id: "spect", label: "SPECT" },
  { id: "us", label: "Ecografía" },
];

/** URL del icono de un tipo de máquina; fallback al icono genérico de TC. */
export function machineIconUrl(icon: string | null | undefined): string {
  return `/iconos/${icon || "ct"}.png`;
}

/** Una categoría de prueba del catálogo (persistida en la BD). */
export interface CategoryDef {
  id: string;
  name: string;
  builtin: boolean;
}

/** Catálogo de tipos y categorías de fábrica (fallback si la BD aún no tiene datos). */
export const BUILTIN_KINDS: MachineKindDef[] = [
  {
    id: "linac",
    name: "Acelerador lineal",
    builtin: true,
    icon: "linac",
    categories: [
      "mechanical_unit",
      "mechanical_table",
      "geometric",
      "mlc",
      "dosimetric_photon",
      "dosimetric_electron",
      "monitor_system",
    ],
  },
  {
    id: "imaging",
    name: "Sistema de imagen",
    builtin: true,
    icon: "ct",
    categories: [
      "image_geometry",
      "image_registration",
      "image_quality_mv",
      "image_quality_cbct",
      "image_sgrt",
    ],
  },
  {
    id: "ct",
    name: "TC / Simulador",
    builtin: true,
    icon: "ct",
    categories: [
      "mechanical_unit",
      "mechanical_table",
      "geometric",
      "mlc",
      "dosimetric_photon",
      "dosimetric_electron",
      "monitor_system",
    ],
  },
  {
    id: "other",
    name: "Otro",
    builtin: true,
    icon: "ct",
    categories: [
      "mechanical_unit",
      "mechanical_table",
      "geometric",
      "mlc",
      "dosimetric_photon",
      "dosimetric_electron",
      "monitor_system",
    ],
  },
  {
    id: "arco-quirurgico",
    name: "Arco quirúrgico",
    builtin: true,
    icon: "arco-quirurgico",
    categories: [
      "image_geometry",
      "image_registration",
      "image_quality_mv",
      "image_quality_cbct",
      "image_sgrt",
    ],
  },
  {
    id: "cbct-dental",
    name: "CBCT dental",
    builtin: true,
    icon: "cbct-dental",
    categories: [
      "image_geometry",
      "image_registration",
      "image_quality_mv",
      "image_quality_cbct",
      "image_sgrt",
    ],
  },
  {
    id: "cbctlinac",
    name: "CBCT en linac",
    builtin: true,
    icon: "cbctlinac",
    categories: [
      "image_geometry",
      "image_registration",
      "image_quality_mv",
      "image_quality_cbct",
      "image_sgrt",
      "mpc",
    ],
  },
  {
    id: "dental",
    name: "Dental (RX)",
    builtin: true,
    icon: "dental",
    categories: [
      "image_geometry",
      "image_registration",
      "image_quality_mv",
      "image_quality_cbct",
      "image_sgrt",
    ],
  },
  {
    id: "generalrx",
    name: "RX general",
    builtin: true,
    icon: "generalrx",
    categories: [
      "image_geometry",
      "image_registration",
      "image_quality_mv",
      "image_quality_cbct",
      "image_sgrt",
    ],
  },
  {
    id: "hdr",
    name: "HDR (Braquiterapia)",
    builtin: true,
    icon: "hdr",
    categories: [
      "mechanical_unit",
      "mechanical_table",
      "geometric",
      "dosimetric_photon",
      "dosimetric_electron",
      "monitor_system",
    ],
  },
  {
    id: "mamo",
    name: "Mamografía",
    builtin: true,
    icon: "mamo",
    categories: [
      "image_geometry",
      "image_registration",
      "image_quality_mv",
      "image_quality_cbct",
      "image_sgrt",
    ],
  },
  {
    id: "mr",
    name: "Resonancia magnética",
    builtin: true,
    icon: "mr",
    categories: [
      "image_geometry",
      "image_registration",
      "image_quality_mv",
      "image_quality_cbct",
      "image_sgrt",
    ],
  },
  {
    id: "pet",
    name: "PET",
    builtin: true,
    icon: "pet",
    categories: [
      "image_geometry",
      "image_registration",
      "image_quality_mv",
      "image_quality_cbct",
      "image_sgrt",
    ],
  },
  {
    id: "portatilrx",
    name: "RX portátil",
    builtin: true,
    icon: "portatilrx",
    categories: [
      "image_geometry",
      "image_registration",
      "image_quality_mv",
      "image_quality_cbct",
      "image_sgrt",
    ],
  },
  {
    id: "spect",
    name: "SPECT",
    builtin: true,
    icon: "spect",
    categories: [
      "image_geometry",
      "image_registration",
      "image_quality_mv",
      "image_quality_cbct",
      "image_sgrt",
    ],
  },
  {
    id: "us",
    name: "Ecografía",
    builtin: true,
    icon: "us",
    categories: [
      "image_geometry",
      "image_registration",
      "image_quality_mv",
      "image_quality_cbct",
      "image_sgrt",
    ],
  },
];

export const BUILTIN_CATEGORIES: CategoryDef[] = [
  { id: "mechanical_unit", name: "Mecánico Unidad", builtin: true },
  { id: "mechanical_table", name: "Mecánico Mesa", builtin: true },
  { id: "geometric", name: "Geométrico Haz", builtin: true },
  { id: "mlc", name: "MLC", builtin: true },
  { id: "dosimetric_photon", name: "Dosimétrico Fotones", builtin: true },
  { id: "dosimetric_electron", name: "Dosimétrico Electrones", builtin: true },
  { id: "monitor_system", name: "Sistema Monitor", builtin: true },
  { id: "image_geometry", name: "Geometría", builtin: true },
  { id: "image_registration", name: "Sistema de Registro", builtin: true },
  { id: "image_quality_mv", name: "Calidad Imagen MV", builtin: true },
  { id: "image_quality_cbct", name: "Calidad Imagen CBCT", builtin: true },
  { id: "image_sgrt", name: "QC SGRT", builtin: true },
  { id: "mpc", name: "MPC (Varian)", builtin: true },
];

export const CATEGORY_LABELS: Partial<Record<Category, string>> = {
  mechanical_unit: "Mecánico Unidad",
  mechanical_table: "Mecánico Mesa",
  geometric: "Geométrico Haz",
  mlc: "MLC",
  dosimetric_photon: "Dosimétrico Fotones",
  dosimetric_electron: "Dosimétrico Electrones",
  monitor_system: "Sistema Monitor",
  image_geometry: "Geometría",
  image_registration: "Sistema de Registro",
  image_quality_mv: "Calidad Imagen MV",
  image_quality_cbct: "Calidad Imagen CBCT",
  image_sgrt: "QC SGRT",
  mpc: "MPC (Varian)",
};

/** Categorías disponibles según el tipo de máquina (los sistemas de imagen no comparten las de los aceleradores). */
export const CATEGORIES_BY_KIND: Partial<Record<MachineKind, Category[]>> = {
  linac: [
    "mechanical_unit",
    "mechanical_table",
    "geometric",
    "mlc",
    "dosimetric_photon",
    "dosimetric_electron",
    "monitor_system",
    "mpc",
  ],
  imaging: [
    "image_geometry",
    "image_registration",
    "image_quality_mv",
    "image_quality_cbct",
    "image_sgrt",
  ],
  ct: [
    "mechanical_unit",
    "mechanical_table",
    "geometric",
    "mlc",
    "dosimetric_photon",
    "dosimetric_electron",
    "monitor_system",
  ],
  other: [
    "mechanical_unit",
    "mechanical_table",
    "geometric",
    "mlc",
    "dosimetric_photon",
    "dosimetric_electron",
    "monitor_system",
  ],
  "arco-quirurgico": [
    "image_geometry",
    "image_registration",
    "image_quality_mv",
    "image_quality_cbct",
    "image_sgrt",
  ],
  "cbct-dental": [
    "image_geometry",
    "image_registration",
    "image_quality_mv",
    "image_quality_cbct",
    "image_sgrt",
  ],
  cbctlinac: [
    "image_geometry",
    "image_registration",
    "image_quality_mv",
    "image_quality_cbct",
    "image_sgrt",
    "mpc",
  ],
  dental: [
    "image_geometry",
    "image_registration",
    "image_quality_mv",
    "image_quality_cbct",
    "image_sgrt",
  ],
  generalrx: [
    "image_geometry",
    "image_registration",
    "image_quality_mv",
    "image_quality_cbct",
    "image_sgrt",
  ],
  hdr: [
    "mechanical_unit",
    "mechanical_table",
    "geometric",
    "dosimetric_photon",
    "dosimetric_electron",
    "monitor_system",
  ],
  mamo: [
    "image_geometry",
    "image_registration",
    "image_quality_mv",
    "image_quality_cbct",
    "image_sgrt",
  ],
  mr: [
    "image_geometry",
    "image_registration",
    "image_quality_mv",
    "image_quality_cbct",
    "image_sgrt",
  ],
  pet: [
    "image_geometry",
    "image_registration",
    "image_quality_mv",
    "image_quality_cbct",
    "image_sgrt",
  ],
  portatilrx: [
    "image_geometry",
    "image_registration",
    "image_quality_mv",
    "image_quality_cbct",
    "image_sgrt",
  ],
  spect: [
    "image_geometry",
    "image_registration",
    "image_quality_mv",
    "image_quality_cbct",
    "image_sgrt",
  ],
  us: [
    "image_geometry",
    "image_registration",
    "image_quality_mv",
    "image_quality_cbct",
    "image_sgrt",
  ],
};

/** Nombre de un tipo de máquina; si no existe, devuelve el id. */
export function machineKindLabel(kind: MachineKind | undefined, kinds?: MachineKindDef[]): string {
  if (!kind) return "—";
  return kinds?.find((k) => k.id === kind)?.name ?? MACHINE_KIND_LABELS[kind] ?? kind;
}

/** Nombre de una categoría; si no existe, devuelve el id. */
export function categoryLabel(cat: string | undefined, cats?: CategoryDef[]): string {
  if (!cat) return "—";
  return cats?.find((c) => c.id === cat)?.name ?? CATEGORY_LABELS[cat as Category] ?? cat;
}

/** Categorías permitidas para un tipo de máquina (BD primero, fallback a catálogo de fábrica). */
export function categoriesForKind(
  kind: MachineKind | undefined,
  kinds?: MachineKindDef[],
  cats?: CategoryDef[],
): Category[] {
  const def = kinds?.find((k) => k.id === kind);
  if (def?.categories.length) return def.categories as Category[];
  return (CATEGORIES_BY_KIND[kind as keyof typeof CATEGORIES_BY_KIND] ??
    (cats ? cats.map((c) => c.id) : [])) as Category[];
}

export const MACHINES: { id: MachineId; name: string; kind: MachineKind }[] = [
  { id: "TB1", name: "TrueBeam 1", kind: "linac" },
  { id: "TB2", name: "TrueBeam 2", kind: "linac" },
  { id: "TB3", name: "TrueBeam 3", kind: "linac" },
  { id: "IMG1", name: "Sistema de Imagen TB1", kind: "imaging" },
  { id: "IMG2", name: "Sistema de Imagen TB2", kind: "imaging" },
  { id: "IMG3", name: "Sistema de Imagen TB3", kind: "imaging" },
  { id: "CTSIM", name: "CT Simulador", kind: "ct" },
];

export type Frequency = "monthly" | "quarterly" | "semiannual" | "annual";
export type Category =
  | "mechanical_unit"
  | "mechanical_table"
  | "geometric"
  | "mlc"
  | "dosimetric_photon"
  | "dosimetric_electron"
  | "monitor_system"
  | "image_geometry"
  | "image_registration"
  | "image_quality_mv"
  | "image_quality_cbct"
  | "image_sgrt"
  | (string & {});

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
export function isCellRefValue(
  v: TextOrRef | undefined,
): v is { kind: "cellRef"; sheet: string; address: string } {
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
  kind?: MachineKind;
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
  return {
    id: `nest-${crypto.randomUUID().slice(0, 7)}`,
    kind: "nest",
    name: textValue(name),
    children: [],
  };
}

export function newNest(name = "Nuevo grupo"): Nest {
  return {
    id: `nest-${crypto.randomUUID().slice(0, 7)}`,
    kind: "nest",
    name: textValue(name),
    children: [],
  };
}

export function newDataPoint(name = "Nuevo dato"): DataPoint {
  return { id: `dp-${crypto.randomUUID().slice(0, 7)}`, kind: "data", name: textValue(name) };
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
  return [
    ...walked.path.map((p) => displayTextOrRef(p, "?")),
    displayTextOrRef(walked.dp.name, "?"),
  ]
    .filter(Boolean)
    .join(" / ");
}

export function allBoundCells(test: TestDef): CellRef[] {
  const refs: CellRef[] = [];
  const visit = (node: TreeNode) => {
    if (node.kind === "data") {
      if (node.cell) refs.push(node.cell);
      for (const v of [node.name, node.unit, node.tolerance, node.reference]) {
        if (isCellRefValue(v) && v.sheet && v.address)
          refs.push({ sheet: v.sheet, address: v.address });
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
      id: `nest-${crypto.randomUUID().slice(0, 7)}`,
      kind: "nest",
      name: node.name,
      children: node.children.map(cloneNodeDeep),
    };
  }
  return {
    ...node,
    id: `dp-${crypto.randomUUID().slice(0, 7)}`,
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
      n.id === targetNestId || (n.kind === "nest" && n.children.some(containsTarget));
    if (containsTarget(found.node)) return root;
  }
  const detached = detach(root, id);
  if (targetNestId === root.id)
    return { ...detached, children: [...detached.children, found.node] };
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

  // "nominal ± delta"  →  { type: "pm", nominal, delta }
  const pmFull = t.match(/^(-?\d+(?:\.\d+)?)\s*[±+-]\s*(\d+(?:\.\d+)?)$/);
  if (pmFull) return { type: "pm", nominal: parseFloat(pmFull[1]), delta: parseFloat(pmFull[2]) };

  // "min - max" or "min a max"
  const range = t.match(/^(-?\d+(?:\.\d+)?)\s*[-–a]\s*(-?\d+(?:\.\d+)?)$/i);
  if (range) return { type: "range", min: parseFloat(range[1]), max: parseFloat(range[2]) };

  // "< 5" or "≤ 5"
  const le = t.match(/^[≤<]=?\s*(\d+(?:\.\d+)?)$/);
  if (le) return { type: "abs", delta: parseFloat(le[1]) };

  // "±5" or plain "5"
  const pmSimple = t.match(/^[±+-]?\s*(\d+(?:\.\d+)?)$/);
  if (pmSimple) return { type: "abs", delta: parseFloat(pmSimple[1]) };

  return { type: "none" };
}

export function evaluateTolerance(
  tol: Tolerance | undefined,
  value: number,
): { inTolerance: boolean; deviation: number } {
  if (!tol) return { inTolerance: true, deviation: 0 };
  switch (tol.type) {
    case "pm":
      return {
        inTolerance: Math.abs(value - tol.nominal) <= tol.delta,
        deviation: value - tol.nominal,
      };
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

/** Seeded machines plus any user-created ones from the database. */
export function mergeMachineList(
  rows?: { id: MachineId; name: string; kind?: MachineKind }[],
): { id: MachineId; name: string; kind: MachineKind }[] {
  const out = (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    kind: (r.kind ?? MACHINES.find((m) => m.id === r.id)?.kind ?? "other") as MachineKind,
  }));
  for (const m of MACHINES) if (!out.some((o) => o.id === m.id)) out.push({ ...m });
  return out;
}
