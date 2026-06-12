import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ImportRecord, MachineRecord, Measurement, Template, TestDef, Nest, TreeNode, TextOrRef, CalendarRecord } from "./types";
import { MACHINES, emptyNest, textValue } from "./types";

interface QASchema extends DBSchema {
  machines: { key: string; value: MachineRecord };
  templates: { key: string; value: Template; indexes: { byMachine: string } };
  imports: { key: string; value: ImportRecord; indexes: { byMachine: string } };
  measurements: {
    key: string;
    value: Measurement;
    indexes: { byMachine: string; byImport: string; byTest: string };
  };
  calendar: { key: string; value: CalendarRecord };
}


let dbPromise: Promise<IDBPDatabase<QASchema>> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toTextOrRef(v: any): TextOrRef | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return textValue(v);
  if (typeof v === "object") {
    if (v.kind === "text" || v.kind === "literal") return { kind: "text", text: v.text ?? "" };
    if (v.kind === "cellRef") return { kind: "cellRef", sheet: v.sheet ?? "", address: v.address ?? "" };
  }
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateNode(n: any): TreeNode {
  if (n && n.kind === "nest") {
    return {
      id: n.id,
      kind: "nest",
      name: toTextOrRef(n.name) ?? textValue(""),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      children: (n.children ?? []).map((c: any) => migrateNode(c)),
    } as Nest;
  }
  return {
    id: n.id,
    kind: "data",
    name: toTextOrRef(n.name) ?? textValue(""),
    cell: n.cell,
    unit: toTextOrRef(n.unit),
    tolerance: toTextOrRef(n.tolerance),
    reference: toTextOrRef(n.reference),
    parsedTolerance: n.parsedTolerance,
  };
}

/** Convert any legacy test into the current shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateLegacyTest(t: any): TestDef {
  if (t && t.root) {
    const root: Nest = {
      id: t.root.id,
      kind: "nest",
      name: toTextOrRef(t.root.name) ?? textValue("raíz"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      children: (t.root.children ?? []).map((c: any) => migrateNode(c)),
    };
    return {
      id: t.id,
      name: t.name,
      category: t.category,
      frequency: t.frequency,
      admin: t.admin ?? {},
      root,
    };
  }
  // v1 flat -> current
  const root = emptyNest("raíz");
  const cells: { sheet: string; address: string; label?: string }[] = t.cells ?? [];
  root.children = cells.map((c, i) => ({
    id: `dp-mig-${i}-${Math.random().toString(36).slice(2, 6)}`,
    kind: "data" as const,
    name: textValue(c.label || `dato ${i + 1}`),
    cell: { sheet: c.sheet, address: c.address },
    unit: t.unit ? textValue(t.unit) : undefined,
    parsedTolerance: t.tolerance,
  }));
  return {
    id: t.id,
    name: t.name,
    category: t.category,
    frequency: t.frequency,
    admin: { date: t.dateCell ?? undefined },
    root,
  };
}

export function getDB() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB unavailable (SSR)");
  }
  if (!dbPromise) {
    dbPromise = openDB<QASchema>("qa-dashboard", 3, {
      upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          db.createObjectStore("machines", { keyPath: "id" });
          const t = db.createObjectStore("templates", { keyPath: "id" });
          t.createIndex("byMachine", "machineId");
          const i = db.createObjectStore("imports", { keyPath: "id" });
          i.createIndex("byMachine", "machineId");
          const m = db.createObjectStore("measurements", { keyPath: "id" });
          m.createIndex("byMachine", "machineId");
          m.createIndex("byImport", "importId");
          m.createIndex("byTest", "testId");
        }
        if (oldVersion < 3) {
          const store = tx.objectStore("templates");
          void store.openCursor().then(async function next(cursor) {
            while (cursor) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const tpl: any = cursor.value;
              const migrated: Template = {
                ...tpl,
                tests: (tpl.tests ?? []).map(migrateLegacyTest),
              };
              await cursor.update(migrated);
              cursor = await cursor.continue();
            }
          });
        }
      },
    }).then(async (db) => {
      const tx = db.transaction("machines", "readwrite");
      for (const m of MACHINES) {
        const existing = await tx.store.get(m.id);
        if (!existing) await tx.store.put({ id: m.id, name: m.name });
      }
      await tx.done;
      return db;
    });
  }
  return dbPromise;
}

export async function listMachines(): Promise<MachineRecord[]> {
  const db = await getDB();
  return db.getAll("machines");
}
export async function getMachine(id: string) {
  const db = await getDB();
  return db.get("machines", id);
}
export async function setActiveTemplate(machineId: string, templateId: string) {
  const db = await getDB();
  const m = await db.get("machines", machineId);
  if (m) await db.put("machines", { ...m, activeTemplateId: templateId });
}
export async function updateMachineState(
  machineId: string,
  state: import("./types").MachineState | undefined,
  note?: string,
) {
  const db = await getDB();
  const m = await db.get("machines", machineId);
  if (m) await db.put("machines", { ...m, state, stateNote: note });
}
export async function clearActiveTemplate(machineId: string) {
  const db = await getDB();
  const m = await db.get("machines", machineId);
  if (m) {
    const { activeTemplateId: _, ...rest } = m;
    await db.put("machines", rest);
  }
}

export async function listTemplates(machineId?: string): Promise<Template[]> {
  const db = await getDB();
  if (machineId) return db.getAllFromIndex("templates", "byMachine", machineId);
  return db.getAll("templates");
}
export async function getTemplate(id: string) {
  const db = await getDB();
  return db.get("templates", id);
}
export async function saveTemplate(t: Template) {
  const db = await getDB();
  await db.put("templates", t);
}
export async function deleteTemplate(id: string) {
  const db = await getDB();
  await db.delete("templates", id);
}

export async function listImports(machineId?: string): Promise<ImportRecord[]> {
  const db = await getDB();
  const all = machineId
    ? await db.getAllFromIndex("imports", "byMachine", machineId)
    : await db.getAll("imports");
  return all.sort((a, b) => a.sourceDate.localeCompare(b.sourceDate));
}
export async function saveImport(rec: ImportRecord, measurements: Measurement[]) {
  const db = await getDB();
  const tx = db.transaction(["imports", "measurements"], "readwrite");
  const prev = await tx.objectStore("measurements").index("byImport").getAllKeys(rec.id);
  for (const k of prev) await tx.objectStore("measurements").delete(k);
  await tx.objectStore("imports").put(rec);
  for (const m of measurements) await tx.objectStore("measurements").put(m);
  await tx.done;
}
export async function deleteImport(id: string) {
  const db = await getDB();
  const tx = db.transaction(["imports", "measurements"], "readwrite");
  await tx.objectStore("imports").delete(id);
  const ks = await tx.objectStore("measurements").index("byImport").getAllKeys(id);
  for (const k of ks) await tx.objectStore("measurements").delete(k);
  await tx.done;
}

export async function listMeasurements(machineId?: string): Promise<Measurement[]> {
  const db = await getDB();
  if (machineId) return db.getAllFromIndex("measurements", "byMachine", machineId);
  return db.getAll("measurements");
}

export async function updateMeasurement(m: Measurement) {
  const db = await getDB();
  await db.put("measurements", m);
}

export async function deleteMeasurement(id: string) {
  const db = await getDB();
  await db.delete("measurements", id);
}

export async function clearAllData() {
  const db = await getDB();
  const tx = db.transaction(["machines", "templates", "imports", "measurements"], "readwrite");
  for (const s of ["templates", "imports", "measurements"] as const) {
    await tx.objectStore(s).clear();
  }
  const machines = await tx.objectStore("machines").getAll();
  for (const m of machines) {
    await tx.objectStore("machines").put({ id: m.id, name: m.name });
  }
  await tx.done;
}

export async function exportAll() {
  const db = await getDB();
  return {
    machines: await db.getAll("machines"),
    templates: await db.getAll("templates"),
    imports: await db.getAll("imports"),
    measurements: await db.getAll("measurements"),
  };
}
export async function importAll(data: Awaited<ReturnType<typeof exportAll>>) {
  const db = await getDB();
  const tx = db.transaction(["machines", "templates", "imports", "measurements"], "readwrite");
  for (const s of ["machines", "templates", "imports", "measurements"] as const) {
    await tx.objectStore(s).clear();
  }
  for (const m of data.machines) await tx.objectStore("machines").put(m);
  for (const t of data.templates) await tx.objectStore("templates").put(t);
  for (const i of data.imports) await tx.objectStore("imports").put(i);
  for (const m of data.measurements) await tx.objectStore("measurements").put(m);
  await tx.done;
}
