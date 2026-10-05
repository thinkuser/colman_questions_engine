import type { AnalyticsEventName, AnalyticsParams } from "./events";

export interface DataLayerEvent extends AnalyticsParams {
  event: AnalyticsEventName;
}

export interface DataLayerHost {
  dataLayer?: unknown[];
}

/**
 * Push an event to the GTM dataLayer. No-op outside the browser.
 * `host` is injectable so the transport can be unit-tested without a DOM.
 */
export function trackEvent(
  event: AnalyticsEventName,
  params: AnalyticsParams = {},
  host: DataLayerHost | null = typeof window === "undefined" ? null : (window as DataLayerHost),
): DataLayerEvent | null {
  if (!host) {
    return null;
  }
  const payload: DataLayerEvent = { event, ...params };
  host.dataLayer = host.dataLayer ?? [];
  host.dataLayer.push(payload);
  return payload;
}
