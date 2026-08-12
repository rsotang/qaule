import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import type { Measurement, TestDef } from "@/lib/qa/types";
import { toleranceBand, evaluateTolerance, walkDataPoints } from "@/lib/qa/types";

interface Props {
  test: TestDef;
  measurements: Measurement[];
  height?: number;
  seriesFilter?: string[];
  dateFrom?: string;
  dateTo?: string;
  ootOnly?: boolean;
  groupByNest?: boolean;
  showLegend?: boolean;
}

const SERIES_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea", "#0891b2", "#db2777", "#0d9488"];

export function TestChart({
  test,
  measurements,
  height = 220,
  seriesFilter,
  dateFrom,
  dateTo,
  ootOnly,
  groupByNest,
  showLegend,
}: Props) {
  const { data, series, band, hasOOT } = useMemo(() => {
    const walked = walkDataPoints(test);
    // Map original cellLabel -> displayed series key (collapsed if grouping)
    const keyFor = (label: string) => {
      if (!groupByNest) return label;
      const parts = label.split(" / ");
      return parts.length > 1 ? parts.slice(0, -1).join(" / ") : label;
    };
    const tolFor = new Map<string, typeof walked[number]["dp"]["parsedTolerance"]>();
    for (const w of walked) {
      const fullKey = [...w.path.map((p) => p), w.dp.name]
        .map((v) => (v.kind === "text" ? v.text : `[${v.sheet}!${v.address}]`))
        .join(" / ");
      tolFor.set(keyFor(fullKey), w.dp.parsedTolerance);
    }
    const allKeys = [...new Set(walked.map((w) => {
      const full = [...w.path, w.dp.name]
        .map((v) => (v.kind === "text" ? v.text : `[${v.sheet}!${v.address}]`))
        .join(" / ");
      return keyFor(full);
    }))];
    const activeKeys = seriesFilter ? allKeys.filter((k) => seriesFilter.includes(k)) : allKeys;
    const series = activeKeys.map((key) => ({ key, tol: tolFor.get(key) }));

    // Aggregate by date -> key -> values[]
    const byDate = new Map<string, Map<string, number[]>>();
    for (const m of measurements) {
      if (m.testId !== test.id) continue;
      if (dateFrom && m.date < dateFrom) continue;
      if (dateTo && m.date > dateTo) continue;
      const key = keyFor(m.cellLabel);
      if (!activeKeys.includes(key)) continue;
      let dayMap = byDate.get(m.date);
      if (!dayMap) {
        dayMap = new Map();
        byDate.set(m.date, dayMap);
      }
      const arr = dayMap.get(key) ?? [];
      arr.push(m.value);
      dayMap.set(key, arr);
    }
    const data = [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, kmap]) => {
        const row: Record<string, number | string> = { date };
        for (const [k, arr] of kmap) {
          row[k] = arr.reduce((a, b) => a + b, 0) / arr.length;
        }
        return row;
      });

    const band = toleranceBand(series[0]?.tol);
    let hasOOT = false;
    const filteredData = ootOnly
      ? data.filter((row) =>
          series.some((s) => {
            const v = row[s.key];
            return typeof v === "number" && !evaluateTolerance(s.tol, v).inTolerance;
          }),
        )
      : data;
    for (const row of filteredData) {
      for (const s of series) {
        const v = row[s.key];
        if (typeof v === "number" && !evaluateTolerance(s.tol, v).inTolerance) hasOOT = true;
      }
    }
    return { data: filteredData, series, band, hasOOT };
  }, [test, measurements, seriesFilter, dateFrom, dateTo, ootOnly, groupByNest]);

  if (data.length === 0) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center text-xs text-muted-foreground">
        Sin datos importados
      </div>
    );
  }

  const allValues = data
    .flatMap((r) => series.map((s) => (typeof r[s.key] === "number" ? (r[s.key] as number) : null)))
    .filter((v): v is number => v != null && Number.isFinite(v));

  // Use a robust percentile range so a single bad import (e.g. a stray 3.3e9
  // value) does not blow out the Y axis. Falls back to min/max with few points.
  const sorted = [...allValues].sort((a, b) => a - b);
  const pct = (p: number) => {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
    return sorted[idx];
  };
  let yMin = sorted.length <= 4 ? (sorted[0] ?? 0) : pct(5);
  let yMax = sorted.length <= 4 ? (sorted[sorted.length - 1] ?? 1) : pct(95);
  if (yMin === yMax && sorted.length > 0) {
    yMin = sorted[0];
    yMax = sorted[sorted.length - 1];
  }
  if (band) {
    const valSpan = Math.max(yMax - yMin, Math.abs(yMax) * 0.01, 1e-9);
    const bandSpan = band.max - band.min;
    // Only fold the tolerance band into the axis when it's on a comparable
    // scale to the data; otherwise the y-axis units "go crazy" (e.g. a band
    // of ±100 with values around 0.5 would flatten every line).
    if (bandSpan <= valSpan * 8) {
      yMin = Math.min(yMin, band.min);
      yMax = Math.max(yMax, band.max);
    }
  }
  if (yMin === yMax) {
    const base = Math.abs(yMin) || 1;
    yMin -= base * 0.1;
    yMax += base * 0.1;
  }
  const span = yMax - yMin;
  yMin -= span * 0.15;
  yMax += span * 0.15;

  // Decimal precision adapts to the visible range, not the magnitude of a single value.
  const visibleSpan = yMax - yMin;
  const decimals =
    visibleSpan >= 100 ? 0 : visibleSpan >= 10 ? 1 : visibleSpan >= 1 ? 2 : visibleSpan >= 0.1 ? 3 : visibleSpan >= 0.01 ? 4 : 5;
  const fmtAxis = (v: number) => {
    if (!isFinite(v)) return "";
    const abs = Math.abs(v);
    if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) return v.toExponential(1);
    return v.toFixed(decimals);
  };

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis dataKey="date" fontSize={10} tick={{ fill: "currentColor" }} />
          <YAxis
            domain={[yMin, yMax]}
            fontSize={10}
            tick={{ fill: "currentColor" }}
            width={56}
            tickFormatter={fmtAxis}
            allowDecimals
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              color: "var(--popover-foreground)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v: number | string) => (typeof v === "number" ? fmtAxis(v) : v)}
          />

          {band && (
            <ReferenceArea
              y1={band.min}
              y2={band.max}
              fill="#16a34a"
              fillOpacity={0.08}
              stroke="#16a34a"
              strokeOpacity={0.3}
            />
          )}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={(props: unknown) => {
                const { cx, cy, payload, key } = props as { cx?: number; cy?: number; payload: Record<string, unknown>; key?: string };
                const v = payload[s.key];
                if (cx == null || cy == null || typeof v !== "number") return <g key={key} />;
                const ok = evaluateTolerance(s.tol, v).inTolerance;
                return (
                  <circle
                    key={key}
                    cx={cx}
                    cy={cy}
                    r={3.5}
                    fill={ok ? SERIES_COLORS[i % SERIES_COLORS.length] : "#dc2626"}
                    stroke="white"
                    strokeWidth={1}
                  />
                );
              }}
              isAnimationActive={false}
            />
          ))}
          {(showLegend || series.length > 1) && <Legend wrapperStyle={{ fontSize: 10 }} />}
        </LineChart>
      </ResponsiveContainer>
      {hasOOT && (
        <p className="mt-1 text-[10px] font-medium text-destructive">⚠ Punto(s) fuera de tolerancia</p>
      )}
    </div>
  );
}
