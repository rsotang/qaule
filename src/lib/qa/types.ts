export type MachineId = "TB1" | "TB2" | "TB3";

export const MACHINES: { id: MachineId; name: string }[] = [
  { id: "TB1", name: "TrueBeam 1" },
  { id: "TB2", name: "TrueBeam 2" },
  { id: "TB3", name: "TrueBeam 3" },
];

export type Frequency = "monthly" | "quarterly" | "annual";
export type Category =
  | "mechanical_unit"
  | "mechanical_table"
  | "geometric"
  | "mlc"
  | "dosimetric_photon"
  | "dosimetric_electron"
  | "monitor_system";

export const CATEGORY_LABELS: Record<Category, string> = {
  mechanical_unit: "Mecánico Unidad",
  mechanical_table: "Mecánico Mesa",
  geometric: "Geométrico Haz",
  mlc: "MLC",
  dosimetric_photon: "Dosimétrico Fotones",
  dosimetric_electron: "Dosimétrico Electrones",
  monitor_system: "Sistema Monitor",
};

export type Tolerance =
  | { type: "pm"; nominal: number; delta: number } // |x - nominal| <= delta
  | { type: "range"; min: number; max: number }
  | { type: "abs"; delta: number } // |x| <= delta (deviation from 0)
  | { type: "none" };

export interface CellRef {
  sheet: string;
  address: string; // A1
  label?: string; // series label when multi-cell
}

export interface TestDef {
  id: string;
  name: string;
  category: Category;
  energy?: string; // "6 MV", "10 MV", "6 MeV", or undefined
  frequency: Frequency;
  unit?: string;
  tolerance: Tolerance;
  cells: CellRef[];
  dateCell?: CellRef; // overrides workbook-level date
}

export interface Template {
  id: string;
  machineId: MachineId;
  name: string;
  version: number;
  createdAt: string;
  defaultDateCell?: CellRef; // e.g. Resultados sheet date
  tests: TestDef[];
}

export interface MachineRecord {
  id: MachineId;
  name: string;
  activeTemplateId?: string;
}

export interface ImportRecord {
  id: string;
  machineId: MachineId;
  fileName: string;
  importedAt: string;
  sourceDate: string; // ISO date taken from the workbook (month covered)
  fileHash: string;
}

export interface Measurement {
  id: string; // `${importId}:${testId}:${cellIdx}`
  importId: string;
  machineId: MachineId;
  testId: string;
  cellLabel: string;
  date: string; // ISO
  value: number;
}

export function evaluateTolerance(
  tol: Tolerance,
  value: number,
): { inTolerance: boolean; deviation: number } {
  switch (tol.type) {
    case "pm":
      return { inTolerance: Math.abs(value - tol.nominal) <= tol.delta, deviation: value - tol.nominal };
    case "abs":
      return { inTolerance: Math.abs(value) <= tol.delta, deviation: value };
    case "range":
      return { inTolerance: value >= tol.min && value <= tol.max, deviation: 0 };
    case "none":
      return { inTolerance: true, deviation: 0 };
  }
}

export function toleranceBand(tol: Tolerance): { min: number; max: number } | null {
  switch (tol.type) {
    case "pm":
      return { min: tol.nominal - tol.delta, max: tol.nominal + tol.delta };
    case "abs":
      return { min: -tol.delta, max: tol.delta };
    case "range":
      return { min: tol.min, max: tol.max };
    case "none":
      return null;
  }
}
