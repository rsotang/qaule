import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { listMachines, listMeasurements, listTemplates } from "@/lib/qa/db";
import {
  MACHINES,
  displayTextOrRef,
  toleranceBand,
  type MachineId,
  type TestDef,
  type Template,
  type Nest,
  type TreeNode,
  type DataPoint,
  type TextOrRef,
} from "@/lib/qa/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/visualization")({ component: VisualizationPage });

interface SeriesSel {
  id: string;
  machineId: MachineId | "";
  testId: string;
  /** ordered child node ids picked from root downward (each must exist in tree) */
  path: string[];
}

const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea", "#0891b2", "#db2777", "#0d9488"];

function newSeries(): SeriesSel {
  return { id: `s-${Math.random().toString(36).slice(2, 9)}`, machineId: "", testId: "", path: [] };
}

function nodeName(n: TreeNode): string {
  return displayTextOrRef(n.name, "?");
}

/** Walk tree following picked child ids; returns the chain of nodes (excluding root). */
function resolveChain(root: Nest, path: string[]): TreeNode[] {
  const chain: TreeNode[] = [];
  let current: TreeNode = root;
  for (const id of path) {
    if (current.kind !== "nest") break;
    const next: TreeNode | undefined = current.children.find((c) => c.id === id);
    if (!next) break;
    chain.push(next);
    current = next;
  }
  return chain;
}

function chainLeaf(chain: TreeNode[]): DataPoint | null {
  const last = chain[chain.length - 1];
  return last && last.kind === "data" ? last : null;
}

function chainSeriesKey(chain: TreeNode[]): string {
  // matches dpSeriesLabel: join all node names (excluding root) with " / "
  return chain.map((n) => displayTextOrRef(n.name, "?")).join(" / ");
}

function parseRefNumber(v: TextOrRef | undefined): number | null {
  if (!v || v.kind !== "text") return null;
  const n = parseFloat(v.text.replace(",", "."));
  return isFinite(n) ? n : null;
}

function VisualizationPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [series, setSeries] = useState<SeriesSel[]>([newSeries()]);

  const machines = useQuery({ queryKey: ["machines"], queryFn: listMachines });
  const allTemplates = useQuery({ queryKey: ["templates-all"], queryFn: () => listTemplates() });
  const allMeasurements = useQuery({
    queryKey: ["measurements-all"],
    queryFn: () => listMeasurements(),
  });

  const templateFor = (mid: MachineId | ""): Template | null => {
    if (!mid || !machines.data || !allTemplates.data) return null;
    const m = machines.data.find((x) => x.id === mid);
    const tpls = allTemplates.data.filter((t) => t.machineId === mid);
    return tpls.find((t) => t.id === m?.activeTemplateId) ?? tpls[0] ?? null;
  };

  function updateSeries(id: string, patch: Partial<SeriesSel>) {
    setSeries((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function removeSeries(id: string) {
    setSeries((prev) => prev.filter((s) => s.id !== id));
  }

  // Resolve each series → { color, key, leaf, measurements }
  const resolved = useMemo(() => {
    return series.map((s, i) => {
      const tpl = templateFor(s.machineId);
      const test = tpl?.tests.find((t) => t.id === s.testId) ?? null;
      const chain = test ? resolveChain(test.root, s.path) : [];
      const leaf = chainLeaf(chain);
      const key = test && leaf ? chainSeriesKey(chain) : "";
      const color = COLORS[i % COLORS.length];
      const measurements = (allMeasurements.data ?? []).filter(
        (m) =>
          m.machineId === s.machineId &&
          m.testId === s.testId &&
          m.cellLabel === key &&
          (!dateFrom || m.date >= dateFrom) &&
          (!dateTo || m.date <= dateTo),
      );
      return { sel: s, test, chain, leaf, key, color, measurements };
    });
  }, [series, machines.data, allTemplates.data, allMeasurements.data, dateFrom, dateTo]);

  // Build chart data: one row per date, with each series key as column
  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const r of resolved) {
      if (!r.leaf) continue;
      const seriesId = r.sel.id; // use unique selector id as column to avoid duplicate-key collisions
      for (const m of r.measurements) {
        let row = byDate.get(m.date);
        if (!row) {
          row = { date: m.date };
          byDate.set(m.date, row);
        }
        // average if duplicates
        const prev = row[seriesId];
        row[seriesId] = typeof prev === "number" ? (prev + m.value) / 2 : m.value;
      }
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [resolved]);

  const yDomain = useMemo((): [number, number] | undefined => {
    const vals: number[] = [];
    for (const row of chartData) {
      for (const r of resolved) {
        const v = row[r.sel.id];
        if (typeof v === "number") vals.push(v);
      }
    }
    for (const r of resolved) {
      const band = toleranceBand(r.leaf?.parsedTolerance);
      if (band) vals.push(band.min, band.max);
      const ref = parseRefNumber(r.leaf?.reference);
      if (ref != null) vals.push(ref);
    }
    if (vals.length === 0) return undefined;
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    const pad = (max - min) * 0.15 || Math.abs(max) * 0.1 || 1;
    return [min - pad, max + pad];
  }, [chartData, resolved]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Visualización</h1>
        <p className="text-sm text-muted-foreground">
          Selecciona parámetros para graficarlos en función del tiempo
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Selectors */}
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Rango de fechas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Desde</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Hasta</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
            </CardContent>
          </Card>

          {series.map((s, idx) => {
            const tpl = templateFor(s.machineId);
            const test = tpl?.tests.find((t) => t.id === s.testId) ?? null;
            const chain = test ? resolveChain(test.root, s.path) : [];
            const leaf = chainLeaf(chain);

            // Build the cascade: each level shows current nest children to pick.
            // Start from root, then each picked nest in chain reveals next dropdown.
            const levels: { current: Nest; selectedId: string | undefined; depth: number }[] = [];
            if (test) {
              let nest: Nest | null = test.root;
              let depth = 0;
              while (nest) {
                const selectedId = s.path[depth];
                levels.push({ current: nest, selectedId, depth });
                if (!selectedId) break;
                const child: TreeNode | undefined = nest.children.find((c) => c.id === selectedId);
                if (!child || child.kind !== "nest") break;
                nest = child;
                depth += 1;
              }
            }

            return (
              <Card key={s.id} style={{ borderLeft: `4px solid ${COLORS[idx % COLORS.length]}` }}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm">Parámetro {idx + 1}</CardTitle>
                  {series.length > 1 && (
                    <Button variant="ghost" size="icon" className="size-6" onClick={() => removeSeries(s.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-2">
                  {/* Machine */}
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">Máquina</Label>
                    <Select
                      value={s.machineId || undefined}
                      onValueChange={(v) =>
                        updateSeries(s.id, { machineId: v as MachineId, testId: "", path: [] })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecciona máquina" /></SelectTrigger>
                      <SelectContent>
                        {MACHINES.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.id} — {m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Test */}
                  {tpl && (
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Test</Label>
                      <Select
                        value={s.testId || undefined}
                        onValueChange={(v) => updateSeries(s.id, { testId: v, path: [] })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecciona test" /></SelectTrigger>
                        <SelectContent>
                          {tpl.tests.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Cascading nest dropdowns */}
                  {levels.map(({ current, selectedId, depth }) => {
                    if (current.children.length === 0) return null;
                    return (
                      <div key={depth} className="space-y-1">
                        <Label className="text-[10px] uppercase text-muted-foreground">
                          {depth === 0 ? "Nivel 1" : `Nivel ${depth + 1}`}
                        </Label>
                        <Select
                          value={selectedId}
                          onValueChange={(v) => {
                            const nextPath = [...s.path.slice(0, depth), v];
                            updateSeries(s.id, { path: nextPath });
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Selecciona..." />
                          </SelectTrigger>
                          <SelectContent>
                            {current.children.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {nodeName(c)}
                                {c.kind === "data" ? " ●" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}

                  {leaf && (
                    <div className="rounded border border-dashed bg-muted/30 p-2 text-[10px] text-muted-foreground">
                      <div className="font-medium text-foreground">{chainSeriesKey(chain)}</div>
                      {leaf.parsedTolerance && leaf.parsedTolerance.type !== "none" && (
                        <div>Tolerancia: {displayTextOrRef(leaf.tolerance, "—")}</div>
                      )}
                      {leaf.reference && <div>Referencia: {displayTextOrRef(leaf.reference, "—")}</div>}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          <Button variant="outline" className="w-full" onClick={() => setSeries((p) => [...p, newSeries()])}>
            <Plus className="mr-2 size-4" />
            Añadir parámetro
          </Button>
        </div>

        {/* Chart */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Evolución</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <div className="flex h-[360px] items-center justify-center text-sm text-muted-foreground">
                  Selecciona al menos un parámetro completo para visualizar datos.
                </div>
              ) : (
                <div className="h-[420px] w-full">
                  <ResponsiveContainer>
                    <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                      <XAxis dataKey="date" fontSize={11} tick={{ fill: "currentColor" }} />
                      <YAxis
                        domain={yDomain ?? ["auto", "auto"]}
                        fontSize={11}
                        tick={{ fill: "currentColor" }}
                        width={56}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          color: "var(--popover-foreground)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {resolved.map((r) => {
                        if (!r.leaf) return null;
                        const band = toleranceBand(r.leaf.parsedTolerance);
                        const refVal = parseRefNumber(r.leaf.reference);
                        return (
                          <g key={r.sel.id}>
                            {band && (
                              <ReferenceLine
                                y={band.min}
                                stroke={r.color}
                                strokeWidth={1.5}
                                ifOverflow="extendDomain"
                                label={{ value: `Tol min`, fill: r.color, fontSize: 9, position: "insideBottomRight" }}
                              />
                            )}
                            {band && (
                              <ReferenceLine
                                y={band.max}
                                stroke={r.color}
                                strokeWidth={1.5}
                                ifOverflow="extendDomain"
                                label={{ value: `Tol max`, fill: r.color, fontSize: 9, position: "insideTopRight" }}
                              />
                            )}
                            {refVal != null && (
                              <ReferenceLine
                                y={refVal}
                                stroke={r.color}
                                strokeDasharray="6 4"
                                strokeWidth={1.5}
                                ifOverflow="extendDomain"
                                label={{ value: `Ref`, fill: r.color, fontSize: 9, position: "insideTopLeft" }}
                              />
                            )}
                          </g>
                        );
                      })}
                      {resolved.map((r, i) => {
                        if (!r.leaf) return null;
                        const name = `${r.sel.machineId} · ${r.test?.name ?? ""} · ${r.key}`;
                        return (
                          <Line
                            key={r.sel.id}
                            type="monotone"
                            dataKey={r.sel.id}
                            name={name}
                            stroke={r.color}
                            strokeWidth={2}
                            dot={{ r: 3.5, fill: r.color, stroke: "white", strokeWidth: 1 }}
                            connectNulls
                            isAnimationActive={false}
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
