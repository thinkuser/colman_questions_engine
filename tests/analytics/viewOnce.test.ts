import { describe, expect, it } from "vitest";
import { observeViewOnce, sanitizeParams, trackEvent, type ObserverCtor } from "@/analytics";

/** Minimal fake IntersectionObserver that lets the test decide when the element becomes visible. */
function fakeObserver() {
  const instances: Array<{
    callback: (entries: Array<{ isIntersecting: boolean }>) => void;
    observed: unknown[];
    disconnected: number;
  }> = [];
  const Impl = class {
    callback: (entries: Array<{ isIntersecting: boolean }>) => void;
    observed: unknown[] = [];
    disconnected = 0;
    constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
      this.callback = callback;
      instances.push(this);
    }
    observe(target: unknown) {
      this.observed.push(target);
    }
    disconnect() {
      this.disconnected += 1;
    }
  };
  return { Impl: Impl as unknown as ObserverCtor, instances };
}

describe("observeViewOnce", () => {
  it("does not fire on mount, only once the element is actually visible", () => {
    const { Impl, instances } = fakeObserver();
    let views = 0;
    observeViewOnce({}, () => (views += 1), { observer: Impl });
    expect(views).toBe(0);
    instances[0]!.callback([{ isIntersecting: false }]);
    expect(views).toBe(0);
    instances[0]!.callback([{ isIntersecting: true }]);
    expect(views).toBe(1);
  });

  it("fires at most once and disconnects after firing", () => {
    const { Impl, instances } = fakeObserver();
    let views = 0;
    observeViewOnce({}, () => (views += 1), { observer: Impl });
    instances[0]!.callback([{ isIntersecting: true }]);
    instances[0]!.callback([{ isIntersecting: true }]);
    expect(views).toBe(1);
    expect(instances[0]!.disconnected).toBeGreaterThan(0);
  });

  it("returns a cleanup that disconnects", () => {
    const { Impl, instances } = fakeObserver();
    const cleanup = observeViewOnce({}, () => {}, { observer: Impl });
    cleanup();
    expect(instances[0]!.disconnected).toBe(1);
  });

  it("never fakes an exposure when IntersectionObserver is unavailable or there is no element", () => {
    let views = 0;
    expect(() => observeViewOnce({}, () => (views += 1), { observer: null })()).not.toThrow();
    const { Impl } = fakeObserver();
    observeViewOnce(null, () => (views += 1), { observer: Impl });
    expect(views).toBe(0);
  });
});

describe("transport guard", () => {
  it("drops undocumented keys and non-scalar values", () => {
    const clean = sanitizeParams({
      question_id: "Q1",
      selected_program_count: 2,
      is_tie_breaker: false,
      free_text: "שלום",
      answer_label: "x",
      nested: { a: 1 },
      list: ["a"],
      comparison_id: undefined,
    });
    expect(clean).toEqual({ question_id: "Q1", selected_program_count: 2, is_tie_breaker: false });
  });

  it("creates the dataLayer on demand and keeps working without any GTM container", () => {
    const host: { dataLayer?: unknown[] } = {};
    trackEvent("degree_compare_view", { selected_program_count: 0 }, host);
    expect(host.dataLayer).toEqual([{ event: "degree_compare_view", selected_program_count: 0 }]);
  });
});
