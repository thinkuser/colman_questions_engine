import { DiscoveryTracker, type DataLayerHost, type StorageLike } from "@/analytics";

/**
 * The single browser-side V2 DiscoveryTracker, created on first use on the client (null during SSR). Session context
 * lives in sessionStorage under its own key; blocked storage simply means analytics runs without preserved context.
 */
let tracker: DiscoveryTracker | null = null;

function sessionStorageOrNull(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function getDiscoveryTracker(): DiscoveryTracker | null {
  if (typeof window === "undefined") return null;
  tracker ??= new DiscoveryTracker({
    host: window as unknown as DataLayerHost,
    storage: sessionStorageOrNull(),
    debug: process.env.NODE_ENV === "development" ? (payload) => console.debug("[analytics]", payload) : undefined,
  });
  return tracker;
}
