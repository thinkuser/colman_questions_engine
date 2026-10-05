import type { ProgramSummary } from "@/data";

/**
 * Program name plus its mandatory qualifier (DEC-015), e.g. MIS "דו-חוגי עם מנהל עסקים".
 * The qualifier sits on its own line so it wraps cleanly on 320px screens and is never hidden.
 */
export function ProgramName({ program, className }: { program: ProgramSummary; className?: string }) {
  return (
    <span className={className}>
      <span className="block">{program.nameHe}</span>
      {program.qualifierHe && <span className="block text-sm font-normal text-slate-600">{program.qualifierHe}</span>}
    </span>
  );
}
