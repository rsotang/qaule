import type { MachineId, MachineKind } from "@/lib/qa/types";
import linacAsset from "@/assets/linac.png.asset.json";
import ctAsset from "@/assets/ct.png.asset.json";

function resolveSrc(kind: MachineKind | undefined, machineId: MachineId) {
  if (kind) {
    if (kind === "linac") return linacAsset.url;
    if (kind === "imaging") return ctAsset.url;
    return ctAsset.url;
  }
  return machineId === "TB1" || machineId === "TB2" || machineId === "TB3"
    ? linacAsset.url
    : ctAsset.url;
}

function resolveAlt(kind: MachineKind | undefined) {
  if (kind === "linac") return "Acelerador lineal";
  if (kind === "imaging") return "Sistema de imagen";
  return "Equipo";
}

export function MachineGlyph({
  machineId,
  kind,
  className,
}: {
  machineId: MachineId;
  kind?: MachineKind;
  className?: string;
}) {
  return (
    <img
      src={resolveSrc(kind, machineId)}
      alt={resolveAlt(kind)}
      className={className}
      loading="lazy"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}
