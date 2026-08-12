import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CalendarMapping, Grid } from "@/lib/qa/calendar-excel";

function colLetter(i: number): string {
  if (typeof i !== "number" || isNaN(i) || i < 0) return "";
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/**
 * Visual tool: the user opens a reference Excel calendar and clicks the header
 * row and the test-name column to build a reusable import mapping.
 */
export function CalendarMapper({
  sheetNames,
  sheets,
  initial,
  onSave,
  onCancel,
}: {
  sheetNames: string[];
  sheets: Record<string, Grid>;
  initial?: CalendarMapping | null;
  onSave: (m: CalendarMapping) => void;
  onCancel: () => void;
}) {
  const [sheetName, setSheetName] = useState(
    initial && sheetNames.includes(initial.sheetName) ? initial.sheetName : sheetNames[0],
  );
  const [headerRow, setHeaderRow] = useState<number>(initial?.headerRow ?? 0);
  const [nameCol, setNameCol] = useState<number>(initial?.nameCol ?? 0);
  const [mode, setMode] = useState<"header" | "name">("header");
  const [name, setName] = useState(initial?.name ?? "Plantilla de calendario");
  const [defaultYear, setDefaultYear] = useState<number>(
    initial?.defaultYear ?? new Date().getFullYear(),
  );

  const grid = sheets[sheetName] ?? [];
  const colCount = useMemo(
    () => grid.reduce((max, r) => Math.max(max, r?.length ?? 0), 0),
    [grid],
  );

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Nombre de la plantilla</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="w-[220px]" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Hoja</label>
          <Select value={sheetName} onValueChange={setSheetName}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sheetNames.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Año por defecto</label>
          <Input
            type="number"
            value={defaultYear}
            onChange={(e) =>
              setDefaultYear(parseInt(e.target.value || "0", 10) || new Date().getFullYear())
            }
            className="w-[110px]"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2 text-xs">
        <span className="text-muted-foreground">Clic en una celda para marcar:</span>
        <Button
          size="sm"
          variant={mode === "header" ? "default" : "outline"}
          onClick={() => setMode("header")}
        >
          Fila de cabecera (fila {headerRow + 1})
        </Button>
        <Button
          size="sm"
          variant={mode === "name" ? "default" : "outline"}
          onClick={() => setMode("name")}
        >
          Columna de tests ({colLetter(nameCol)})
        </Button>
      </div>

      <div className="max-h-[45vh] min-h-0 overflow-auto rounded border bg-background">
        <table className="w-max border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className="border px-2 py-1"> </th>
              {Array.from({ length: colCount }, (_, c) => (
                <th
                  key={c}
                  className={`border px-2 py-1 font-medium ${
                    c === nameCol ? "bg-primary/20 text-primary" : ""
                  }`}
                >
                  {colLetter(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, r) => (
              <tr key={r} className={r === headerRow ? "bg-primary/10" : undefined}>
                <td className="sticky left-0 border bg-muted px-2 py-1 font-medium">{r + 1}</td>
                {Array.from({ length: colCount }, (_, c) => (
                  <td
                    key={c}
                    onClick={() => (mode === "header" ? setHeaderRow(r) : setNameCol(c))}
                    className={`max-w-[180px] cursor-pointer truncate border px-2 py-1 hover:bg-accent ${
                      c === nameCol ? "bg-primary/10" : ""
                    }`}
                    title={row?.[c] == null ? "" : String(row[c])}
                  >
                    {row?.[c] == null ? "" : String(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          size="sm"
          onClick={() =>
            onSave({ version: 1, name, sheetName, headerRow, nameCol, defaultYear })
          }
        >
          Guardar plantilla
        </Button>
      </div>
    </div>
  );
}
