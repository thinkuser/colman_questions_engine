import type { ProgramId } from "@/engine";

/**
 * Minimal pilot catalog so the shell can render program selection.
 * PLACEHOLDER: the structured program model, dimension vectors, and official-source content
 * are owned by THI-6 and will replace this file. Display names must be verified against
 * colman.ac.il / academy.org.il there.
 */
export interface ProgramSummary {
  id: ProgramId;
  nameHe: string;
  nameEn: string;
}

export const PILOT_PROGRAMS: readonly ProgramSummary[] = [
  { id: "computer_science", nameHe: "מדעי המחשב", nameEn: "Computer Science" },
  { id: "data_science", nameHe: "מדע הנתונים", nameEn: "Data Science" },
  { id: "management_information_systems", nameHe: "מערכות מידע ניהוליות", nameEn: "Management Information Systems" },
];

export function getProgramSummary(id: ProgramId): ProgramSummary | undefined {
  return PILOT_PROGRAMS.find((program) => program.id === id);
}
