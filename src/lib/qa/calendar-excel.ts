import * as XLSX from "xlsx";
import type { CalendarEntry } from "./types";

const ES_MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9,
  set: 9,
  oct: 10,
  nov: 11,
  dic: 12,
  jan: 1,
  apr: 4,
  aug: 8,
  dec: 12,
};

type Col = { kind: "date"; iso: string } | { kind: "month"; ym: string };

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
  if (isoM)
    return {
      kind: "date",
      iso: `${isoM[1]}-${isoM[2].padStart(2, "0")}-${isoM[3].padStart(2, "0")}`,
    };
  // D/M/Y
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    const [, d, m] = dmy;
    let y = dmy[3];
    if (y.length === 2) y = "20" + y;
    return { kind: "date", iso: `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` };
  }
  // Year-month
  const ym = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (ym) return { kind: "month", ym: `${ym[1]}-${ym[2].padStart(2, "0")}` };
  const my = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (my) return { kind: "month", ym: `${my[2]}-${my[1].padStart(2, "0")}` };
  // Month name (optionally with year)
  const nameYear = s.match(/^([a-záéíóú]+)\.?\s*(\d{4})?$/);
  if (nameYear) {
    const key = nameYear[1].replace(
      /[áéíóú]/g,
      (c) => ({ á: "a", é: "e", í: "i", ó: "o", ú: "u" })[c]!,
    );
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
  /** Optional explicit mapping (from the calendar template tool) */
  mapping?: CalendarMapping;
}

/** Reusable mapping describing where the calendar lives inside a workbook. */
export interface CalendarMapping {
  version: 1;
  name?: string;
  sheetName: string;
  /** 0-based index of the row that contains the month/date headers */
  headerRow: number;
  /** 0-based index of the column that contains the test names */
  nameCol: number;
  /** 0-based indexes of the columns to read (empty = auto-detect) */
  valueCols?: number[];
  defaultYear?: number;
}

export interface ParseCalendarResult {
  entries: CalendarEntry[];
  detectedColumns: { idx: number; col: Col }[];
  headerRow: number;
  sheetName: string;
}

export type Grid = (string | number | null)[][];

function sheetToAoa(ws: XLSX.WorkSheet): Grid {
  return XLSX.utils.sheet_to_json<Grid[number]>(ws, {
    header: 1,
    blankrows: false,
    defval: null,
  });
}

/** Read every sheet of a workbook as a raw grid — used by the mapping tool. */
export async function readCalendarWorkbook(
  file: File,
): Promise<{ sheetNames: string[]; sheets: Record<string, Grid> }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const sheets: Record<string, Grid> = {};
  for (const name of wb.SheetNames) sheets[name] = sheetToAoa(wb.Sheets[name]);
  return { sheetNames: wb.SheetNames, sheets };
}

export function parseCalendarGrid(
  aoa: Grid,
  sheetName: string,
  opts: { defaultYear: number; headerRow?: number; nameCol?: number; valueCols?: number[] },
): ParseCalendarResult {
  const nameCol = opts.nameCol ?? 0;
  let headerRow = opts.headerRow ?? 0;
  let detected: { idx: number; col: Col }[] = [];

  const scanRow = (r: number) => {
    const row = aoa[r] ?? [];
    const cols: { idx: number; col: Col }[] = [];
    for (let c = 0; c < row.length; c++) {
      if (c === nameCol) continue;
      if (opts.valueCols?.length && !opts.valueCols.includes(c)) continue;
      const parsed = parseHeader(row[c] as string | number | null, opts.defaultYear);
      if (parsed) cols.push({ idx: c, col: parsed });
    }
    return cols;
  };

  if (opts.headerRow == null) {
    for (let r = 0; r < Math.min(aoa.length, 15); r++) {
      const cols = scanRow(r);
      if (cols.length > detected.length) {
        detected = cols;
        headerRow = r;
      }
    }
  } else {
    detected = scanRow(headerRow);
  }

  if (detected.length === 0) {
    throw new Error(
      "No se han detectado columnas de mes/fecha. Las cabeceras deben ser nombres de mes (Enero, Febrero…), 'YYYY-MM' o fechas.",
    );
  }

  const entries: CalendarEntry[] = [];
  for (let r = headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const testName = row[nameCol] == null ? "" : String(row[nameCol]).trim();
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
        const dm = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
        if (dm) {
          const [, d, m] = dm;
          let y = dm[3];
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

export async function parseCalendarFile(
  file: File,
  opts: ParseCalendarOptions,
): Promise<ParseCalendarResult> {
  const { sheetNames, sheets } = await readCalendarWorkbook(file);
  const mapping = opts.mapping;
  const sheetName = mapping?.sheetName ?? opts.sheetName ?? sheetNames[0];
  const aoa = sheets[sheetName];
  if (!aoa) throw new Error(`Hoja "${sheetName}" no encontrada`);
  return parseCalendarGrid(aoa, sheetName, {
    defaultYear: mapping?.defaultYear ?? opts.defaultYear,
    headerRow: mapping?.headerRow,
    nameCol: mapping?.nameCol,
    valueCols: mapping?.valueCols,
  });
}

// ---------- JSON import / export ----------

export function calendarToJson(rec: {
  fileName?: string;
  updatedAt: string;
  entries: CalendarEntry[];
}): string {
  return JSON.stringify({ kind: "qaule-calendar", version: 1, ...rec }, null, 2);
}

// ----- Anual per-machine schedule format (calendario_qc_YYYY.json) -----

interface AnualPrueba {
  tipo_prueba?: string | null;
  nombre_prueba?: string | null;
  detalle?: string | null;
  paciente_id?: string | null;
  curso?: string | null;
  plan?: string | null;
  tiempo?: string | null;
  responsable?: string | null;
}
interface AnualMes {
  numero?: number;
  nombre?: string;
  fecha_qc?: string | null;
  radiofisico?: string | null;
  pruebas?: AnualPrueba[];
}
interface AnualDoc {
  ["año"]?: number;
  ano?: number;
  year?: number;
  fuente?: string;
  linacs?: Record<string, { nombre_completo?: string; meses?: AnualMes[] }>;
  maquinas?: Record<string, { nombre_completo?: string; meses?: AnualMes[] }>;
}

const KNOWN_MACHINES = new Set(["TB1", "TB2", "TB3", "IMG1", "IMG2", "IMG3", "CTSIM"]);

function isAnualDoc(raw: unknown): raw is AnualDoc {
  const o = raw as AnualDoc | null;
  return !!o && typeof o === "object" && (!!o.linacs || !!o.maquinas);
}

/** Flatten the nested yearly per-machine calendar into CalendarEntry rows. */
export function parseAnualCalendar(doc: AnualDoc): { fileName?: string; entries: CalendarEntry[] } {
  const year = doc["año"] ?? doc.ano ?? doc.year ?? new Date().getFullYear();
  const machines = { ...(doc.linacs ?? {}), ...(doc.maquinas ?? {}) };
  const byKey = new Map<string, CalendarEntry>();

  for (const [rawId, machine] of Object.entries(machines)) {
    const id = rawId.trim().toUpperCase().replace(/\s+/g, "");
    const machineId = KNOWN_MACHINES.has(id)
      ? (id as NonNullable<CalendarEntry["machineId"]>)
      : undefined;
    for (const mes of machine?.meses ?? []) {
      const num = typeof mes.numero === "number" ? mes.numero : null;
      if (!num || num < 1 || num > 12) continue;
      const ym = `${year}-${String(num).padStart(2, "0")}`;
      const date =
        typeof mes.fecha_qc === "string" && /^\d{4}-\d{2}-\d{2}$/.test(mes.fecha_qc)
          ? // ignore dates that fall outside the month they are listed under
            mes.fecha_qc.startsWith(ym)
            ? mes.fecha_qc
            : null
          : null;
      for (const p of mes.pruebas ?? []) {
        const category = (p.tipo_prueba ?? "").trim();
        const name = (p.nombre_prueba ?? "").trim();
        const testName =
          name && name.toLowerCase() !== "todas"
            ? name
            : category
              ? `${category}${name ? ` — ${name}` : ""}`
              : name;
        if (!testName) continue;
        const key = `${machineId ?? rawId}|${category}|${testName.toLowerCase()}`;
        let entry = byKey.get(key);
        if (!entry) {
          entry = {
            testName,
            dates: [],
            months: [],
            machineId,
            category: category || undefined,
            detail: p.detalle ?? undefined,
            patientId: p.paciente_id ?? undefined,
            course: p.curso ?? undefined,
            plan: p.plan ?? undefined,
            time: p.tiempo ?? undefined,
          };
          byKey.set(key, entry);
        }
        const performer = (p.responsable ?? mes.radiofisico ?? "").trim();
        if (performer) {
          const set = new Set((entry.performer ?? "").split(", ").filter(Boolean));
          set.add(performer);
          entry.performer = [...set].join(", ");
        }
        if (date) {
          if (!entry.dates.includes(date)) entry.dates.push(date);
        } else if (!entry.months.includes(ym)) entry.months.push(ym);
      }
    }
  }

  const entries = [...byKey.values()].map((e) => ({
    ...e,
    dates: e.dates.sort(),
    months: e.months.sort(),
  }));
  entries.sort(
    (a, b) =>
      (a.machineId ?? "").localeCompare(b.machineId ?? "") ||
      (a.category ?? "").localeCompare(b.category ?? "") ||
      a.testName.localeCompare(b.testName),
  );
  return { fileName: doc.fuente, entries };
}

/** Parse a calendar JSON file (exported by this app, the yearly schedule, or hand-written). */
export function parseCalendarJson(text: string): { fileName?: string; entries: CalendarEntry[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("El archivo no es JSON válido");
  }
  if (isAnualDoc(raw)) {
    const res = parseAnualCalendar(raw);
    if (res.entries.length === 0) throw new Error("El calendario anual no contiene pruebas");
    return res;
  }
  const obj = (Array.isArray(raw) ? { entries: raw } : raw) as {
    fileName?: string;
    entries?: unknown;
  };
  if (!Array.isArray(obj.entries)) throw new Error("Falta la lista 'entries' en el JSON");
  const entries: CalendarEntry[] = obj.entries.map((e, i) => {
    const o = e as Partial<CalendarEntry>;
    const testName = typeof o.testName === "string" ? o.testName.trim() : "";
    if (!testName) throw new Error(`Entrada ${i + 1}: falta 'testName'`);
    const dates = Array.isArray(o.dates) ? o.dates.filter((d) => typeof d === "string") : [];
    const months = Array.isArray(o.months) ? o.months.filter((m) => typeof m === "string") : [];
    if (dates.length === 0 && months.length === 0)
      throw new Error(`Entrada "${testName}": necesita 'dates' o 'months'`);
    return {
      testName,
      dates: [...dates].sort(),
      months: [...months].sort(),
      performer: typeof o.performer === "string" ? o.performer : undefined,
      machineId: o.machineId,
      category: typeof o.category === "string" ? o.category : undefined,
      detail: typeof o.detail === "string" ? o.detail : undefined,
      patientId: typeof o.patientId === "string" ? o.patientId : undefined,
      course: typeof o.course === "string" ? o.course : undefined,
      plan: typeof o.plan === "string" ? o.plan : undefined,
      time: typeof o.time === "string" ? o.time : undefined,
    };
  });
  return { fileName: typeof obj.fileName === "string" ? obj.fileName : undefined, entries };
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
  return "";
}
