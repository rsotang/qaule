import * as XLSX from "xlsx";
import type { Category, MachineId, Template, TestDef, Nest, DataPoint } from "./types";
import { emptyNest, textValue, cloneNodeDeep } from "./types";
import type { ParsedSheet, ParsedWorkbook } from "./excel";
import { autoDetectDateCell } from "./excel";


const TEST_CODE_RE = /\b([A-ZÁÉÍÓÚÑ]{2,6})\s+(\d+(?:\.\d+){1,3})\b/;

function inferCategory(sheetName: string): Category {
  const n = sheetName.toLowerCase();
  if (n.includes("mecanico") && n.includes("mesa")) return "mechanical_table";
  if (n.includes("mecanico") || n.includes("mecánico")) return "mechanical_unit";
  if (n.includes("mlc")) return "mlc";
  if (n.includes("monitor")) return "monitor_system";
  if (n.includes("electr")) return "dosimetric_electron";
  if (n.includes("fot") || n.includes("dosim") || n.includes("haz") || n.includes("cuba"))
    return "dosimetric_photon";
  if (n.includes("geometría") || n.includes("geometria")) return "image_geometry";
  if (n.includes("geom")) return "geometric";
  if (n.includes("registro")) return "image_registration";
  if (n.includes("sgrt")) return "image_sgrt";
  if (n.includes("calidad") && n.includes("cbct")) return "image_quality_cbct";
  if (n.includes("calidad") && n.includes("mv")) return "image_quality_mv";
  return "mechanical_unit";
}

function findValueCells(
  sheet: ParsedSheet,
  r: number,
  c: number,
): { address: string; label: string }[] {
  const out: { address: string; label: string }[] = [];
  for (let cc = c + 1; cc < Math.min(sheet.cols, c + 13); cc++) {
    const v = sheet.cells[r]?.[cc];
    if (typeof v === "number") {
      out.push({ address: XLSX.utils.encode_cell({ r, c: cc }), label: `c${out.length + 1}` });
    }
  }
  if (out.length === 0) {
    for (let rr = r + 1; rr < Math.min(sheet.rows, r + 4); rr++) {
      const v = sheet.cells[rr]?.[c];
      if (typeof v === "number") {
        out.push({ address: XLSX.utils.encode_cell({ r: rr, c }), label: "valor" });
        break;
      }
    }
  }
  return out;
}

export function autoBuildTemplate(parsed: ParsedWorkbook, machineId: MachineId): Template {
  const tests: TestDef[] = [];
  const seen = new Set<string>();
  let counter = 0;

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

        const valueCells = findValueCells(sheet, r, c);
        const cleanName = v.replace(/\s+/g, " ").trim().slice(0, 120);
        const root: Nest = emptyNest("raíz");
        root.children = valueCells.map((cc, i): DataPoint => ({
          id: `dp-${counter}-${i}-${crypto.randomUUID().slice(0, 6)}`,
          kind: "data",
          name: textValue(cc.label),
          cell: { sheet: sheet.name, address: cc.address },
        }));
        counter++;

        tests.push({
          id: `test-${machineId}-${tests.length}-${code.replace(/\s+/g, "_")}`,
          name: cleanName,
          category,
          frequency: "monthly",
          admin: {},
          root,
        });
      }
    }
  }

  let defaultDateCell: Template["defaultDateCell"];
  for (const sheet of parsed.sheets) {
    const detected = autoDetectDateCell(sheet);
    if (detected) {
      defaultDateCell = detected;
      break;
    }
  }

  return {
    id: `tpl-${machineId}-${Date.now()}`,
    machineId,
    name: `Plantilla auto-detectada (${tests.length} tests)`,
    version: 2,
    createdAt: new Date().toISOString(),
    defaultDateCell,
    tests,
  };
}

export function buildSeedTemplate(machineId: MachineId): Template {
  return {
    id: `seed-${machineId}`,
    machineId,
    name: "Plantilla vacía",
    version: 2,
    createdAt: new Date().toISOString(),
    tests: [],
  };
}

export function cloneTemplateForMachine(src: Template, machineId: MachineId): Template {
  return {
    id: `tpl-${machineId}-${Date.now()}`,
    machineId,
    name: src.name,
    version: 2,
    createdAt: new Date().toISOString(),
    defaultDateCell: src.defaultDateCell,
    tests: src.tests.map((t, i) => ({
      id: `test-${machineId}-${i}-${t.id.split("-").slice(-1)[0]}`,
      name: t.name,
      category: t.category,
      frequency: t.frequency,
      admin: {
        date: t.admin?.date ? { ...t.admin.date } : undefined,
        performers: t.admin?.performers?.map((p) => ({ ...p })),
      },
      root: cloneNodeDeep(t.root) as Nest,
    })),
  };
}
