import { describe, expect, it } from "vitest";
import { ANALYTICS_EVENTS, trackEvent, type DataLayerHost } from "@/analytics";

describe("analytics vocabulary", () => {
  it("has unique event names", () => {
    expect(new Set(ANALYTICS_EVENTS).size).toBe(ANALYTICS_EVENTS.length);
  });
});

describe("trackEvent", () => {
  it("pushes the event and params onto the dataLayer", () => {
    const host: DataLayerHost = {};
    trackEvent("comparison_started", { program_1: "computer_science", selected_program_count: 2 }, host);
    expect(host.dataLayer).toEqual([
      { event: "comparison_started", program_1: "computer_science", selected_program_count: 2 },
    ]);
  });

  it("appends to an existing dataLayer", () => {
    const host: DataLayerHost = { dataLayer: [{ event: "gtm.js" }] };
    trackEvent("degree_compare_view", {}, host);
    expect(host.dataLayer).toHaveLength(2);
  });

  it("is a no-op without a browser host", () => {
    expect(trackEvent("degree_compare_view", {}, null)).toBeNull();
  });
});
