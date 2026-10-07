import { DISCOVERY_STORAGE_KEY, restoreDiscovery, serializeDiscovery, type DiscoveryState } from "@/flow";

/**
 * Thin localStorage binding for the durable V2 journey (all validation lives in the flow layer). Storage can be
 * unavailable, so every access is guarded: failure simply means "nothing persisted". An invalid or stale entry is
 * cleared instead of crashing, and the V1 key is never read or written here.
 */

export function loadStoredDiscovery(): DiscoveryState | null {
  try {
    const raw = window.localStorage.getItem(DISCOVERY_STORAGE_KEY);
    const restored = restoreDiscovery(raw);
    if (raw !== null && restored === null) window.localStorage.removeItem(DISCOVERY_STORAGE_KEY);
    return restored;
  } catch {
    return null;
  }
}

export function saveStoredDiscovery(state: DiscoveryState): void {
  try {
    const serialized = serializeDiscovery(state);
    if (serialized === null) window.localStorage.removeItem(DISCOVERY_STORAGE_KEY);
    else window.localStorage.setItem(DISCOVERY_STORAGE_KEY, serialized);
  } catch {
    // Best effort; the in-memory journey keeps working.
  }
}
