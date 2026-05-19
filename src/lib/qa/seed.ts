import type { MachineId, Template, TestDef } from "./types";

/** Seed a starter template based on the sample TB2 March-26 workbook layout. */
export function buildSeedTemplate(machineId: MachineId): Template {
  const tests: TestDef[] = [
    // === Gantry angle indicator (row 16 of "C. Mecanico Unidad (m)") ===
    {
      id: "gantry_angle_indicator",
      name: "Gantry — Error indicador angular",
      category: "mechanical_unit",
      frequency: "monthly",
      unit: "°",
      tolerance: { type: "abs", delta: 0.5 },
      cells: [
        { sheet: "C. Mecanico Unidad (m)", address: "C16", label: "0°" },
        { sheet: "C. Mecanico Unidad (m)", address: "D16", label: "90°" },
        { sheet: "C. Mecanico Unidad (m)", address: "E16", label: "180°" },
        { sheet: "C. Mecanico Unidad (m)", address: "F16", label: "270°" },
      ],
    },
    {
      id: "laser_reticle_g90",
      name: "Láser vs retículo — Gantry 90°",
      category: "mechanical_unit",
      frequency: "monthly",
      unit: "mm",
      tolerance: { type: "abs", delta: 1 },
      cells: [
        { sheet: "C. Mecanico Unidad (m)", address: "C35", label: "vert láser" },
        { sheet: "C. Mecanico Unidad (m)", address: "E35", label: "horiz láser" },
      ],
    },
    {
      id: "laser_reticle_g270",
      name: "Láser vs retículo — Gantry 270°",
      category: "mechanical_unit",
      frequency: "monthly",
      unit: "mm",
      tolerance: { type: "abs", delta: 1 },
      cells: [
        { sheet: "C. Mecanico Unidad (m)", address: "C36", label: "vert láser" },
        { sheet: "C. Mecanico Unidad (m)", address: "E36", label: "horiz láser" },
      ],
    },

    // === Dosimetric photons — 6 MV / 10 MV from "C.Dosim Haz Cuba(FOT)" ===
    {
      id: "pdd_zmax_6mv",
      name: "PDD Zmax — 6 MV (20×20)",
      category: "dosimetric_photon",
      energy: "6 MV",
      frequency: "monthly",
      unit: "mm",
      tolerance: { type: "pm", nominal: 13, delta: 2 },
      cells: [{ sheet: "C.Dosim Haz Cuba(FOT)", address: "C14", label: "Zmax" }],
    },
    {
      id: "tpr2010_6mv",
      name: "TPR20/10 — 6 MV",
      category: "dosimetric_photon",
      energy: "6 MV",
      frequency: "monthly",
      unit: "",
      tolerance: { type: "pm", nominal: 0.706, delta: 0.005 },
      cells: [{ sheet: "C.Dosim Haz Cuba(FOT)", address: "C15", label: "TPR20/10" }],
    },
    {
      id: "campo_x_6mv_20",
      name: "Campo X — 6 MV (20×20)",
      category: "dosimetric_photon",
      energy: "6 MV",
      frequency: "monthly",
      unit: "cm",
      tolerance: { type: "pm", nominal: 20, delta: 0.2 },
      cells: [{ sheet: "C.Dosim Haz Cuba(FOT)", address: "C17", label: "CampoX" }],
    },
    {
      id: "sim_x_6mv",
      name: "Simetría X — 6 MV (20×20)",
      category: "dosimetric_photon",
      energy: "6 MV",
      frequency: "monthly",
      unit: "%",
      tolerance: { type: "abs", delta: 3 },
      cells: [{ sheet: "C.Dosim Haz Cuba(FOT)", address: "C22", label: "SimX" }],
    },
    {
      id: "hom_x_6mv",
      name: "Homogeneidad X — 6 MV (20×20)",
      category: "dosimetric_photon",
      energy: "6 MV",
      frequency: "monthly",
      unit: "%",
      tolerance: { type: "abs", delta: 3 },
      cells: [{ sheet: "C.Dosim Haz Cuba(FOT)", address: "C24", label: "HomX" }],
    },
    {
      id: "pdd_zmax_10mv",
      name: "PDD Zmax — 10 MV (20×20)",
      category: "dosimetric_photon",
      energy: "10 MV",
      frequency: "monthly",
      unit: "mm",
      tolerance: { type: "pm", nominal: 20, delta: 2 },
      cells: [{ sheet: "C.Dosim Haz Cuba(FOT)", address: "I14", label: "Zmax" }],
    },
    {
      id: "tpr2010_10mv",
      name: "TPR20/10 — 10 MV",
      category: "dosimetric_photon",
      energy: "10 MV",
      frequency: "monthly",
      unit: "",
      tolerance: { type: "pm", nominal: 0.7665, delta: 0.005 },
      cells: [{ sheet: "C.Dosim Haz Cuba(FOT)", address: "I15", label: "TPR20/10" }],
    },
    {
      id: "sim_x_10mv",
      name: "Simetría X — 10 MV (20×20)",
      category: "dosimetric_photon",
      energy: "10 MV",
      frequency: "monthly",
      unit: "%",
      tolerance: { type: "abs", delta: 3 },
      cells: [{ sheet: "C.Dosim Haz Cuba(FOT)", address: "I22", label: "SimX" }],
    },

    // === Monitor system output ===
    {
      id: "monitor_output_6mv",
      name: "Constancia salida — 6 MV (100 UM)",
      category: "monitor_system",
      energy: "6 MV",
      frequency: "monthly",
      unit: "UM",
      tolerance: { type: "pm", nominal: 100, delta: 2 },
      cells: [{ sheet: "Caract Sistema Monitor Fot", address: "C16", label: "100 UM" }],
    },
  ];

  return {
    id: `seed-${machineId}`,
    machineId,
    name: "Plantilla inicial",
    version: 1,
    createdAt: new Date().toISOString(),
    defaultDateCell: { sheet: "C. Mecanico Unidad (m)", address: "H4" },
    tests,
  };
}
