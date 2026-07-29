import type { MachineId } from "@/lib/qa/types";
import linacAsset from "@/assets/linac.png.asset.json";
import ctAsset from "@/assets/ct.png.asset.json";

export function MachineGlyph({ machineId, className }: { machineId: MachineId; className?: string }) {
  const isLinac = machineId === "TB1" || machineId === "TB2" || machineId === "TB3";
  return (
    <img
      src={isLinac ? linacAsset.url : ctAsset.url}
      alt={isLinac ? "Acelerador lineal" : "Sistema de imagen / CT"}
      className={className}
      loading="lazy"
    />
  );
}
