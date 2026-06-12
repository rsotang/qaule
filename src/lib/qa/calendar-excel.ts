import * as XLSX from "xlsx";
import type { CalendarEntry } from "./types";

const ES_MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8,
  sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
  jan: 1, apr: 4, aug: 8, dec: 12,
};

type Col =
  | { kind: "date"; iso: string }
  | { kind: "month"; ym: string };

function excelSerialToISO(n: number): string | null {
  if (!isFinite(n) || n < 1) return null;
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const d = new Date(epoch.getTime() + n * 86400000);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseHeader(raw: string | number | null, defaultYear: number): Col | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    if (raw >= 1 && raw <= 12 && Number.isInteger(raw)) {
      return { kind: "month", ym: `${defaultYear}-${String(raw).padStart(2, "0")}` };
    }
    const iso = excelSerialToISO(raw);
    if (iso) return { kind: "date", iso };
    return null;
  }
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  // ISO date
  const isoM = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoM) return { kind: "date", iso: `${isoM[1]}-${isoM[2].padStart(2, "0")}-${isoM[3].padStart(2, "0")}` };
  // D/M/Y
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (y.length === 2) y = "20" + y;
    return { kind: "date", iso: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` };
  }
  // Year-month
  const ym = s.match(/^(\d{4})[-\/](\d{1,2})$/);
  if (ym) return { kind: "month", ym: `${ym[1]}-${ym[2].padStart(2, "0")}` };
  const my = s.match(/^(\d{1,2})[-\/](\d{4})$/);
  if (my) return { kind: "month", ym: `${my[2]}-${my[1].padStart(2, "0")}` };
  // Month name (optionally with year)
  const nameYear = s.match(/^([a-záéíóú]+)\.?\s*(\d{4})?$/);
  if (nameYear) {
    const key = nameYear[1].replace(/[áéíóú]/g, (c) => ({ á: "a", é: "e", í: "i", ó: "o", ú: "u" }[c]!));
    const monthNum = ES_MONTHS[key];
    if (monthNum) {
      const year = nameYear[2] ? parseInt(nameYear[2], 10) : defaultYear;
      return { kind: "month", ym: `${year}-${String(monthNum).padStart(2, "0")}` };
    }
  }
  return null;
}

export interface ParseCalendarOptions {
  defaultYear: number;
  /** Sheet name, defaults to first sheet */
  sheetName?: string;
}

export interface ParseCalendarResult {
  entries: CalendarEntry[];
  detectedColumns: { idx: number; col: Col }[];
  headerRow: number;
  sheetName: string;
}

export async function parseCalendarFile(
  file: File,
  opts: ParseCalendarOptions,
): Promise<ParseCalendarResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const sheetName = opts.sheetName ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Hoja "${sheetName}" no encontrada`);
  const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
    header: 1,
    blankrows: false,
    defval: null,
  });

  // Find the header row: the row with the most parseable columns.
  let headerRow = 0;
  let detected: { idx: number; col: Col }[] = [];
  for (let r = 0; r < Math.min(aoa.length, 15); r++) {
    const row = aoa[r] ?? [];
    const cols: { idx: number; col: Col }[] = [];
    for (let c = 1; c < row.length; c++) {
      const parsed = parseHeader(row[c] as string | number | null, opts.defaultYear);
      if (parsed) cols.push({ idx: c, col: parsed });
    }
    if (cols.length > detected.length) {
      detected = cols;
      headerRow = r;
    }
  }
  if (detected.length === 0) {
    throw new Error(
      "No se han detectado columnas de mes/fecha. Las cabeceras deben ser nombres de mes (Enero, Febrero…), 'YYYY-MM' o fechas.",
    );
  }

  const entries: CalendarEntry[] = [];
  for (let r = headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const testName = row[0] == null ? "" : String(row[0]).trim();
    if (!testName) continue;
    const dates = new Set<string>();
    const months = new Set<string>();
    const performers = new Set<string>();
    for (const { idx, col } of detected) {
      const v = row[idx];
      if (v == null) continue;
      const s = String(v).trim();
      if (!s) continue;
      // If the cell contains a specific date, prefer that
      if (typeof v === "number") {
        const iso = excelSerialToISO(v);
        if (iso) {
          dates.add(iso);
          continue;
        }
      } else {
        const dm = s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
        if (dm) {
          let [, d, m, y] = dm;
          if (!y) y = col.kind === "date" ? col.iso.slice(0, 4) : col.ym.slice(0, 4);
          if (y.length === 2) y = "20" + y;
          dates.add(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
          continue;
        }
        // day-only number inside a month column
        if (/^\d{1,2}$/.test(s) && col.kind === "month") {
          const day = parseInt(s, 10);
          if (day >= 1 && day <= 31) {
            dates.add(`${col.ym}-${String(day).padStart(2, "0")}`);
            continue;
          }
        }
        // Otherwise treat the cell value as performer name and mark scheduled in column
        if (!/^[x✓✔√✗*•-]+$/i.test(s)) performers.add(s);
      }
      if (col.kind === "date") dates.add(col.iso);
      else months.add(col.ym);
    }
    if (dates.size === 0 && months.size === 0) continue;
    entries.push({
      testName,
      dates: [...dates].sort(),
      months: [...months].sort(),
      performer: performers.size ? [...performers].join(", ") : undefined,
    });
  }

  return { entries, detectedColumns: detected, headerRow, sheetName };
}

/** True if the entry is scheduled within the given month (YYYY-MM). */
export function entryIsInMonth(entry: CalendarEntry, ym: string): boolean {
  if (entry.months.includes(ym)) return true;
  return entry.dates.some((d) => d.startsWith(ym));
}

/** Display string for the dates of the entry within a given month. */
export function entryDatesInMonth(entry: CalendarEntry, ym: string): string {
  const inMonth = entry.dates.filter((d) => d.startsWith(ym)).map((d) => d.slice(8));
  if (inMonth.length) return `días ${inMonth.join(", ")}`;
  if (entry.months.includes(ym)) return "mes completo";
  return "";
}
