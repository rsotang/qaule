import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { ImportRecord, MachineRecord, Measurement, Template } from "./types";
import { MACHINES } from "./types";

interface QASchema extends DBSchema {
  machines: { key: string; value: MachineRecord };
  templates: { key: string; value: Template; indexes: { byMachine: string } };
  imports: { key: string; value: ImportRecord; indexes: { byMachine: string } };
  measurements: {
    key: string;
    value: Measurement;
    indexes: { byMachine: string; byImport: string; byTest: string };
  };
}

let dbPromise: Promise<IDBPDatabase<QASchema>> | null = null;

export function getDB() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB unavailable (SSR)");
  }
  if (!dbPromise) {
    dbPromise = openDB<QASchema>("qa-dashboard", 1, {
      upgrade(db) {
        db.createObjectStore("machines", { keyPath: "id" });
        const t = db.createObjectStore("templates", { keyPath: "id" });
        t.createIndex("byMachine", "machineId");
        const i = db.createObjectStore("imports", { keyPath: "id" });
        i.createIndex("byMachine", "machineId");
        const m = db.createObjectStore("measurements", { keyPath: "id" });
        m.createIndex("byMachine", "machineId");
        m.createIndex("byImport", "importId");
        m.createIndex("byTest", "testId");
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
  // remove previous measurements for this import id, if re-importing
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
