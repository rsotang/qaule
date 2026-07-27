import type { MachineId } from "@/lib/qa/types";

/** Simple line drawing of a LINAC: gantry arc, head and treatment couch. */
function LinacDrawing({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 40" fill="none" className={className} aria-hidden="true">
      {/* stand / base */}
      <path d="M4 34h40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="6" y="8" width="7" height="26" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      {/* gantry ring */}
      <circle cx="26" cy="17" r="9.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="26" cy="17" r="3" stroke="currentColor" strokeWidth="1.2" />
      {/* treatment head + beam */}
      <path d="M26 7.5V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M22.5 20.5 20 30M29.5 20.5 32 30" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".6" />
      {/* couch */}
      <path d="M17 30h24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M38 30v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Simple line drawing of a CT / imaging system: donut gantry and sliding table. */
function CtDrawing({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 40" fill="none" className={className} aria-hidden="true">
      <path d="M4 34h40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* donut gantry */}
      <rect x="12" y="5" width="24" height="24" rx="6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="24" cy="17" r="7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="24" cy="17" r="3" stroke="currentColor" strokeWidth="1.2" opacity=".6" />
      {/* patient table */}
      <path d="M24 24h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M41 24v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function MachineGlyph({ machineId, className }: { machineId: MachineId; className?: string }) {
  const isLinac = machineId === "TB1" || machineId === "TB2" || machineId === "TB3";
  return isLinac ? <LinacDrawing className={className} /> : <CtDrawing className={className} />;
}
