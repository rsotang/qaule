// Parsing + modelado de los resultados del MPC (Machine Performance Check) de
// Varian. Cada carpeta de resultados contiene:
//   - Check.xml     → metadatos del chequeo (máquina, fecha, energía, plantilla, evaluación)
//   - Results.csv   → "Name [Unit], Value, Threshold, Evaluation Result"
// Los datos se guardan como medidas normales (testId "mpc") cuya etiqueta es
// "energía / grupo / ... / parámetro [unidad]", y una plantilla sintética por
// máquina ("MPC (Varian)") aporta unidades y tolerancias a la visualización.

import {
  emptyNest,
  textValue,
  walkDataPoints,
  dpSeriesLabel,
  displayTextOrRef,
  type DataPoint,
  type MachineId,
  type Nest,
  type Template,
  type TestDef,
} from "./types";

export const MPC_TEST_ID = "mpc";
export const MPC_TEMPLATE_ID = (machineId: MachineId) => `mpc-${machineId}`;
export const MPC_TEST_NAME = "MPC (Varian)";
export const MPC_CATEGORY = "mpc";

/** Una fila de Results.csv ya parseada. */
export interface MpcRow {
  /** Nombre completo con la ruta, p. ej. "CollimationGroup/MLCGroup/MLCMaxOffsetA [mm]" */
  name: string;
  /** Unidad extraída de "[...]" al final del nombre, p. ej. "mm" */
  unit: string;
  value: number;
  threshold: number | null;
  result: string;
}

/** Resumen de una carpeta MPC parseada, listo para la vista previa. */
export interface MpcFolderPreview {
  folderName: string;
  hash: string;
  importId: string;
  serial: string | null;
  date: string | null;
  energy: string | null;
  templateId: string | null;
  evaluation: string | null;
  isBaseline: boolean;
  rows: MpcRow[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

async function sha256(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Lee texto de un File (UTF-8). */
function readText(file: File): Promise<string> {
  return file.text();
}

// ---------- Check.xml ----------

export interface CheckInfo {
  date: string | null;
  energy: string | null;
  serial: string | null;
  templateId: string | null;
  evaluation: string | null;
  isBaseline: boolean;
}

function xmlText(doc: Document, selector: string): string | null {
  try {
    const el = doc.querySelector(selector);
    const t = el?.textContent?.trim() ?? "";
    return t || null;
  } catch {
    return null;
  }
}

/** Parsea Check.xml y extrae los metadatos relevantes. */
export function parseCheckXml(xml: string): CheckInfo {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Check.xml no es XML válido");
  }
  const rawDate = xmlText(doc, "Check > Date");
  const m = rawDate?.match(DATE_RE);
  return {
    date: m ? m[0] : null,
    energy: xmlText(doc, "Check > Beams > Beam > Energy"),
    serial: xmlText(doc, "Check > MachineSerialNumber"),
    templateId: xmlText(doc, "Check > Template > ID"),
    evaluation: xmlText(doc, "Check > Evaluation"),
    isBaseline: xmlText(doc, "Check > IsBaseline") === "true",
  };
}

/** Metadatos que se pueden inferir del nombre de la carpeta si falta Check.xml. */
export function folderNameInfo(folderName: string): {
  serial: string | null;
  date: string | null;
  templateId: string | null;
} {
  const dateM = folderName.match(/(\d{4}-\d{2}-\d{2})-\d{2}-\d{2}-\d{2}-\d{4}/);
  const serialM = folderName.match(/SN(\d+)/i);
  const tplM = folderName.match(/-\d{4}-([A-Za-z][A-Za-z0-9]*)$/);
  return {
    date: dateM ? dateM[1] : null,
    serial: serialM ? serialM[1] : null,
    templateId: tplM ? tplM[1] : null,
  };
}

/** Energía aproximada a partir del nombre de plantilla (fallback sin Check.xml). */
export function energyFromTemplateName(templateId: string | null): string | null {
  if (!templateId) return null;
  const stripped = templateId.replace(
    /^(Beam|Geometry|CollimationDevices|EnhancedMLC|KVS)CheckTemplate/,
    "",
  );
  const m = stripped.match(/^(\d+[xXeE](?:FFF)?)/);
  return m ? m[1] : null;
}

// ---------- Results.csv ----------

/** Parsea el contenido de Results.csv en filas numéricas. */
export function parseResultsCsv(csv: string): MpcRow[] {
  const rows: MpcRow[] = [];
  const lines = csv.split(/\r?\n/);
  for (const line of lines) {
    const l = line.trim();
    if (!l || /^Name\s*\[/.test(l)) continue;
    // "Name [Unit], Value, Threshold, Evaluation Result"
    const parts = l.split(",");
    if (parts.length < 3) continue;
    const name = parts[0].trim().replace(/^"|"$/g, "");
    const value = parseFloat(parts[1].trim().replace(",", "."));
    const threshold = parseFloat(parts[2].trim().replace(",", "."));
    if (!name || !Number.isFinite(value)) continue;
    const unitM = name.match(/\[([^\]]+)\]$/);
    rows.push({
      name,
      unit: unitM ? unitM[1] : "",
      value,
      threshold: Number.isFinite(threshold) ? threshold : null,
      result: parts.slice(3).join(",").trim().replace(/^"|"$/g, ""),
    });
  }
  return rows;
}

/** Etiqueta de serie para una fila MPC: "energía / grupo / ... / parámetro [unidad]" */
export function mpcCellLabel(energy: string | null, name: string): string {
  return [energy ?? "?", ...name.split("/")]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" / ");
}

// ---------- agregación de hojas del MLC (geometry check) ----------

/** Fila individual de hoja: ".../MLCLeavesA/MLCLeaf2 [mm]" o ".../MLCBacklashLeavesB/MLCBacklashLeaf7 [mm]" */
const LEAF_GROUP_RE =
  /^(.+)\/(MLCLeaves[AB]|MLCBacklashLeaves[AB])\/(MLCLeaf\d+|MLCBacklashLeaf\d+)(\s*\[[^\]]*\])?$/;

const LEAF_AGG_NAMES = ["Máximo", "Mínimo", "Media"] as const;

/**
 * En los geometry check las medidas hoja a hoja del MLC no aportan nada a la
 * vista temporal: se sustituyen por parámetros artificiales (máximo, mínimo y
 * media) por banco de hojas, conservando el umbral de las hojas originales.
 */
export function aggregateMlcLeafGroups(rows: MpcRow[]): MpcRow[] {
  const groups = new Map<string, { values: number[]; threshold: number | null; unit: string }>();
  const rest: MpcRow[] = [];
  for (const r of rows) {
    const m = r.name.match(LEAF_GROUP_RE);
    if (!m) {
      rest.push(r);
      continue;
    }
    const key = `${m[1]}/${m[2]}`;
    let g = groups.get(key);
    if (!g) {
      g = { values: [], threshold: r.threshold, unit: r.unit };
      groups.set(key, g);
    }
    g.values.push(r.value);
  }
  for (const [key, g] of groups.entries()) {
    if (g.values.length === 0) continue;
    const unitSuffix = g.unit ? ` [${g.unit}]` : "";
    const stats = [
      Math.max(...g.values),
      Math.min(...g.values),
      g.values.reduce((a, b) => a + b, 0) / g.values.length,
    ];
    const ok =
      g.threshold == null ||
      (Math.abs(stats[0]) <= g.threshold &&
        Math.abs(stats[1]) <= g.threshold &&
        Math.abs(stats[2]) <= g.threshold);
    LEAF_AGG_NAMES.forEach((name, i) => {
      rest.push({
        name: `${key}/${name}${unitSuffix}`,
        unit: g.unit,
        value: stats[i],
        threshold: g.threshold,
        result: ok ? "Pass" : "Fail",
      });
    });
  }
  return rest;
}

// ---------- agrupación de archivos de carpeta ----------

export interface MpcFolderFiles {
  folderName: string;
  resultsCsv?: File;
  checkXml?: File;
}

/** Agrupa los archivos seleccionados por carpeta (soporta webkitdirectory). */
export function groupMpcFiles(files: File[]): Map<string, MpcFolderFiles> {
  const map = new Map<string, MpcFolderFiles>();
  for (const f of files) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "(archivos sueltos)";
    let g = map.get(dir);
    if (!g) {
      g = { folderName: dir.split("/").pop() || dir };
      map.set(dir, g);
    }
    if (f.name === "Check.xml") g.checkXml = f;
    else if (f.name === "Results.csv") g.resultsCsv = f;
  }
  return map;
}

/** Parsea una carpeta MPC completa (Results.csv + Check.xml opcional). */
export async function parseMpcFolder(
  folderName: string,
  resultsCsv: File,
  checkXml: File | undefined,
  machineId: MachineId,
): Promise<MpcFolderPreview> {
  const csvBuf = await resultsCsv.arrayBuffer();
  const hash = await sha256(csvBuf);
  const csvText = await readText(resultsCsv);

  const fromName = folderNameInfo(folderName);
  let info: CheckInfo = {
    date: fromName.date,
    energy: energyFromTemplateName(fromName.templateId),
    serial: fromName.serial,
    templateId: fromName.templateId,
    evaluation: null,
    isBaseline: false,
  };
  if (checkXml) {
    try {
      const xmlInfo = parseCheckXml(await readText(checkXml));
      info = { ...info, ...xmlInfo };
    } catch {
      // Check.xml corrupto: seguimos con la info del nombre de carpeta
    }
  }
  if (!info.energy && info.templateId) info.energy = energyFromTemplateName(info.templateId);

  // En los geometry check las hojas individuales del MLC se agregan en
  // parámetros Máximo / Mínimo / Media por banco.
  let rows = parseResultsCsv(csvText);
  if (rows.length === 0) {
    throw new Error("Results.csv sin datos válidos");
  }
  if (info.templateId?.startsWith("GeometryCheckTemplate")) {
    rows = aggregateMlcLeafGroups(rows);
  }

  // El hash incluye el nombre de carpeta para no pisar otra carpeta idéntica.
  const fullHash = await sha256(
    new TextEncoder().encode(`${folderName}\n${hash}`).buffer as ArrayBuffer,
  );
  return {
    folderName,
    hash: fullHash,
    importId: `${machineId}-${MPC_TEST_ID}-${fullHash.slice(0, 12)}`,
    serial: info.serial,
    date: info.date,
    energy: info.energy,
    templateId: info.templateId,
    evaluation: info.evaluation,
    isBaseline: info.isBaseline,
    rows,
  };
}

// ---------- plantilla sintética ----------

interface LeafSpec {
  label: string; // "energía / grupo / ... / parámetro [unidad]"
  unit: string;
  tolerance: string;
}

/** Une las filas nuevas con los parámetros ya presentes en la plantilla anterior. */
function collectLeaves(
  rows: { energy: string | null; name: string; unit: string; threshold: number | null }[],
  existing?: Template,
): Map<string, LeafSpec> {
  const leaves = new Map<string, LeafSpec>();

  const existingTest = existing?.tests.find((t) => t.id === MPC_TEST_ID);
  if (existingTest) {
    for (const w of walkDataPoints(existingTest)) {
      const unit = displayTextOrRef(w.dp.unit, "").trim();
      const tolerance = displayTextOrRef(w.dp.tolerance, "").trim();
      leaves.set(dpSeriesLabel(w), {
        label: dpSeriesLabel(w),
        unit,
        tolerance,
      });
    }
  }

  for (const r of rows) {
    const label = mpcCellLabel(r.energy, r.name);
    leaves.set(label, {
      label,
      unit: r.unit,
      tolerance: r.threshold != null ? `±${r.threshold}` : "",
    });
  }
  return leaves;
}

function compareEnergy(a: string, b: string): number {
  const na = parseFloat(a) || 0;
  const nb = parseFloat(b) || 0;
  if (na !== nb) return na - nb;
  return a.localeCompare(b);
}

/**
 * Construye (o actualiza) la plantilla "MPC (Varian)" de una máquina a partir
 * de las filas importadas, conservando los parámetros de importaciones previas
 * y cualquier otro test que el usuario haya añadido a la plantilla.
 */
export function buildMpcTemplate(
  machineId: MachineId,
  rows: { energy: string | null; name: string; unit: string; threshold: number | null }[],
  existing?: Template,
): Template {
  const leaves = collectLeaves(rows, existing);

  // árbol: energía → grupos anidados → punto de dato
  const root: Nest = emptyNest("raíz");
  const energyNests = new Map<string, Nest>();
  let counter = 0;

  const labels = [...leaves.keys()].sort((a, b) => {
    const ea = a.split(" / ")[0];
    const eb = b.split(" / ")[0];
    const c = compareEnergy(ea, eb);
    return c !== 0 ? c : a.localeCompare(b);
  });

  for (const label of labels) {
    const spec = leaves.get(label)!;
    const segs = label
      .split(" / ")
      .map((s) => s.trim())
      .filter(Boolean);
    if (segs.length < 2) continue;
    const energyName = segs[0];

    let energyNest = energyNests.get(energyName);
    if (!energyNest) {
      energyNest = {
        id: `nest-mpc-e-${counter++}-${crypto.randomUUID().slice(0, 6)}`,
        kind: "nest",
        name: textValue(energyName),
        children: [],
      };
      energyNests.set(energyName, energyNest);
      root.children.push(energyNest);
    }

    let cur: Nest = energyNest;
    for (let i = 1; i < segs.length - 1; i++) {
      let child = cur.children.find(
        (c) => c.kind === "nest" && displayTextOrRef(c.name, "") === segs[i],
      ) as Nest | undefined;
      if (!child) {
        child = {
          id: `nest-mpc-${counter++}-${crypto.randomUUID().slice(0, 6)}`,
          kind: "nest",
          name: textValue(segs[i]),
          children: [],
        };
        cur.children.push(child);
      }
      cur = child;
    }

    const dp: DataPoint = {
      id: `dp-mpc-${counter++}-${crypto.randomUUID().slice(0, 6)}`,
      kind: "data",
      name: textValue(segs[segs.length - 1]),
      unit: spec.unit ? textValue(spec.unit) : undefined,
      tolerance: spec.tolerance ? textValue(spec.tolerance) : undefined,
    };
    cur.children.push(dp);
  }

  const test: TestDef = {
    id: MPC_TEST_ID,
    name: MPC_TEST_NAME,
    category: MPC_CATEGORY,
    frequency: "monthly",
    admin: {},
    root,
  };

  const others = (existing?.tests ?? []).filter((t) => t.id !== MPC_TEST_ID);
  return {
    id: MPC_TEMPLATE_ID(machineId),
    machineId,
    name: MPC_TEST_NAME,
    version: (existing?.version ?? 0) + 1,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    tests: [...others, test],
  };
}
