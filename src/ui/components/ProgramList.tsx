import { getProgramSummary } from "@/data";
import type { ProgramId } from "@/engine";
import { ProgramName } from "./ProgramName";

export function ProgramList({ programIds }: { programIds: ProgramId[] }) {
  return (
    <ul className="list-disc ps-6">
      {programIds.map((id) => {
        const program = getProgramSummary(id);
        return <li key={id}>{program ? <ProgramName program={program} /> : id}</li>;
      })}
    </ul>
  );
}
