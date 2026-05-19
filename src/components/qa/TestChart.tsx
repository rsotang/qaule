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
import { toleranceBand, evaluateTolerance } from "@/lib/qa/types";

interface Props {
  test: TestDef;
  measurements: Measurement[];
}

const SERIES_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea", "#0891b2"];

export function TestChart({ test, measurements }: Props) {
  const { data, seriesKeys, band, hasOOT } = useMemo(() => {
    const seriesKeys = test.cells.map((c, i) => c.label ?? `c${i}`);
    const byDate = new Map<string, Record<string, number | string>>();
    for (const m of measurements) {
      if (m.testId !== test.id) continue;
      const row = byDate.get(m.date) ?? { date: m.date };
      row[m.cellLabel] = m.value;
      byDate.set(m.date, row);
    }
    const data = [...byDate.values()].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
    const band = toleranceBand(test.tolerance);
    let hasOOT = false;
    for (const m of measurements) {
      if (m.testId !== test.id) continue;
      if (!evaluateTolerance(test.tolerance, m.value).inTolerance) hasOOT = true;
    }
    return { data, seriesKeys, band, hasOOT };
  }, [test, measurements]);

  if (data.length === 0) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center text-xs text-muted-foreground">
        Sin datos importados
      </div>
    );
  }

  const allValues = data.flatMap((r) =>
    seriesKeys.map((k) => (typeof r[k] === "number" ? (r[k] as number) : null)).filter((v): v is number => v != null),
  );
  let yMin = Math.min(...allValues);
  let yMax = Math.max(...allValues);
  if (band) {
    yMin = Math.min(yMin, band.min);
    yMax = Math.max(yMax, band.max);
  }
  const pad = (yMax - yMin) * 0.15 || Math.abs(yMax) * 0.1 || 1;
  yMin -= pad;
  yMax += pad;

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis dataKey="date" fontSize={10} tick={{ fill: "currentColor" }} />
          <YAxis
            domain={[yMin, yMax]}
            fontSize={10}
            tick={{ fill: "currentColor" }}
            width={48}
            tickFormatter={(v) => formatNum(v)}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              color: "var(--popover-foreground)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v: number | string) => (typeof v === "number" ? formatNum(v) : v)}
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
          {seriesKeys.map((k, i) => (
            <Line
              key={k}
              type="monotone"
              dataKey={k}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={(props) => {
                const { cx, cy, payload, key } = props as { cx?: number; cy?: number; payload: Record<string, unknown>; key?: string };
                const v = payload[k];
                if (cx == null || cy == null || typeof v !== "number") return <g key={key} />;
                const ok = evaluateTolerance(test.tolerance, v).inTolerance;
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
          {seriesKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
        </LineChart>
      </ResponsiveContainer>
      {hasOOT && (
        <p className="mt-1 text-[10px] font-medium text-destructive">⚠ Punto(s) fuera de tolerancia</p>
      )}
    </div>
  );
}

function formatNum(v: number) {
  if (Math.abs(v) >= 100) return v.toFixed(1);
  if (Math.abs(v) >= 1) return v.toFixed(2);
  return v.toFixed(3);
}
