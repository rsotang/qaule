import type { MachineId } from "@/lib/qa/types";

/** Simple line drawing of a C-arm LINAC: stand, rotating C-arm and treatment head. */
function LinacDrawing({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 40" fill="none" className={className} aria-hidden="true">
      {/* stand / base */}
      <path d="M4 34h40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="6" y="8" width="7" height="26" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      {/* C-arm arc */}
      <path
        d="M14 27a14 14 0 1 1 24 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* isocenter marker */}
      <circle cx="26" cy="17" r="2" stroke="currentColor" strokeWidth="1.2" />
      {/* treatment head on the upper arm */}
      <rect x="22" y="2" width="8" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M26 7v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M24 11l-2 6M28 11l2 6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity=".6" />
    </svg>
  );
}

/** Simple line drawing of a CT / imaging system: donut gantry without patient table. */
function CtDrawing({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 40" fill="none" className={className} aria-hidden="true">
      <path d="M4 34h40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* donut gantry */}
      <rect x="12" y="5" width="24" height="24" rx="6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="24" cy="17" r="7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="24" cy="17" r="3" stroke="currentColor" strokeWidth="1.2" opacity=".6" />
    </svg>
  );
}

export function MachineGlyph({ machineId, className }: { machineId: MachineId; className?: string }) {
  const isLinac = machineId === "TB1" || machineId === "TB2" || machineId === "TB3";
  return isLinac ? <LinacDrawing className={className} /> : <CtDrawing className={className} />;
}
