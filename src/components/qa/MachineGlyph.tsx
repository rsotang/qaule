import { useMachineCatalog } from "@/hooks/use-machine-catalog";
import { machineIconUrl, MACHINE_ICONS } from "@/lib/qa/types";
import type { MachineId, MachineKind } from "@/lib/qa/types";

const ICON_IDS = new Set(MACHINE_ICONS.map((i) => i.id));

/**
 * Icono de una máquina según su tipo. Resuelve el icono del tipo desde el
 * catálogo (BD con fallback a fábrica); si el tipo no tiene icono, usa el
 * genérico de TC. También permite forzar un icono explícito.
 */
export function MachineGlyph({
  machineId,
  kind,
  icon,
  className,
}: {
  machineId: MachineId;
  kind?: MachineKind;
  icon?: string | null;
  className?: string;
}) {
  const catalog = useMachineCatalog();
  const kindIcon = kind ? catalog.kindById(kind)?.icon : undefined;
  const iconId = icon ?? kindIcon ?? (kind && ICON_IDS.has(kind) ? kind : undefined);
  return (
    <img
      src={machineIconUrl(iconId)}
      alt={kind ? catalog.kindName(kind) : machineId}
      className={className}
      loading="lazy"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}
