import { getProgramSummary } from "@/data";
import type { ProgramId } from "@/engine";

export function ProgramList({ programIds }: { programIds: ProgramId[] }) {
  return (
    <ul className="list-disc ps-6">
      {programIds.map((id) => (
        <li key={id}>{getProgramSummary(id)?.nameHe ?? id}</li>
      ))}
    </ul>
  );
}
