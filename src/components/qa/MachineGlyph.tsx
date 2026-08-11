import type { MachineId, MachineKind } from "@/lib/qa/types";
import linacAsset from "@/assets/linac.png.asset.json";
import ctAsset from "@/assets/ct.png.asset.json";

export function MachineGlyph({
  machineId,
  kind,
  className,
}: {
  machineId: MachineId;
  kind?: MachineKind;
  className?: string;
}) {
  const resolved: MachineKind =
    kind ?? (machineId === "TB1" || machineId === "TB2" || machineId === "TB3" ? "linac" : "ct");
  const isLinac = resolved === "linac";
  return (
    <img
      src={isLinac ? linacAsset.url : ctAsset.url}
      alt={isLinac ? "Acelerador lineal" : "Sistema de imagen / CT"}
      className={className}
      loading="lazy"
    />
  );
}
