import * as XLSX from "xlsx";
import type { Category, MachineId, Template, TestDef } from "./types";
import type { ParsedSheet, ParsedWorkbook } from "./excel";

/** Pattern for QA test codes: "MLC 10.12", "CMU 1.1", "CDH 2.3.1", etc. */
const TEST_CODE_RE = /\b([A-ZÁÉÍÓÚÑ]{2,6})\s+(\d+(?:\.\d+){1,3})\b/;

/** Map sheet name keywords -> category. */
function inferCategory(sheetName: string): Category {
  const n = sheetName.toLowerCase();
  if (n.includes("mecanico") && n.includes("mesa")) return "mechanical_table";
  if (n.includes("mecanico") || n.includes("mecánico")) return "mechanical_unit";
  if (n.includes("mlc")) return "mlc";
  if (n.includes("monitor")) return "monitor_system";
  if (n.includes("electr")) return "dosimetric_electron";
  if (n.includes("fot") || n.includes("dosim") || n.includes("haz") || n.includes("cuba"))
    return "dosimetric_photon";
  if (n.includes("geom")) return "geometric";
  return "mechanical_unit";
}

/** Try to detect an energy hint (6 MV, 10 MV, 6 MeV...) in adjacent cells or in the label itself. */
function inferEnergy(sheet: ParsedSheet, r: number, c: number, label: string): string | undefined {
  const energyRe = /(\d{1,2})\s*(MV|MeV)/i;
  const m = label.match(energyRe);
  if (m) return `${m[1]} ${m[2].toUpperCase().replace("MEV", "MeV")}`;
  // Look up to 6 rows above same column for energy header
  for (let rr = r - 1; rr >= Math.max(0, r - 6); rr--) {
    const v = sheet.cells[rr]?.[c];
    if (typeof v === "string") {
      const mm = v.match(energyRe);
      if (mm) return `${mm[1]} ${mm[2].toUpperCase().replace("MEV", "MeV")}`;
    }
  }
  return undefined;
}

/** Find numeric "value" cells associated with a test-code label, scanning right then down. */
function findValueCells(
  sheet: ParsedSheet,
  r: number,
  c: number,
): { address: string; label: string }[] {
  const found: { address: string; label: string }[] = [];
  // Same row, scan right up to 12 cols
  for (let cc = c + 1; cc < Math.min(sheet.cols, c + 13); cc++) {
    const v = sheet.cells[r]?.[cc];
    if (typeof v === "number") {
      const header = findColumnHeader(sheet, r, cc);
      found.push({ address: XLSX.utils.encode_cell({ r, c: cc }), label: header ?? `c${found.length + 1}` });
    }
  }
  if (found.length > 0) return found;
  // Otherwise scan the next 3 rows in same column for a single value
  for (let rr = r + 1; rr < Math.min(sheet.rows, r + 4); rr++) {
    const v = sheet.cells[rr]?.[c];
    if (typeof v === "number") {
      found.push({ address: XLSX.utils.encode_cell({ r: rr, c }), label: "valor" });
      break;
    }
    // Also same row +1 to the right
    for (let cc = c + 1; cc < Math.min(sheet.cols, c + 6); cc++) {
      const v2 = sheet.cells[rr]?.[cc];
      if (typeof v2 === "number") {
        const header = findColumnHeader(sheet, rr, cc);
        found.push({
          address: XLSX.utils.encode_cell({ r: rr, c: cc }),
          label: header ?? `c${found.length + 1}`,
        });
      }
    }
    if (found.length > 0) return found;
  }
  return found;
}

/** Look upward for a string header above a value column. */
function findColumnHeader(sheet: ParsedSheet, r: number, c: number): string | null {
  for (let rr = r - 1; rr >= Math.max(0, r - 8); rr--) {
    const v = sheet.cells[rr]?.[c];
    if (typeof v === "string" && v.trim() && !TEST_CODE_RE.test(v)) {
      return v.trim().slice(0, 24);
    }
  }
  return null;
}

/**
 * Scan a parsed workbook for cells whose text contains QA test codes (e.g., "MLC 10.12")
 * and build a Template with one TestDef per code, linked to nearby numeric value cells.
 */
export function autoBuildTemplate(parsed: ParsedWorkbook, machineId: MachineId): Template {
  const tests: TestDef[] = [];
  const seen = new Set<string>();

  for (const sheet of parsed.sheets) {
    const category = inferCategory(sheet.name);
    for (let r = 0; r < sheet.rows; r++) {
      for (let c = 0; c < sheet.cols; c++) {
        const v = sheet.cells[r][c];
        if (typeof v !== "string") continue;
        const m = v.match(TEST_CODE_RE);
        if (!m) continue;
        const code = `${m[1]} ${m[2]}`;
        const key = `${sheet.name}::${code}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const cells = findValueCells(sheet, r, c);
        const energy = inferEnergy(sheet, r, c, v);
        const cleanName = v.replace(/\s+/g, " ").trim().slice(0, 120);

        tests.push({
          id: `test-${machineId}-${tests.length}-${code.replace(/\s+/g, "_")}`,
          name: cleanName,
          category,
          energy,
          frequency: "monthly",
          unit: "",
          tolerance: { type: "none" },
          cells: cells.map((cc) => ({ sheet: sheet.name, address: cc.address, label: cc.label })),
        });
      }
    }
  }

  // Detect a default date cell (first sheet with "Fecha:" label)
  let defaultDateCell: Template["defaultDateCell"];
  for (const sheet of parsed.sheets) {
    for (let r = 0; r < sheet.rows; r++) {
      for (let c = 0; c < sheet.cols; c++) {
        const v = sheet.cells[r][c];
        if (typeof v === "string" && /fecha/i.test(v)) {
          for (let cc = c + 1; cc < Math.min(sheet.cols, c + 5); cc++) {
            if (sheet.cells[r][cc] != null) {
              defaultDateCell = { sheet: sheet.name, address: XLSX.utils.encode_cell({ r, c: cc }) };
              break;
            }
          }
        }
        if (defaultDateCell) break;
      }
      if (defaultDateCell) break;
    }
    if (defaultDateCell) break;
  }

  return {
    id: `tpl-${machineId}-${Date.now()}`,
    machineId,
    name: `Plantilla auto-detectada (${tests.length} tests)`,
    version: 1,
    createdAt: new Date().toISOString(),
    defaultDateCell,
    tests,
  };
}

/** Minimal empty starter (kept for fallback). */
export function buildSeedTemplate(machineId: MachineId): Template {
  return {
    id: `seed-${machineId}`,
    machineId,
    name: "Plantilla vacía",
    version: 1,
    createdAt: new Date().toISOString(),
    tests: [],
  };
}

/** Clone a template's tests for another machine, generating fresh ids. */
export function cloneTemplateForMachine(src: Template, machineId: MachineId): Template {
  return {
    id: `tpl-${machineId}-${Date.now()}`,
    machineId,
    name: src.name,
    version: 1,
    createdAt: new Date().toISOString(),
    defaultDateCell: src.defaultDateCell,
    tests: src.tests.map((t, i) => ({
      ...t,
      id: `test-${machineId}-${i}-${t.id.split("-").slice(-1)[0]}`,
      cells: t.cells.map((c) => ({ ...c })),
    })),
  };
}
