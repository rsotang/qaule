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
import { Switch } from "@/components/ui/switch";

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
  const [showTolerance, setShowTolerance] = useState(true);
  const [showReference, setShowReference] = useState(true);

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
    const byDate = new Map<string, { date: string; sums: Map<string, { sum: number; n: number }> }>();
    for (const r of resolved) {
      if (!r.leaf) continue;
      const seriesId = r.sel.id;
      for (const m of r.measurements) {
        let row = byDate.get(m.date);
        if (!row) {
          row = { date: m.date, sums: new Map() };
          byDate.set(m.date, row);
        }
        const agg = row.sums.get(seriesId) ?? { sum: 0, n: 0 };
        agg.sum += m.value;
        agg.n += 1;
        row.sums.set(seriesId, agg);
      }
    }
    return [...byDate.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => {
        const out: Record<string, number | string> = { date: row.date };
        for (const [k, v] of row.sums) out[k] = v.sum / v.n;
        return out;
      });
  }, [resolved]);

  // Robust y-domain + adaptive formatting based on actual data magnitude.
  const { yDomain, fmtAxis, unitLabel } = useMemo(() => {
    const dataVals: number[] = [];
    for (const row of chartData) {
      for (const r of resolved) {
        const v = row[r.sel.id];
        if (typeof v === "number" && Number.isFinite(v)) dataVals.push(v);
      }
    }
    // Percentile range to ignore outliers (bad imports) from blowing up axis.
    const sorted = [...dataVals].sort((a, b) => a - b);
    const pct = (p: number) =>
      sorted.length === 0
        ? 0
        : sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))];
    let min = sorted.length <= 4 ? (sorted[0] ?? 0) : pct(5);
    let max = sorted.length <= 4 ? (sorted[sorted.length - 1] ?? 1) : pct(95);
    if (min === max && sorted.length > 0) {
      min = sorted[0];
      max = sorted[sorted.length - 1];
    }
    const baseSpan = Math.max(max - min, Math.abs(max) * 0.01, 1e-9);

    // Fold tolerance bands / reference lines into the axis ONLY when on a
    // comparable scale to the data; otherwise keep the axis tight to the data.
    if (showTolerance) {
      for (const r of resolved) {
        const band = toleranceBand(r.leaf?.parsedTolerance);
        if (!band) continue;
        const bandSpan = band.max - band.min;
        if (bandSpan <= baseSpan * 8) {
          min = Math.min(min, band.min);
          max = Math.max(max, band.max);
        }
      }
    }
    if (showReference) {
      for (const r of resolved) {
        const ref = parseRefNumber(r.leaf?.reference);
        if (ref == null) continue;
        if (Math.abs(ref - (min + max) / 2) <= baseSpan * 8) {
          min = Math.min(min, ref);
          max = Math.max(max, ref);
        }
      }
    }

    if (sorted.length === 0) return { yDomain: undefined as [number, number] | undefined, fmtAxis: (v: number) => String(v), unitLabel: "" };
    if (min === max) {
      const base = Math.abs(min) || 1;
      min -= base * 0.1;
      max += base * 0.1;
    }
    const span = max - min;
    const yDomain: [number, number] = [min - span * 0.15, max + span * 0.15];
    const visibleSpan = yDomain[1] - yDomain[0];
    const decimals =
      visibleSpan >= 100 ? 0 : visibleSpan >= 10 ? 1 : visibleSpan >= 1 ? 2 : visibleSpan >= 0.1 ? 3 : visibleSpan >= 0.01 ? 4 : 5;
    const fmtAxis = (v: number) => {
      if (!isFinite(v)) return "";
      const abs = Math.abs(v);
      if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return v.toExponential(1);
      return v.toFixed(decimals);
    };

    // Compose a unit label from active series (dedup); blank if mixed/none.
    const units = new Set<string>();
    for (const r of resolved) {
      if (!r.leaf) continue;
      const u = displayTextOrRef(r.leaf.unit, "").trim();
      if (u) units.add(u);
    }
    const unitLabel = units.size === 1 ? [...units][0] : units.size > 1 ? [...units].join(" / ") : "";

    return { yDomain, fmtAxis, unitLabel };
  }, [chartData, resolved, showTolerance, showReference]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Visualización</h1>
        <p className="text-sm text-muted-foreground">
          Selecciona parámetros para graficarlos en función del tiempo
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        {/* Date range */}
        <Card className="w-[260px] shrink-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Rango de fechas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
            <div className="space-y-2 border-t pt-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="tog-tol" className="text-xs">Mostrar tolerancias</Label>
                <Switch id="tog-tol" checked={showTolerance} onCheckedChange={setShowTolerance} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="tog-ref" className="text-xs">Mostrar referencias</Label>
                <Switch id="tog-ref" checked={showReference} onCheckedChange={setShowReference} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Parameter selectors — each row stacks vertically; dropdowns inside flow horizontally */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {series.map((s, idx) => {
            const tpl = templateFor(s.machineId);
            const test = tpl?.tests.find((t) => t.id === s.testId) ?? null;
            const chain = test ? resolveChain(test.root, s.path) : [];
            const leaf = chainLeaf(chain);

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
                <CardContent>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="w-[180px] space-y-1">
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

                    {tpl && (
                      <div className="w-[200px] space-y-1">
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

                    {levels.map(({ current, selectedId, depth }) => {
                      if (current.children.length === 0) return null;
                      return (
                        <div key={depth} className="w-[180px] space-y-1">
                          <Label className="text-[10px] uppercase text-muted-foreground">
                            Nivel {depth + 1}
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
                  </div>

                  {leaf && (
                    <div className="mt-2 rounded border border-dashed bg-muted/30 p-2 text-[10px] text-muted-foreground">
                      <div className="font-medium text-foreground">{chainSeriesKey(chain)}</div>
                      {leaf.unit && <div>Unidad: {displayTextOrRef(leaf.unit, "—")}</div>}
                      {leaf.parsedTolerance && leaf.parsedTolerance.type !== "none" && (
                        <div>Tolerancia: {displayTextOrRef(leaf.tolerance, "—")}</div>
                      )}
                      {leaf.reference && <div>Referencia: {displayTextOrRef(leaf.reference, "—")}</div>}
                    </div>
                  )}
                  {!leaf && test && (
                    <div className="mt-2 rounded border border-dashed bg-muted/30 p-2 text-[10px] text-muted-foreground">
                      Continúa eligiendo hasta llegar a un punto de dato (●) para graficar.
                    </div>
                  )}
                  {leaf && resolved.find((r) => r.sel.id === s.id)?.measurements.length === 0 && (
                    <div className="mt-2 rounded border border-dashed border-destructive/40 bg-destructive/5 p-2 text-[10px] text-destructive">
                      Sin mediciones importadas para este punto en el rango de fechas seleccionado.
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          <Button
            variant="outline"
            className="h-10 w-full border-dashed"
            onClick={() => setSeries((p) => [...p, newSeries()])}
          >
            <Plus className="mr-2 size-4" />
            Añadir parámetro
          </Button>
        </div>
      </div>

      {/* Chart below */}
      <div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Evolución</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <div className="flex h-[360px] flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
                  {resolved.every((r) => !r.leaf) ? (
                    <span>Selecciona al menos un parámetro completo (hasta un punto ●) para visualizar datos.</span>
                  ) : (
                    <>
                      <span>No hay mediciones para la selección actual.</span>
                      <span className="text-xs">Revisa el rango de fechas o importa datos para este parámetro.</span>
                    </>
                  )}
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
                        width={64}
                        tickFormatter={fmtAxis}
                        allowDecimals
                        label={
                          unitLabel
                            ? { value: unitLabel, angle: -90, position: "insideLeft", style: { fill: "currentColor", fontSize: 11 } }
                            : undefined
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          color: "var(--popover-foreground)",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                        formatter={(v: number | string) => {
                          if (typeof v !== "number") return v;
                          return unitLabel ? `${fmtAxis(v)} ${unitLabel}` : fmtAxis(v);
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {resolved.flatMap((r) => {
                        if (!r.leaf) return [];
                        const band = showTolerance ? toleranceBand(r.leaf.parsedTolerance) : null;
                        const refVal = showReference ? parseRefNumber(r.leaf.reference) : null;
                        const lines = [];
                        if (band) {
                          lines.push(
                            <ReferenceLine
                              key={`${r.sel.id}-tmin`}
                              y={band.min}
                              stroke={r.color}
                              strokeWidth={1.5}
                              ifOverflow="extendDomain"
                              label={{ value: "Tol min", fill: r.color, fontSize: 9, position: "insideBottomRight" }}
                            />,
                            <ReferenceLine
                              key={`${r.sel.id}-tmax`}
                              y={band.max}
                              stroke={r.color}
                              strokeWidth={1.5}
                              ifOverflow="extendDomain"
                              label={{ value: "Tol max", fill: r.color, fontSize: 9, position: "insideTopRight" }}
                            />,
                          );
                        }
                        if (refVal != null) {
                          lines.push(
                            <ReferenceLine
                              key={`${r.sel.id}-ref`}
                              y={refVal}
                              stroke={r.color}
                              strokeDasharray="6 4"
                              strokeWidth={1.5}
                              ifOverflow="extendDomain"
                              label={{ value: "Ref", fill: r.color, fontSize: 9, position: "insideTopLeft" }}
                            />,
                          );
                        }
                        return lines;
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
  );
}
