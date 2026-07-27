import type { MachineId } from "@/lib/qa/types";

/** Medical linear accelerator icon inspired by clean vector medical device sets. */
function LinacDrawing({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 40" fill="none" className={className} aria-hidden="true">
      {/* floor / base line */}
      <path d="M3 37h42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".5" />

      {/* wide pedestal base */}
      <rect x="9" y="30" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 33h10" stroke="currentColor" strokeWidth="1.2" opacity=".4" />

      {/* vertical support column */}
      <rect x="13" y="22" width="2" height="8" stroke="currentColor" strokeWidth="1.5" />

      {/* main gantry ring */}
      <circle cx="26" cy="17" r="12" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="26" cy="17" r="8" stroke="currentColor" strokeWidth="1.5" opacity=".85" />

      {/* isocenter / beam target point */}
      <circle cx="26" cy="17" r="1.5" fill="currentColor" opacity=".6" />

      {/* treatment head mounted on top of the ring */}
      <rect x="22" y="1" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="24" y="3" width="4" height="2" rx="0.5" stroke="currentColor" strokeWidth="1.2" opacity=".7" />
      <path d="M26 7v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />

      {/* beam lines radiating from head toward isocenter */}
      <path d="M23.5 7l-2.5 6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity=".5" />
      <path d="M28.5 7l2.5 6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity=".5" />

      {/* gantry housing / mechanical detail */}
      <path d="M19 12h14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".4" />
      <path d="M19 22h14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".4" />

      {/* small accent bolts on the ring */}
      <circle cx="18" cy="17" r="0.8" fill="currentColor" opacity=".5" />
      <circle cx="34" cy="17" r="0.8" fill="currentColor" opacity=".5" />
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
