import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  listImports,
  listMachines,
  listMeasurements,
  listTemplates,
  updateMachineState,
  getCalendar,
  listCalendarTasks,
  setCalendarTask,
} from "@/lib/qa/db";

import {
  MACHINES,
  walkDataPoints,
  calendarTaskId,

  dpSeriesLabel,
  evaluateTolerance,
  type MachineId,
  type MachineState,
  type MachineRecord,
  type Template,
  type ImportRecord,
  type Measurement,
  type CalendarRecord,
} from "@/lib/qa/types";
import { entryIsInMonth, entryDatesInMonth } from "@/lib/qa/calendar-excel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, ShieldAlert, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { MachineGlyph } from "@/components/qa/MachineGlyph";

export const Route = createFileRoute("/_authenticated/")({ component: Dashboard });

const STATE_META: Record<MachineState, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  ok: { label: "OK", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30", Icon: CheckCircle2 },
  warning: { label: "Aviso", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30", Icon: AlertTriangle },
  critical: { label: "Crítico", cls: "bg-destructive/15 text-destructive border-destructive/30", Icon: ShieldAlert },
};

function Dashboard() {
  const qc = useQueryClient();
  const machines = useQuery({ queryKey: ["machines"], queryFn: listMachines });
  const templates = useQuery({ queryKey: ["templates-all"], queryFn: () => listTemplates() });
  const imports = useQuery({ queryKey: ["imports-all"], queryFn: () => listImports() });
  const measurements = useQuery({ queryKey: ["measurements-all"], queryFn: () => listMeasurements() });
  const calendar = useQuery({ queryKey: ["calendar"], queryFn: getCalendar });

  async function setState(id: MachineId, state: MachineState) {
    await updateMachineState(id, state);
    qc.invalidateQueries({ queryKey: ["machines"] });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Panel QA</h1>
        <p className="text-sm text-muted-foreground">
          Resumen del estado de las máquinas y de las últimas importaciones
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {MACHINES.map((m) => (
          <MachineCard
            key={m.id}
            machineId={m.id}
            machineName={m.name}
            machine={machines.data?.find((x) => x.id === m.id)}
            templates={templates.data ?? []}
            imports={imports.data ?? []}
            measurements={measurements.data ?? []}
            onSetState={setState}
          />
        ))}
      </div>

      <MonthlySummary
        calendar={calendar.data}
        templates={templates.data ?? []}
        measurements={measurements.data ?? []}
      />

      <OOTPanel
        templates={templates.data ?? []}
        machines={machines.data ?? []}
        imports={imports.data ?? []}
        measurements={measurements.data ?? []}
      />
    </div>
  );
}

function MachineCard({
  machineId,
  machineName,
  machine,
  templates,
  imports,
  measurements,
  onSetState,
}: {
  machineId: MachineId;
  machineName: string;
  machine?: MachineRecord;
  templates: Template[];
  imports: ImportRecord[];
  measurements: Measurement[];
  onSetState: (id: MachineId, s: MachineState) => void;
}) {
  const tpls = templates.filter((t) => t.machineId === machineId);
  const tpl = tpls.find((t) => t.id === machine?.activeTemplateId) ?? tpls[0];
  const myImports = imports.filter((i) => i.machineId === machineId);
  const lastImport = myImports[myImports.length - 1];

  const freq = useMemo(() => {
    const c = { monthly: 0, quarterly: 0, semiannual: 0, annual: 0, total: 0 };
    if (!tpl) return c;
    for (const t of tpl.tests) {
      c[t.frequency]++;
      c.total++;
    }
    return c;
  }, [tpl]);

  const ootCount = useMemo(() => {
    if (!tpl || !lastImport) return 0;
    let n = 0;
    const ms = measurements.filter((m) => m.importId === lastImport.id);
    for (const m of ms) {
      const test = tpl.tests.find((t) => t.id === m.testId);
      if (!test) continue;
      const walked = walkDataPoints(test).find((w) => dpSeriesLabel(w) === m.cellLabel);
      if (!walked) continue;
      if (!evaluateTolerance(walked.dp.parsedTolerance, m.value).inTolerance) n++;
    }
    return n;
  }, [tpl, lastImport, measurements]);

  const state = machine?.state ?? "ok";
  const meta = STATE_META[state];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <MachineGlyph
              machineId={machineId}
              className="h-20 w-24 shrink-0 rounded-md bg-primary/10 object-contain p-1.5"
            />

            <div>
              <CardTitle className="text-sm">{machineId}</CardTitle>
              <p className="text-xs text-muted-foreground">{machineName}</p>
            </div>
          </div>
          <Badge variant="outline" className={`gap-1 ${meta.cls}`}>
            <meta.Icon className="size-3" /> {meta.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Plantilla activa</p>
          <p className="text-sm font-medium">{tpl?.name ?? "—"}</p>
          {tpl ? (
            <p className="text-[11px] text-muted-foreground">
              {freq.total} tests · M:{freq.monthly} · T:{freq.quarterly} · S:{freq.semiannual} · A:{freq.annual}
            </p>
          ) : (
            <Link to="/templates" className="text-[11px] text-primary underline">
              Crear plantilla
            </Link>
          )}
        </div>

        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Última importación</p>
          {lastImport ? (
            <>
              <p className="text-sm font-medium">{lastImport.sourceDate}</p>
              <p className="truncate text-[11px] text-muted-foreground">{lastImport.fileName}</p>
              <p className={`text-[11px] font-medium ${ootCount > 0 ? "text-destructive" : "text-emerald-600"}`}>
                {ootCount > 0 ? `${ootCount} fuera de tolerancia` : "Todo en tolerancia"}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Sin importaciones</p>
          )}
        </div>

        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Estado de la máquina</p>
          <Select value={state} onValueChange={(v) => onSetState(machineId, v as MachineState)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ok" className="text-xs">OK</SelectItem>
              <SelectItem value="warning" className="text-xs">Aviso</SelectItem>
              <SelectItem value="critical" className="text-xs">Crítico</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

function OOTPanel({
  templates,
  machines,
  imports,
  measurements,
}: {
  templates: Template[];
  machines: MachineRecord[];
  imports: ImportRecord[];
  measurements: Measurement[];
}) {
  const alerts = useMemo(() => {
    const rows: { machineId: MachineId; testName: string; cellLabel: string; value: number; date: string }[] = [];
    for (const m of MACHINES) {
      const machine = machines.find((x) => x.id === m.id);
      const tpls = templates.filter((t) => t.machineId === m.id);
      const tpl = tpls.find((t) => t.id === machine?.activeTemplateId) ?? tpls[0];
      if (!tpl) continue;
      const myImports = imports.filter((i) => i.machineId === m.id);
      const last = myImports[myImports.length - 1];
      if (!last) continue;
      const ms = measurements.filter((x) => x.importId === last.id);
      for (const meas of ms) {
        const test = tpl.tests.find((t) => t.id === meas.testId);
        if (!test) continue;
        const walked = walkDataPoints(test).find((w) => dpSeriesLabel(w) === meas.cellLabel);
        if (!walked) continue;
        if (!evaluateTolerance(walked.dp.parsedTolerance, meas.value).inTolerance) {
          rows.push({
            machineId: m.id,
            testName: test.name,
            cellLabel: meas.cellLabel,
            value: meas.value,
            date: meas.date,
          });
        }
      }
    }
    return rows;
  }, [templates, machines, imports, measurements]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Alertas de tolerancia (última importación por máquina)</CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Sin puntos fuera de tolerancia en las últimas importaciones.
          </p>
        ) : (
          <ul className="divide-y">
            {alerts.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    <Badge variant="outline" className="mr-2 text-[10px]">{a.machineId}</Badge>
                    {a.testName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.cellLabel} · {a.date}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold text-destructive">
                    {a.value.toFixed(3)}
                  </span>
                  <Link
                    to="/visualization"
                    className="text-xs text-primary underline"
                  >
                    ver
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const MONTH_NAMES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function MonthlySummary({
  calendar,
  templates,
  measurements,
}: {
  calendar?: CalendarRecord;
  templates: Template[];
  measurements: Measurement[];
}) {
  const today = new Date();
  const [ym, setYm] = useState<string>(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`,
  );

  const qc = useQueryClient();
  const tasks = useQuery({
    queryKey: ["calendar-tasks", ym],
    queryFn: () => listCalendarTasks(ym),
  });
  const taskById = useMemo(() => {
    const m = new Map<string, NonNullable<typeof tasks.data>[number]>();
    for (const t of tasks.data ?? []) m.set(t.id, t);
    return m;
  }, [tasks.data]);

  async function toggleTask(testName: string, done: boolean, machineId?: string) {
    await setCalendarTask(ym, testName, done, undefined, machineId);
    qc.invalidateQueries({ queryKey: ["calendar-tasks", ym] });
  }


  function shiftMonth(delta: number) {
    const [y, m] = ym.split("-").map((n) => parseInt(n, 10));
    const d = new Date(y, m - 1 + delta, 1);
    setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const rows = useMemo(() => {
    if (!calendar) return [];
    const scheduled = calendar.entries.filter((e) => entryIsInMonth(e, ym));
    // Build a name -> {test, template} index across all templates
    const testIndex = new Map<string, { test: Template["tests"][number]; template: Template }>();
    for (const tpl of templates) {
      for (const test of tpl.tests) {
        const key = test.name.trim().toLowerCase();
        if (!testIndex.has(key)) testIndex.set(key, { test, template: tpl });
      }
    }

    return scheduled.map((entry) => {
      const match = testIndex.get(entry.testName.trim().toLowerCase());
      const monthStart = `${ym}-01`;
      const [y, m] = ym.split("-").map((n) => parseInt(n, 10));
      const monthEnd = new Date(y, m, 0).toISOString().slice(0, 10);

      let status: "done" | "pending" = "pending";
      let inTolerance: boolean | null = null;
      let doneDate: string | undefined;

      if (match) {
        const ms = measurements
          .filter(
            (mm) =>
              mm.testId === match.test.id &&
              (!entry.machineId || mm.machineId === entry.machineId) &&
              mm.date >= monthStart &&
              mm.date <= monthEnd,
          )
          .sort((a, b) => b.date.localeCompare(a.date));
        if (ms.length > 0) {
          status = "done";
          doneDate = ms[0].date;
          // Evaluate tolerance for all in-month measurements of that test
          let anyOut = false;
          let anyEvaluated = false;
          for (const meas of ms) {
            const walked = walkDataPoints(match.test).find(
              (w) => dpSeriesLabel(w) === meas.cellLabel,
            );
            if (!walked?.dp.parsedTolerance || walked.dp.parsedTolerance.type === "none") continue;
            anyEvaluated = true;
            if (!evaluateTolerance(walked.dp.parsedTolerance, meas.value).inTolerance) {
              anyOut = true;
              break;
            }
          }
          inTolerance = anyEvaluated ? !anyOut : null;
        }
      }

      return {
        entry,
        taskId: calendarTaskId(ym, entry.testName, entry.machineId),
        scheduleLabel: entryDatesInMonth(entry, ym),
        status,
        inTolerance,
        doneDate,
        matched: !!match,
      };
    });
  }, [calendar, templates, measurements, ym]);

  const [yStr, mStr] = ym.split("-");
  const headerLabel = `${MONTH_NAMES_ES[parseInt(mStr, 10) - 1]} ${yStr}`;
  const doneCount = rows.filter((r) => r.status === "done").length;
  const oot = rows.filter((r) => r.inTolerance === false).length;

  const groups = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.entry.machineId ?? "__all__";
      const arr = map.get(key);
      if (arr) arr.push(r);
      else map.set(key, [r]);
    }
    const order = [...MACHINES.map((m) => m.id as string), "__all__"];
    return [...map.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([key, items]) => ({
        key,
        label:
          key === "__all__"
            ? "Todas las máquinas"
            : (MACHINES.find((m) => m.id === key)?.name ?? key),
        badge: key === "__all__" ? null : key,
        items,
        done: items.filter((r) => r.status === "done" || taskById.get(r.taskId)?.done).length,
      }));
  }, [rows, taskById]);


  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4" /> Resumen mensual — {headerLabel}
            </CardTitle>
            {calendar ? (
              <p className="text-xs text-muted-foreground">
                {rows.length} tests programados · {doneCount} realizados · {oot} fuera de tolerancia
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sin calendario.{" "}
                <Link to="/imports" className="text-primary underline">
                  Importar calendario
                </Link>
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Input
              type="month"
              value={ym}
              onChange={(e) => e.target.value && setYm(e.target.value)}
              className="w-[130px] sm:w-[160px]"
            />
            <Button variant="outline" size="icon" onClick={() => shiftMonth(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!calendar ? null : rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Sin tests programados para {headerLabel}.
          </p>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <div key={g.key}>
                <div className="mb-1 flex items-center gap-2 border-b pb-1">
                  {g.badge && (
                    <Badge variant="secondary" className="text-[10px]">
                      {g.badge}
                    </Badge>
                  )}
                  <h4 className="text-sm font-semibold">{g.label}</h4>
                  <span className="text-xs text-muted-foreground">
                    {g.done}/{g.items.length} completados
                  </span>
                </div>
                <ul className="divide-y">
                  {g.items.map((r, i) => {
                    const task = taskById.get(r.taskId);
                    const checked = task?.done ?? false;
                    return (
                      <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <div className="flex min-w-0 items-start gap-2">
                          <Checkbox
                            className="mt-0.5"
                            checked={checked}
                            onCheckedChange={(v: boolean | "indeterminate") =>
                              toggleTask(r.entry.testName, v === true, r.entry.machineId)
                            }
                            aria-label={`Marcar ${r.entry.testName} como completado`}
                          />
                          <div className="min-w-0">
                            <p
                              className={`truncate font-medium ${checked ? "line-through opacity-70" : ""}`}
                            >
                              {r.entry.testName}
                              {!r.matched && (
                                <span className="ml-2 text-[10px] text-muted-foreground">
                                  (no asociado a plantilla)
                                </span>
                              )}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {r.entry.category ? `${r.entry.category} · ` : ""}
                              {r.scheduleLabel}
                              {r.entry.time ? ` · ${r.entry.time}` : ""}
                              {r.entry.performer ? ` · ${r.entry.performer}` : ""}
                              {r.doneDate ? ` · datos ${r.doneDate}` : ""}
                            </p>
                            {task?.done && task.completedAt && (
                              <p className="truncate text-xs text-emerald-700">
                                Completado por {task.completedByName ?? "usuario"} el{" "}
                                {new Date(task.completedAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {checked ? (
                            <Badge
                              variant="outline"
                              className="gap-1 border-emerald-500/30 bg-emerald-500/15 text-emerald-700"
                            >
                              <CheckCircle2 className="size-3" /> Completado
                            </Badge>
                          ) : r.status === "done" ? (
                            <Badge
                              variant="outline"
                              className="gap-1 border-sky-500/30 bg-sky-500/15 text-sky-700"
                            >
                              Con datos
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="gap-1 border-amber-500/30 bg-amber-500/15 text-amber-700"
                            >
                              Pendiente
                            </Badge>
                          )}
                          {r.inTolerance === true && (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                            >
                              En tolerancia
                            </Badge>
                          )}
                          {r.inTolerance === false && (
                            <Badge
                              variant="outline"
                              className="border-destructive/30 bg-destructive/10 text-destructive"
                            >
                              Fuera
                            </Badge>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

      </CardContent>
    </Card>
  );
}

