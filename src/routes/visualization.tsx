import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listMachines, listMeasurements, listTemplates } from "@/lib/qa/db";
import {
  MACHINES,
  walkDataPoints,
  dpSeriesLabel,
  type MachineId,
  type TestDef,
  type Template,
} from "@/lib/qa/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { TestChart } from "@/components/qa/TestChart";
import { Search } from "lucide-react";

export const Route = createFileRoute("/visualization")({ component: VisualizationPage });

function VisualizationPage() {
  const [selectedMachines, setSelectedMachines] = useState<MachineId[]>(["TB1"]);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [excludedSeries, setExcludedSeries] = useState<Record<string, Set<string>>>({});
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [ootOnly, setOotOnly] = useState(false);
  const [groupByNest, setGroupByNest] = useState(false);
  const [testSearch, setTestSearch] = useState("");

  const machines = useQuery({ queryKey: ["machines"], queryFn: listMachines });
  const allTemplates = useQuery({ queryKey: ["templates-all"], queryFn: () => listTemplates() });
  const allMeasurements = useQuery({
    queryKey: ["measurements-all"],
    queryFn: () => listMeasurements(),
  });

  // Active template per selected machine
  const activeTemplatesByMachine = useMemo(() => {
    const map = new Map<MachineId, Template>();
    if (!machines.data || !allTemplates.data) return map;
    for (const mid of selectedMachines) {
      const m = machines.data.find((x) => x.id === mid);
      const tpls = allTemplates.data.filter((t) => t.machineId === mid);
      const tpl = tpls.find((t) => t.id === m?.activeTemplateId) ?? tpls[0];
      if (tpl) map.set(mid, tpl);
    }
    return map;
  }, [machines.data, allTemplates.data, selectedMachines]);

  // Build flat list of {machineId, template, test} for selected machines
  const availableTests = useMemo(() => {
    const list: { machineId: MachineId; template: Template; test: TestDef }[] = [];
    for (const [mid, tpl] of activeTemplatesByMachine) {
      for (const t of tpl.tests) {
        if (testSearch && !t.name.toLowerCase().includes(testSearch.toLowerCase())) continue;
        list.push({ machineId: mid, template: tpl, test: t });
      }
    }
    return list;
  }, [activeTemplatesByMachine, testSearch]);

  // Tests actually rendered as charts
  const renderedTests = useMemo(
    () =>
      availableTests.filter((x) => selectedTests.includes(`${x.machineId}::${x.test.id}`)),
    [availableTests, selectedTests],
  );

  function toggleMachine(id: MachineId) {
    setSelectedMachines((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }
  function toggleTest(machineId: MachineId, testId: string) {
    const key = `${machineId}::${testId}`;
    setSelectedTests((prev) => (prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key]));
  }
  function toggleSeries(testKey: string, seriesKey: string) {
    setExcludedSeries((prev) => {
      const next = { ...prev };
      const s = new Set(next[testKey] ?? []);
      if (s.has(seriesKey)) s.delete(seriesKey);
      else s.add(seriesKey);
      next[testKey] = s;
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Visualización</h1>
        <p className="text-sm text-muted-foreground">
          Selecciona máquinas, tests y parámetros para explorar los datos importados
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Selection panel */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Máquinas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {MACHINES.map((m) => (
                <label key={m.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedMachines.includes(m.id)}
                    onCheckedChange={() => toggleMachine(m.id)}
                  />
                  <span>
                    <span className="font-medium">{m.id}</span>
                    <span className="ml-2 text-muted-foreground">{m.name}</span>
                  </span>
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Tests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 pl-7 text-xs"
                  placeholder="Buscar test..."
                  value={testSearch}
                  onChange={(e) => setTestSearch(e.target.value)}
                />
              </div>
              <div className="max-h-[260px] space-y-2 overflow-auto pr-1">
                {[...activeTemplatesByMachine.keys()].map((mid) => {
                  const tests = availableTests.filter((x) => x.machineId === mid);
                  if (tests.length === 0) return null;
                  return (
                    <div key={mid}>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {mid}
                      </p>
                      <div className="space-y-1">
                        {tests.map(({ test }) => {
                          const key = `${mid}::${test.id}`;
                          return (
                            <label key={key} className="flex cursor-pointer items-start gap-2 text-xs">
                              <Checkbox
                                checked={selectedTests.includes(key)}
                                onCheckedChange={() => toggleTest(mid, test.id)}
                              />
                              <span className="leading-tight">{test.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {availableTests.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Selecciona al menos una máquina con plantilla activa.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Filtros</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Desde</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Hasta</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              <label className="flex items-center justify-between text-xs">
                <span>Solo fuera de tolerancia</span>
                <Switch checked={ootOnly} onCheckedChange={setOotOnly} />
              </label>
              <label className="flex items-center justify-between text-xs">
                <span>Agrupar por nest</span>
                <Switch checked={groupByNest} onCheckedChange={setGroupByNest} />
              </label>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="space-y-4">
          {renderedTests.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Selecciona uno o más tests en el panel de la izquierda para visualizar las series.
              </CardContent>
            </Card>
          ) : (
            renderedTests.map(({ machineId, test }) => {
              const testKey = `${machineId}::${test.id}`;
              const walked = walkDataPoints(test);
              const allKeys = [...new Set(walked.map((w) => {
                const label = dpSeriesLabel(w);
                if (!groupByNest) return label;
                const parts = label.split(" / ");
                return parts.length > 1 ? parts.slice(0, -1).join(" / ") : label;
              }))];
              const excluded = excludedSeries[testKey] ?? new Set<string>();
              const seriesFilter = allKeys.filter((k) => !excluded.has(k));
              const measurements = (allMeasurements.data ?? []).filter(
                (m) => m.machineId === machineId,
              );
              return (
                <Card key={testKey}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-sm">{test.name}</CardTitle>
                        <p className="text-[10px] text-muted-foreground">{machineId}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {test.frequency === "monthly" ? "Mensual" : test.frequency === "quarterly" ? "Trimestral" : "Anual"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {allKeys.length > 1 && (
                      <div className="flex flex-wrap gap-2 border-b pb-2">
                        {allKeys.map((k) => (
                          <label key={k} className="flex cursor-pointer items-center gap-1 text-[10px]">
                            <Checkbox
                              checked={!excluded.has(k)}
                              onCheckedChange={() => toggleSeries(testKey, k)}
                            />
                            <span>{k}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    <TestChart
                      test={test}
                      measurements={measurements}
                      seriesFilter={seriesFilter}
                      dateFrom={dateFrom || undefined}
                      dateTo={dateTo || undefined}
                      ootOnly={ootOnly}
                      groupByNest={groupByNest}
                      height={320}
                      showLegend
                    />
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
