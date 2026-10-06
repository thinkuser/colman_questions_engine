import { FunnelTracker, type DataLayerHost, type StorageLike } from "@/analytics";

/**
 * The single browser-side FunnelTracker, created on first use on the client (null during SSR). Session context
 * lives in sessionStorage (comparison id, first-touch UTMs); storage can be blocked, in which case analytics
 * simply runs without preserving context.
 */
let tracker: FunnelTracker | null = null;

function sessionStorageOrNull(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function getBrowserTracker(): FunnelTracker | null {
  if (typeof window === "undefined") return null;
  tracker ??= new FunnelTracker({
    host: window as unknown as DataLayerHost,
    storage: sessionStorageOrNull(),
    // Development inspection only; production behaviour never depends on it. window.dataLayer is the contract.
    debug: process.env.NODE_ENV === "development" ? (payload) => console.debug("[analytics]", payload) : undefined,
  });
  return tracker;
}
