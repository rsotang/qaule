import { useMemo, useState } from "react";
import type { ParsedSheet, ParsedWorkbook } from "@/lib/qa/excel";
import { colLabel, encodeAddress } from "@/lib/qa/excel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Props {
  parsed: ParsedWorkbook;
  initialSheet?: string;
  selected?: { sheet: string; address: string }[];
  onPick: (ref: { sheet: string; address: string }) => void;
  maxRows?: number;
}

export function CellPicker({ parsed, initialSheet, selected = [], onPick, maxRows }: Props) {

  const sheetNames = parsed.sheets.map((s) => s.name);
  const [active, setActive] = useState(initialSheet ?? sheetNames[0] ?? "");

  const sheet: ParsedSheet | undefined = parsed.sheetMap[active];

  const selectedSet = useMemo(() => {
    const s = new Set<string>();
    for (const sel of selected) if (sel.sheet === active) s.add(sel.address);
    return s;
  }, [selected, active]);

  if (!sheet) return null;

  const rows = maxRows ? Math.min(sheet.rows, maxRows) : sheet.rows;
  const cols = sheet.cols;


  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Hoja:</span>
        <Select value={active} onValueChange={setActive}>
          <SelectTrigger className="h-8 w-[280px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sheetNames.map((n) => (
              <SelectItem key={n} value={n} className="text-xs">
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[10px] text-muted-foreground">
          {sheet.rows} filas × {sheet.cols} col — mostrando {rows}×{cols}
        </span>
      </div>
      <div className="max-h-[500px] overflow-auto rounded-md border bg-card">
        <table className="text-[11px] tabular-nums">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className="sticky left-0 z-20 w-10 border-b border-r bg-muted px-1" />
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} className="min-w-[90px] border-b border-r px-1 py-1 text-center font-medium text-muted-foreground">
                  {colLabel(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                <td className="sticky left-0 z-10 border-b border-r bg-muted px-1 text-center font-medium text-muted-foreground">
                  {r + 1}
                </td>
                {Array.from({ length: cols }, (_, c) => {
                  const addr = encodeAddress(r, c);
                  const v = sheet.cells[r]?.[c];
                  const isSelected = selectedSet.has(addr);
                  const display = v == null ? "" : typeof v === "number" ? formatCellNum(v) : String(v);
                  return (
                    <td
                      key={c}
                      onClick={() => onPick({ sheet: active, address: addr })}
                      title={`${addr}: ${display}`}
                      className={cn(
                        "max-w-[140px] cursor-pointer truncate border-b border-r px-1 py-0.5 hover:bg-accent",
                        isSelected && "bg-primary/15 ring-1 ring-inset ring-primary",
                        v == null && "text-muted-foreground/40",
                      )}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCellNum(v: number) {
  if (Number.isInteger(v)) return String(v);
  if (Math.abs(v) >= 100) return v.toFixed(1);
  return v.toFixed(3).replace(/\.?0+$/, "");
}
