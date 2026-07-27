import type { MachineId } from "@/lib/qa/types";

/** Clinac-inspired line drawing: wide pedestal, rounded gantry housing, C-arm and treatment head. */
function LinacDrawing({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 40" fill="none" className={className} aria-hidden="true">
      {/* floor / base */}
      <path d="M2 36h44" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* pedestal */}
      <rect x="8" y="24" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 29h10" stroke="currentColor" strokeWidth="1.2" opacity=".5" />
      {/* main gantry housing */}
      <rect x="18" y="8" width="16" height="18" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="26" cy="17" r="3.5" stroke="currentColor" strokeWidth="1.2" />
      {/* C-arm arc */}
      <path
        d="M14 30a14 14 0 0 1 24 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* treatment head extending downward */}
      <rect x="22" y="2" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M23 8l-2.5 6h9l-2.5-6" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      {/* beam cone */}
      <path d="M26 14v7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".7" />
      <path d="M24 21l-2 6M28 21l2 6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity=".5" />
      {/* collimator / detail lines */}
      <path d="M24.5 4h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity=".6" />
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
