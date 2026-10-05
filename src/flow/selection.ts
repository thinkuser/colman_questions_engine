export const MIN_SELECTED_PROGRAMS = 2;
export const MAX_SELECTED_PROGRAMS = 3;

export function isValidSelectionSize(count: number): boolean {
  return count >= MIN_SELECTED_PROGRAMS && count <= MAX_SELECTED_PROGRAMS;
}
