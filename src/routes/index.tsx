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
} from "@/lib/qa/db";
import {
  MACHINES,
  walkDataPoints,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, CheckCircle2, ShieldAlert, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/")({ component: Dashboard });

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
          <div>
            <CardTitle className="text-sm">{machineId}</CardTitle>
            <p className="text-xs text-muted-foreground">{machineName}</p>
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
