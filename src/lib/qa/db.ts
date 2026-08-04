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
} from "./types";
import { calendarTaskId } from "./types";


// ---------- mapping helpers ----------

type MachineRow = {
  id: string;
  name: string;
  active_template_id: string | null;
  state: string | null;
  state_note: string | null;
};
function machineFromRow(r: MachineRow): MachineRecord {
  const rec: MachineRecord = { id: r.id as MachineId, name: r.name };
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
  return data as T;
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

export async function saveImport(rec: ImportRecord, measurements: Measurement[]) {
  // upsert import row (cascade-deletes existing measurements via FK on delete; but
  // we want to replace, so explicitly clear old measurements for this import).
  const { error: delErr } = await supabase.from("measurements").delete().eq("import_id", rec.id);
  if (delErr) throw new Error(delErr.message);
  const { error: impErr } = await supabase.from("imports").upsert({
    id: rec.id,
    machine_id: rec.machineId,
    file_name: rec.fileName,
    imported_at: rec.importedAt,
    source_date: rec.sourceDate,
    file_hash: rec.fileHash,
  });
  if (impErr) throw new Error(impErr.message);
  if (measurements.length > 0) {
    // chunk to keep payload small
    const rows = measurements.map(measurementToRow);
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const { error } = await supabase.from("measurements").insert(rows.slice(i, i + chunkSize));
      if (error) throw new Error(error.message);
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

export async function updateMeasurement(m: Measurement) {
  const { error } = await supabase.from("measurements").update(measurementToRow(m)).eq("id", m.id);
  if (error) throw new Error(error.message);
}

export async function deleteMeasurement(id: string) {
  const { error } = await supabase.from("measurements").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function clearAllData() {
  // Keep machines (seeded), drop user data.
  await supabase.from("measurements").delete().neq("id", "");
  await supabase.from("imports").delete().neq("id", "");
  await supabase.from("templates").delete().neq("id", "");
  await supabase
    .from("machines")
    .update({ active_template_id: null, state: null, state_note: null })
    .neq("id", "");
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
  const id = calendarTaskId(ym, testName, machineId);

  // Fetch existing row to merge booleans and metadata
  const { data: existing } = await supabase.from("calendar_tasks").select("*").eq("id", id).maybeSingle();
  const prev = existing as CalendarTaskRow | null;

  const measured = fields.measured ?? prev?.measured ?? false;
  const analyzed = fields.analyzed ?? prev?.analyzed ?? false;
  const done = measured && analyzed;

  const measuredBy = measured ? (user?.id ?? prev?.measured_by ?? null) : null;
  const measuredByName = measured
    ? ((user?.user_metadata?.display_name as string | undefined) ?? user?.email ?? prev?.measured_by_name ?? null)
    : null;
  const measuredAt = measured ? (prev?.measured_at ?? new Date().toISOString()) : null;

  const analyzedBy = analyzed ? (user?.id ?? prev?.analyzed_by ?? null) : null;
  const analyzedByName = analyzed
    ? ((user?.user_metadata?.display_name as string | undefined) ?? user?.email ?? prev?.analyzed_by_name ?? null)
    : null;
  const analyzedAt = analyzed ? (prev?.analyzed_at ?? new Date().toISOString()) : null;

  const completedBy = done ? (user?.id ?? prev?.completed_by ?? null) : null;
  const completedByName = done
    ? ((user?.user_metadata?.display_name as string | undefined) ?? user?.email ?? prev?.completed_by_name ?? null)
    : null;
  const completedAt = done ? (prev?.completed_at ?? new Date().toISOString()) : null;

  const { error } = await supabase.from("calendar_tasks").upsert({
    id,
    ym,
    test_name: testName,
    done,
    measured,
    measured_by: measuredBy,
    measured_by_name: measuredByName,
    measured_at: measuredAt,
    analyzed,
    analyzed_by: analyzedBy,
    analyzed_by_name: analyzedByName,
    analyzed_at: analyzedAt,
    completed_by: completedBy,
    completed_by_name: completedByName,
    completed_at: completedAt,
    note: fields.note ?? prev?.note ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}
