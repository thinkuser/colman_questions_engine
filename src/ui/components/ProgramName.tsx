import type { ProgramSummary } from "@/data";

/** Program name plus its mandatory qualifier (DEC-015), e.g. MIS "דו-חוגי עם מנהל עסקים". */
export function ProgramName({ program, className }: { program: ProgramSummary; className?: string }) {
  return (
    <span className={className}>
      {program.nameHe}
      {program.qualifierHe && <span className="ms-2 text-sm text-slate-600">({program.qualifierHe})</span>}
    </span>
  );
}
