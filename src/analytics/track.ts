import { ANALYTICS_PARAMS, type AnalyticsEventName, type AnalyticsParams } from "./events";

export interface DataLayerEvent extends AnalyticsParams {
  event: AnalyticsEventName;
}

export interface DataLayerHost {
  dataLayer?: unknown[];
}

const ALLOWED_PARAMS: ReadonlySet<string> = new Set(ANALYTICS_PARAMS);

/**
 * Keep only documented parameter names with scalar values. This is a structural privacy guard: free-text or
 * unexpected fields can never reach the dataLayer, whatever a caller passes.
 */
export function sanitizeParams(params: object): AnalyticsParams {
  const clean: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!ALLOWED_PARAMS.has(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      clean[key] = value;
    }
  }
  return clean as AnalyticsParams;
}

/**
 * Push an event to the GTM dataLayer. No-op outside the browser; works without any GTM/GA4 container installed
 * (the dataLayer array is created on demand). `host` is injectable so the transport can be unit-tested without a DOM.
 */
export function trackEvent(
  event: AnalyticsEventName,
  params: AnalyticsParams = {},
  host: DataLayerHost | null = typeof window === "undefined" ? null : (window as DataLayerHost),
): DataLayerEvent | null {
  if (!host) {
    return null;
  }
  const payload: DataLayerEvent = { event, ...sanitizeParams(params) };
  host.dataLayer = host.dataLayer ?? [];
  host.dataLayer.push(payload);
  return payload;
}
