import {
  emptyNest,
  newDataPoint,
  newNest,
  textValue,
  type CellRef,
  type DataPoint,
  type Nest,
  type TestDef,
  type TextOrRef,
  type TreeNode,
  type Category,
  type Frequency,
  CATEGORY_LABELS,
} from "./types";

/** Exported JSON payload for a single test. */
export interface TestJson {
  kind: "qaule-test";
  version: 1;
  test: TestDef;
}

export function testToJson(test: TestDef): TestJson {
  return { kind: "qaule-test", version: 1, test };
}

export function testJsonFileName(test: TestDef): string {
  const slug = test.name.trim().toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return `test-${slug || "sin-nombre"}.json`;
}

// ---------- parsing ----------

const FREQUENCIES: Frequency[] = ["monthly", "quarterly", "semiannual", "annual"];

function rid(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 7)}`;
}

function asTextOrRef(v: unknown, fallback: string): TextOrRef {
  if (typeof v === "string") return textValue(v);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.kind === "text" && typeof o.text === "string") return textValue(o.text);
    if (o.kind === "cellRef" && typeof o.sheet === "string" && typeof o.address === "string")
      return { kind: "cellRef", sheet: o.sheet, address: o.address };
    if (typeof o.sheet === "string" && typeof o.address === "string")
      return { kind: "cellRef", sheet: o.sheet, address: o.address };
  }
  return textValue(fallback);
}

function asCell(v: unknown): CellRef | undefined {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.sheet === "string" && typeof o.address === "string")
      return { sheet: o.sheet, address: o.address, ...(typeof o.label === "string" ? { label: o.label } : {}) };
  }
  return undefined;
}

function isDataLike(o: Record<string, unknown>): boolean {
  if (o.kind === "data") return true;
  if (o.kind === "nest") return false;
  if ("cell" in o || "unit" in o || "tolerance" in o || "reference" in o) return true;
  return false;
}

function nodeFromAny(name: string, value: unknown): TreeNode {
  // "Beam center"  → plain data point
  if (value === null || value === undefined || typeof value === "string" || typeof value === "number") {
    const dp = newDataPoint(name);
    if (typeof value === "string" && value.trim()) dp.unit = textValue(value);
    return dp;
  }

  // ["a","b"] → nest with children
  if (Array.isArray(value)) {
    const nest = newNest(name);
    nest.children = value.map((child) => {
      if (typeof child === "string") return newDataPoint(child);
      const o = child as Record<string, unknown>;
      const childName = typeof o.name === "string" ? o.name : "Sin nombre";
      return nodeFromAny(childName, o);
    });
    return nest;
  }

  const o = value as Record<string, unknown>;

  // explicit node object
  if (o.kind === "nest" || Array.isArray(o.children)) {
    const nest: Nest = {
      id: rid("nest"),
      kind: "nest",
      name: asTextOrRef(o.name, name),
      children: (Array.isArray(o.children) ? o.children : []).map((c) => {
        if (typeof c === "string") return newDataPoint(c);
        const co = c as Record<string, unknown>;
        return nodeFromAny(typeof co.name === "string" ? co.name : "Sin nombre", co);
      }),
    };
    return nest;
  }

  if (isDataLike(o)) {
    const dp: DataPoint = {
      id: rid("dp"),
      kind: "data",
      name: asTextOrRef(o.name, name),
      cell: asCell(o.cell),
    };
    if (o.unit !== undefined) dp.unit = asTextOrRef(o.unit, "");
    if (o.tolerance !== undefined) dp.tolerance = asTextOrRef(o.tolerance, "");
    if (o.reference !== undefined) dp.reference = asTextOrRef(o.reference, "");
    return dp;
  }

  // plain object → nest whose keys are children
  const nest = newNest(name);
  nest.children = Object.entries(o)
    .filter(([k]) => k !== "name")
    .map(([k, v]) => nodeFromAny(k, v));
  return nest;
}

function rootFromAny(value: unknown): Nest {
  const root = emptyNest("raíz");
  if (Array.isArray(value)) {
    root.children = value.map((c) =>
      typeof c === "string"
        ? newDataPoint(c)
        : nodeFromAny(
            typeof (c as Record<string, unknown>)?.name === "string"
              ? ((c as Record<string, unknown>).name as string)
              : "Sin nombre",
            c,
          ),
    );
    return root;
  }
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (o.kind === "nest" && Array.isArray(o.children)) {
      root.children = (nodeFromAny("raíz", o) as Nest).children;
      return root;
    }
    root.children = Object.entries(o).map(([k, v]) => nodeFromAny(k, v));
  }
  return root;
}

/**
 * Parse a JSON payload into a TestDef.
 * Accepts a full exported test, a bare TestDef, or a free-form nested object
 * describing the parameter tree.
 */
export function parseTestJson(
  raw: string,
  current: TestDef,
  validCategories: string[] = Object.keys(CATEGORY_LABELS),
): TestDef {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("JSON no válido");
  }
  if (!data || typeof data !== "object") throw new Error("El JSON debe ser un objeto");

  let obj = data as Record<string, unknown>;
  if (obj.kind === "qaule-test" && obj.test && typeof obj.test === "object") {
    obj = obj.test as Record<string, unknown>;
  }

  const name = typeof obj.name === "string" && obj.name.trim() ? obj.name : current.name;
  const category = validCategories.includes(obj.category as string)
    ? (obj.category as Category)
    : current.category;
  const frequency = FREQUENCIES.includes(obj.frequency as Frequency)
    ? (obj.frequency as Frequency)
    : current.frequency;

  const adminRaw = (obj.admin ?? {}) as Record<string, unknown>;
  const admin: TestDef["admin"] = {
    date: asCell(adminRaw.date) ?? current.admin.date,
    performers: Array.isArray(adminRaw.performers)
      ? adminRaw.performers.map(asCell).filter((c): c is CellRef => !!c)
      : current.admin.performers,
  };

  const treeSource =
    obj.root ?? obj.tree ?? obj.parameters ?? obj.parametros ?? obj.data ?? obj.datos ?? null;

  const root = treeSource
    ? rootFromAny(treeSource)
    : rootFromAny(
        Object.fromEntries(
          Object.entries(obj).filter(
            ([k]) => !["name", "category", "frequency", "admin", "id", "kind", "version"].includes(k),
          ),
        ),
      );

  if (root.children.length === 0) throw new Error("No se encontró ningún parámetro en el JSON");

  return { ...current, name, category, frequency, admin, root };
}
