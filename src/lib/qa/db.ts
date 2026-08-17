// Cloud-backed data layer (Supabase). Keeps the legacy function names that
// the rest of the app already imports, so route components don't need to
// change. All data is shared across authenticated users.

import { supabase } from "@/integrations/supabase/client";
import type {
  ImportRecord,
  MachineRecord,
  Measurement,
  Template,
  CalendarRecord,
  CalendarTask,
  MachineId,
  MachineState,
  MachineKindDef,
  CategoryDef,
} from "./types";
import { calendarTaskId } from "./types";


// ---------- mapping helpers ----------

type MachineRow = {
  id: string;
  name: string;
  active_template_id: string | null;
  state: string | null;
  state_note: string | null;
  kind?: string | null;
};
function machineFromRow(r: MachineRow): MachineRecord {
  const rec: MachineRecord = { id: r.id as MachineId, name: r.name };
  if (r.kind) rec.kind = r.kind as MachineRecord["kind"];
  if (r.active_template_id) rec.activeTemplateId = r.active_template_id;
  if (r.state) rec.state = r.state as MachineState;
  if (r.state_note) rec.stateNote = r.state_note;
  return rec;
}

type TemplateRow = {
  id: string;
  machine_id: string;
  name: string;
  version: number;
  created_at: string;
  default_date_cell: unknown;
  tests: unknown;
};
function templateFromRow(r: TemplateRow): Template {
  return {
    id: r.id,
    machineId: r.machine_id as MachineId,
    name: r.name,
    version: r.version,
    createdAt: r.created_at,
    defaultDateCell: (r.default_date_cell as Template["defaultDateCell"]) ?? undefined,
    tests: (r.tests as Template["tests"]) ?? [],
  };
}
function templateToRow(t: Template) {
  return {
    id: t.id,
    machine_id: t.machineId,
    name: t.name,
    version: t.version,
    created_at: t.createdAt,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    default_date_cell: (t.defaultDateCell ?? null) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tests: t.tests as any,
    updated_at: new Date().toISOString(),
  };
}

type ImportRow = {
  id: string;
  machine_id: string;
  file_name: string;
  imported_at: string;
  source_date: string;
  file_hash: string;
};
function importFromRow(r: ImportRow): ImportRecord {
  return {
    id: r.id,
    machineId: r.machine_id as MachineId,
    fileName: r.file_name,
    importedAt: r.imported_at,
    sourceDate: r.source_date,
    fileHash: r.file_hash,
  };
}

type MeasurementRow = {
  id: string;
  import_id: string;
  machine_id: string;
  test_id: string;
  cell_label: string;
  date: string;
  value: number;
};
function measurementFromRow(r: MeasurementRow): Measurement {
  return {
    id: r.id,
    importId: r.import_id,
    machineId: r.machine_id as MachineId,
    testId: r.test_id,
    cellLabel: r.cell_label,
    date: r.date,
    value: Number(r.value),
  };
}
function measurementToRow(m: Measurement) {
  return {
    id: m.id,
    import_id: m.importId,
    machine_id: m.machineId,
    test_id: m.testId,
    cell_label: m.cellLabel,
    date: m.date,
    value: m.value,
  };
}

function must<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data == null) throw new Error("Unexpected: both data and error are null");
  return data;
}

// ---------- machines ----------

export async function listMachines(): Promise<MachineRecord[]> {
  const { data, error } = await supabase.from("machines").select("*").order("id");
  return must(data, error).map(machineFromRow);
}
export async function getMachine(id: string): Promise<MachineRecord | undefined> {
  const { data, error } = await supabase.from("machines").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? machineFromRow(data) : undefined;
}
export async function createMachine(rec: {
  id: string;
  name: string;
  kind: string;
}): Promise<void> {
  const existing = await getMachine(rec.id);
  if (existing) throw new Error(`Ya existe una máquina con el identificador ${rec.id}`);
  const { error } = await supabase
    .from("machines")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert({ id: rec.id, name: rec.name, kind: rec.kind } as any);
  if (error) throw new Error(error.message);
}
export async function deleteMachine(id: string): Promise<void> {
  const { error } = await supabase.from("machines").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setActiveTemplate(machineId: string, templateId: string) {
  const { error } = await supabase
    .from("machines")
    .update({ active_template_id: templateId })
    .eq("id", machineId);
  if (error) throw new Error(error.message);
}
export async function clearActiveTemplate(machineId: string) {
  const { error } = await supabase
    .from("machines")
    .update({ active_template_id: null })
    .eq("id", machineId);
  if (error) throw new Error(error.message);
}
export async function updateMachineState(
  machineId: string,
  state: MachineState | undefined,
  note?: string,
) {
  const { error } = await supabase
    .from("machines")
    .update({ state: state ?? null, state_note: note ?? null })
    .eq("id", machineId);
  if (error) throw new Error(error.message);
}

/** Actualiza nombre y/o tipo de una máquina existente. */
export async function updateMachine(id: string, patch: { name?: string; kind?: string }): Promise<void> {
  const { error } = await supabase.from("machines").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- machine kinds + category catalog ----------

export async function listMachineKinds(): Promise<MachineKindDef[]> {
  const { data, error } = await supabase
    .from("machine_kinds")
    .select("id, name, builtin, machine_kind_categories(category_id)")
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    builtin: r.builtin,
    categories: (r.machine_kind_categories ?? []).map((c) => c.category_id),
  }));
}

export async function createMachineKind(rec: { id: string; name: string; categories: string[] }): Promise<void> {
  const { error } = await supabase.from("machine_kinds").insert({ id: rec.id, name: rec.name });
  if (error) throw new Error(error.message);
  if (rec.categories.length > 0) {
    const { error: linkErr } = await supabase.from("machine_kind_categories").insert(
      rec.categories.map((categoryId) => ({ kind_id: rec.id, category_id: categoryId })),
    );
    if (linkErr) throw new Error(linkErr.message);
  }
}

export async function updateMachineKind(
  id: string,
  patch: { name?: string; categories?: string[] },
): Promise<void> {
  if (patch.name !== undefined) {
    const { error } = await supabase.from("machine_kinds").update({ name: patch.name }).eq("id", id);
    if (error) throw new Error(error.message);
  }
  if (patch.categories !== undefined) {
    const { error: delErr } = await supabase.from("machine_kind_categories").delete().eq("kind_id", id);
    if (delErr) throw new Error(delErr.message);
    if (patch.categories.length > 0) {
      const { error: linkErr } = await supabase.from("machine_kind_categories").insert(
        patch.categories.map((categoryId) => ({ kind_id: id, category_id: categoryId })),
      );
      if (linkErr) throw new Error(linkErr.message);
    }
  }
}

export async function deleteMachineKind(id: string): Promise<void> {
  const { error } = await supabase.from("machine_kinds").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listCategories(): Promise<CategoryDef[]> {
  const { data, error } = await supabase.from("categories").select("*").order("id");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    builtin: r.builtin,
  }));
}

export async function createCategory(rec: { id: string; name: string }): Promise<void> {
  const { error } = await supabase.from("categories").insert({ id: rec.id, name: rec.name });
  if (error) throw new Error(error.message);
}

export async function updateCategory(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("categories").update({ name }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- templates ----------

export async function listTemplates(machineId?: string): Promise<Template[]> {
  let q = supabase.from("templates").select("*");
  if (machineId) q = q.eq("machine_id", machineId);
  const { data, error } = await q;
  return must(data, error).map(templateFromRow);
}
export async function getTemplate(id: string): Promise<Template | undefined> {
  const { data, error } = await supabase.from("templates").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? templateFromRow(data) : undefined;
}
export async function saveTemplate(t: Template) {
  const { error } = await supabase.from("templates").upsert(templateToRow(t));
  if (error) throw new Error(error.message);
}
export async function deleteTemplate(id: string) {
  // clear it from any machine that points to it
  await supabase.from("machines").update({ active_template_id: null }).eq("active_template_id", id);
  const { error } = await supabase.from("templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- imports + measurements ----------

export async function listImports(machineId?: string): Promise<ImportRecord[]> {
  let q = supabase.from("imports").select("*").order("source_date", { ascending: true });
  if (machineId) q = q.eq("machine_id", machineId);
  const { data, error } = await q;
  return must(data, error).map(importFromRow);
}

/** Server-side paginated imports (most recent first). */
export async function queryImports(
  page: number,
  pageSize: number,
  machineId?: string,
): Promise<{ rows: ImportRecord[]; total: number }> {
  let q = supabase
    .from("imports")
    .select("*", { count: "exact" })
    .order("source_date", { ascending: false })
    .order("imported_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (machineId) q = q.eq("machine_id", machineId);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return {
    rows: ((data ?? []) as ImportRow[]).map(importFromRow),
    total: count ?? 0,
  };
}

export async function saveImport(rec: ImportRecord, measurements: Measurement[]) {
  // Delete old measurements for this import first (from a previous import of
  // the same file). Measurement IDs now include crypto.randomUUID() so they
  // never collide with existing rows.
  const { error: delErr } = await supabase.from("measurements").delete().eq("import_id", rec.id);
  if (delErr) throw new Error(delErr.message);

  // Upsert import row. If this fails no data is lost (old measurements already
  // deleted, but the file can be re-imported).
  const { error: impErr } = await supabase.from("imports").upsert({
    id: rec.id,
    machine_id: rec.machineId,
    file_name: rec.fileName,
    imported_at: rec.importedAt,
    source_date: rec.sourceDate,
    file_hash: rec.fileHash,
  });
  if (impErr) throw new Error(impErr.message);

  // Insert new measurements chunked. If insertion fails roll back the import
  // row so the UI doesn't show a broken import — the user can re-import.
  if (measurements.length > 0) {
    const rows = measurements.map(measurementToRow);
    const chunkSize = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const { error } = await supabase.from("measurements").insert(rows.slice(i, i + chunkSize));
      if (error) {
        // Best-effort compensation: remove the import row, then delete any
        // measurements we already inserted.
        await supabase.from("imports").delete().eq("id", rec.id);
        if (inserted > 0) {
          await supabase.from("measurements").delete().eq("import_id", rec.id);
        }
        throw new Error(error.message);
      }
      inserted += rows.slice(i, i + chunkSize).length;
    }
  }
}

export async function deleteImport(id: string) {
  // measurements have ON DELETE CASCADE
  const { error } = await supabase.from("imports").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listMeasurements(machineId?: string): Promise<Measurement[]> {
  // Supabase caps a single response at 1000 rows; paginate.
  const all: Measurement[] = [];
  const pageSize = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase.from("measurements").select("*").range(from, from + pageSize - 1);
    if (machineId) q = q.eq("machine_id", machineId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as MeasurementRow[];
    all.push(...rows.map(measurementFromRow));
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export type MeasurementFilter = {
  machineId?: string;
  importId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

/** Server-side filtered + paginated measurements (fast for large tables). */
export async function queryMeasurements(
  filter: MeasurementFilter,
  page: number,
  pageSize: number,
): Promise<{ rows: Measurement[]; total: number }> {
  let q = supabase
    .from("measurements")
    .select("*", { count: "exact" })
    .order("machine_id")
    .order("date", { ascending: false })
    .order("cell_label")
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (filter.machineId) q = q.eq("machine_id", filter.machineId);
  if (filter.importId) q = q.eq("import_id", filter.importId);
  if (filter.dateFrom) q = q.gte("date", filter.dateFrom);
  if (filter.dateTo) q = q.lte("date", filter.dateTo);
  const s = filter.search?.trim();
  if (s) {
    const esc = s.replace(/[%,()]/g, " ");
    q = q.or(`cell_label.ilike.%${esc}%,test_id.ilike.%${esc}%`);
  }

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return {
    rows: ((data ?? []) as MeasurementRow[]).map(measurementFromRow),
    total: count ?? 0,
  };
}

export async function updateMeasurement(m: Measurement) {
  const { error } = await supabase.from("measurements").update(measurementToRow(m)).eq("id", m.id);
  if (error) throw new Error(error.message);
}

export async function deleteMeasurement(id: string) {
  const { error } = await supabase.from("measurements").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function clearAllData() {
  const errs: string[] = [];

  const { error: e1 } = await supabase.from("measurements").delete().neq("id", "");
  if (e1) errs.push(`measurements: ${e1.message}`);

  const { error: e2 } = await supabase.from("imports").delete().neq("id", "");
  if (e2) errs.push(`imports: ${e2.message}`);

  const { error: e3 } = await supabase.from("templates").delete().neq("id", "");
  if (e3) errs.push(`templates: ${e3.message}`);

  const { error: e4 } = await supabase
    .from("machines")
    .update({ active_template_id: null, state: null, state_note: null })
    .neq("id", "");
  if (e4) errs.push(`machines: ${e4.message}`);

  if (errs.length > 0) {
    throw new Error(`No se pudieron eliminar todos los datos: ${errs.join("; ")}`);
  }
}

// ---------- backup ----------

export async function exportAll() {
  return {
    machines: await listMachines(),
    templates: await listTemplates(),
    imports: await listImports(),
    measurements: await listMeasurements(),
  };
}
export async function importAll(data: Awaited<ReturnType<typeof exportAll>>) {
  if (!data || typeof data !== "object") {
    throw new Error("Datos de importación no válidos: se esperaba un objeto");
  }
  if (!Array.isArray(data.machines) || !Array.isArray(data.templates) || !Array.isArray(data.imports) || !Array.isArray(data.measurements)) {
    throw new Error("Datos de importación no válidos: faltan arrays requeridos (machines, templates, imports, measurements)");
  }

  await clearAllData();
  for (const m of data.machines) {
    await supabase.from("machines").upsert({
      id: m.id,
      name: m.name,
      active_template_id: m.activeTemplateId ?? null,
      state: m.state ?? null,
      state_note: m.stateNote ?? null,
    });
  }
  for (const t of data.templates) await saveTemplate(t);
  for (const i of data.imports) {
    const ms = data.measurements.filter((m) => m.importId === i.id);
    await saveImport(i, ms);
  }
}

// ---------- calendar ----------

export async function getCalendar(): Promise<CalendarRecord | undefined> {
  const { data, error } = await supabase
    .from("calendar")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return undefined;
  return {
    id: "default",
    updatedAt: data.updated_at,
    fileName: data.file_name ?? undefined,
    entries: (data.entries as unknown as CalendarRecord["entries"]) ?? [],
  };
}
export async function saveCalendar(rec: CalendarRecord) {
  const { error } = await supabase.from("calendar").upsert({
    id: "default",
    updated_at: rec.updatedAt,
    file_name: rec.fileName ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entries: rec.entries as any,
  });
  if (error) throw new Error(error.message);
}
export async function deleteCalendar() {
  const { error } = await supabase.from("calendar").delete().eq("id", "default");
  if (error) throw new Error(error.message);
}

// ---------- calendar tasks ----------

type CalendarTaskRow = {
  id: string;
  ym: string;
  test_name: string;
  done: boolean;
  measured: boolean;
  measured_by: string | null;
  measured_by_name: string | null;
  measured_at: string | null;
  analyzed: boolean;
  analyzed_by: string | null;
  analyzed_by_name: string | null;
  analyzed_at: string | null;
  completed_by: string | null;
  completed_by_name: string | null;
  completed_at: string | null;
  note: string | null;
};
function taskFromRow(r: CalendarTaskRow): CalendarTask {
  return {
    id: r.id,
    ym: r.ym,
    testName: r.test_name,
    done: r.done,
    measured: r.measured,
    measuredBy: r.measured_by ?? undefined,
    measuredByName: r.measured_by_name ?? undefined,
    measuredAt: r.measured_at ?? undefined,
    analyzed: r.analyzed,
    analyzedBy: r.analyzed_by ?? undefined,
    analyzedByName: r.analyzed_by_name ?? undefined,
    analyzedAt: r.analyzed_at ?? undefined,
    completedBy: r.completed_by ?? undefined,
    completedByName: r.completed_by_name ?? undefined,
    completedAt: r.completed_at ?? undefined,
    note: r.note ?? undefined,
  };
}

export async function listCalendarTasks(ym?: string): Promise<CalendarTask[]> {
  let q = supabase.from("calendar_tasks").select("*");
  if (ym) q = q.eq("ym", ym);
  const { data, error } = await q;
  return must(data, error).map(taskFromRow);
}

export async function setCalendarTask(
  ym: string,
  testName: string,
  fields: { measured?: boolean; analyzed?: boolean; note?: string },
  machineId?: string,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("No hay sesión activa");
  const id = calendarTaskId(ym, testName, machineId);

  const userId = user.id;
  const userName = (user.user_metadata?.display_name as string | undefined) ?? user.email ?? null;
  const now = new Date().toISOString();

  const { data: existing, error: readErr } = await supabase
    .from("calendar_tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);

  const measured = fields.measured ?? existing?.measured ?? false;
  const analyzed = fields.analyzed ?? existing?.analyzed ?? false;
  const done = measured && analyzed;

  const row = {
    id,
    ym,
    test_name: testName,
    measured,
    measured_by: measured ? (existing?.measured ? existing.measured_by : userId) : null,
    measured_by_name: measured ? (existing?.measured ? existing.measured_by_name : userName) : null,
    measured_at: measured ? (existing?.measured ? existing.measured_at : now) : null,
    analyzed,
    analyzed_by: analyzed ? (existing?.analyzed ? existing.analyzed_by : userId) : null,
    analyzed_by_name: analyzed ? (existing?.analyzed ? existing.analyzed_by_name : userName) : null,
    analyzed_at: analyzed ? (existing?.analyzed ? existing.analyzed_at : now) : null,
    done,
    completed_by: done ? userId : null,
    completed_by_name: done ? userName : null,
    completed_at: done ? (existing?.done ? existing.completed_at : now) : null,
    note: fields.note ?? existing?.note ?? null,
    updated_at: now,
  };

  const { error } = await supabase.from("calendar_tasks").upsert(row);
  if (error) throw new Error(error.message);
}
