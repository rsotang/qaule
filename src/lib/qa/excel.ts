import * as XLSX from "xlsx";
import type { CellRef, Template, ToleranceValue, Tolerance } from "./types";
import { walkDataPoints, dpSeriesLabel, parseToleranceText } from "./types";

export interface ParsedWorkbook {
  sheets: ParsedSheet[];
  sheetMap: Record<string, ParsedSheet>;
}
export interface ParsedSheet {
  name: string;
  rows: number;
  cols: number;
  cells: (string | number | null)[][];
}

export async function readFile(file: File): Promise<{ wb: XLSX.WorkBook; parsed: ParsedWorkbook; hash: string }> {
  const buf = await file.arrayBuffer();
  const hash = await sha256(buf);
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheets: ParsedSheet[] = wb.SheetNames.map((name) => parseSheet(name, wb.Sheets[name]));
  const sheetMap: Record<string, ParsedSheet> = {};
  for (const s of sheets) sheetMap[s.name] = s;
  return { wb, parsed: { sheets, sheetMap }, hash };
}

function parseSheet(name: string, ws: XLSX.WorkSheet): ParsedSheet {
  const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
  const rows = range.e.r + 1;
  const cols = range.e.c + 1;
  const cells: (string | number | null)[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: (string | number | null)[] = [];
    for (let c = 0; c < cols; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) row.push(null);
      else if (cell.t === "e") row.push(null); // Excel error (#DIV/0!, #REF!, #N/A, etc.)
      else if (cell.v == null) row.push(null);
      else if (typeof cell.v === "string" && cell.v.trim() === "") row.push(null);
      else if (typeof cell.v === "string" && /^#(DIV\/0!|REF!|N\/A|NAME\?|VALUE!|NULL!|NUM!|GETTING_DATA)$/i.test(cell.v.trim())) row.push(null);
      else if (cell.v instanceof Date) row.push(cell.v.toISOString());
      else row.push(cell.v as string | number);
    }
    cells.push(row);
  }
  return { name, rows, cols, cells };
}

export function readCell(parsed: ParsedWorkbook, ref: CellRef): string | number | null {
  const sheet = parsed.sheetMap[ref.sheet];
  if (!sheet) return null;
  const { r, c } = XLSX.utils.decode_cell(ref.address);
  return sheet.cells[r]?.[c] ?? null;
}

export function readNumber(parsed: ParsedWorkbook, ref: CellRef): number | null {
  const v = readCell(parsed, ref);
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^#(DIV\/0!|REF!|N\/A|NAME\?|VALUE!|NULL!|NUM!|GETTING_DATA)$/i.test(s)) return null;
  const n = parseFloat(s.replace(",", "."));
  return isFinite(n) ? n : null;
}

export function readDate(parsed: ParsedWorkbook, ref: CellRef): string | null {
  const v = readCell(parsed, ref);
  if (v == null) return null;
  if (typeof v === "string") {
    const iso = new Date(v);
    if (!isNaN(iso.getTime())) return iso.toISOString().slice(0, 10);
    const m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) {
      let [, d, mo, y] = m;
      if (y.length === 2) y = "20" + y;
      return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return null;
  }
  if (typeof v === "number") {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export function autoDetectDateCell(sheet: ParsedSheet): { address: string; sheet: string } | null {
  for (let r = 0; r < sheet.rows; r++) {
    for (let c = 0; c < sheet.cols; c++) {
      const v = sheet.cells[r][c];
      if (typeof v === "string" && /fecha/i.test(v)) {
        for (let cc = c + 1; cc < Math.min(c + 5, sheet.cols); cc++) {
          if (sheet.cells[r][cc] != null) {
            return { sheet: sheet.name, address: XLSX.utils.encode_cell({ r, c: cc }) };
          }
        }
      }
    }
  }
  return null;
}

export function colLabel(c: number): string {
  return XLSX.utils.encode_col(c);
}
export function encodeAddress(r: number, c: number): string {
  return XLSX.utils.encode_cell({ r, c });
}
export function decodeAddress(addr: string): { r: number; c: number } {
  return XLSX.utils.decode_cell(addr);
}

async function sha256(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface ExtractedValue {
  testId: string;
  dataPointId: string;
  cellLabel: string;
  value: number | null;
  parsedTolerance?: Tolerance;
}

function resolveTolerance(
  tol: ToleranceValue | undefined,
  parsed: ParsedWorkbook,
): Tolerance | undefined {
  if (!tol) return undefined;
  if (tol.kind === "text") return parseToleranceText(tol.text);
  const v = readCell(parsed, { sheet: tol.sheet, address: tol.address });
  if (v == null) return undefined;
  return parseToleranceText(String(v));
}

export function extractFromTemplate(template: Template, parsed: ParsedWorkbook): ExtractedValue[] {
  const out: ExtractedValue[] = [];
  for (const t of template.tests) {
    for (const w of walkDataPoints(t)) {
      const value = w.dp.cell ? readNumber(parsed, w.dp.cell) : null;
      out.push({
        testId: t.id,
        dataPointId: w.dp.id,
        cellLabel: dpSeriesLabel(w),
        value,
        parsedTolerance: resolveTolerance(w.dp.tolerance, parsed) ?? w.dp.parsedTolerance,
      });
    }
  }
  return out;
}

export function resolveImportDate(template: Template, parsed: ParsedWorkbook): string | null {
  // Per-test admin date wins if any test has it
  for (const t of template.tests) {
    if (t.admin?.date) {
      const d = readDate(parsed, t.admin.date);
      if (d) return d;
    }
  }
  if (template.defaultDateCell) {
    const d = readDate(parsed, template.defaultDateCell);
    if (d) return d;
  }
  for (const name of Object.keys(parsed.sheetMap)) {
    const detected = autoDetectDateCell(parsed.sheetMap[name]);
    if (detected) {
      const d = readDate(parsed, detected);
      if (d) return d;
    }
  }
  return null;
}
