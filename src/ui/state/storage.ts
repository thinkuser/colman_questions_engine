import { COMPARISON_STORAGE_KEY, restoreComparison, serializeComparison, type ComparisonState } from "@/flow";

/**
 * Thin localStorage binding for the durable comparison state. All validation lives in the flow layer
 * (persistence.ts); this only moves strings. Storage can be unavailable (private mode, blocked), so every
 * access is guarded and failure simply means "nothing persisted".
 */

export function loadStoredComparison(): ComparisonState | null {
  try {
    const raw = window.localStorage.getItem(COMPARISON_STORAGE_KEY);
    const restored = restoreComparison(raw);
    if (raw !== null && restored === null) {
      window.localStorage.removeItem(COMPARISON_STORAGE_KEY); // corrupt or stale: start over cleanly
    }
    return restored;
  } catch {
    return null;
  }
}

export function saveStoredComparison(state: ComparisonState): void {
  try {
    const serialized = serializeComparison(state);
    if (serialized === null) {
      window.localStorage.removeItem(COMPARISON_STORAGE_KEY);
    } else {
      window.localStorage.setItem(COMPARISON_STORAGE_KEY, serialized);
    }
  } catch {
    // Persistence is best-effort; the in-memory flow keeps working.
  }
}
