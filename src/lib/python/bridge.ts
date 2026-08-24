import {
  listMachines,
  listTemplates,
  listMeasurements,
  listImports,
  getCalendar,
  listCalendarTasks,
  listMachineKinds,
  listCategories,
} from "@/lib/qa/db";

export interface QaContext {
  generated_at: string;
  machines: unknown[];
  machine_kinds: unknown[];
  categories: unknown[];
  templates: unknown[];
  measurements: unknown[];
  imports: unknown[];
  calendar: unknown;
  calendar_tasks: unknown[];
}

export async function buildQaContext(): Promise<QaContext> {
  const [
    machines,
    machineKinds,
    categories,
    templates,
    measurements,
    imports,
    calendar,
    calendarTasks,
  ] = await Promise.all([
    listMachines(),
    listMachineKinds(),
    listCategories(),
    listTemplates(),
    listMeasurements(),
    listImports(),
    getCalendar(),
    listCalendarTasks(),
  ]);
  return {
    generated_at: new Date().toISOString(),
    machines,
    machine_kinds: machineKinds,
    categories,
    templates,
    measurements,
    imports,
    calendar: calendar ?? null,
    calendar_tasks: calendarTasks,
  };
}
