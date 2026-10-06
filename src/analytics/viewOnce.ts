/**
 * "View once" exposure detection for long pages: fire the callback the first time the element is actually
 * visible, not merely when its component mounted. Framework-free so it can be tested with a fake observer;
 * returns a cleanup function. Without IntersectionObserver support nothing is fired (no faked exposure).
 */

export interface ObserverLike {
  observe(target: unknown): void;
  disconnect(): void;
}

export type ObserverCtor = new (
  callback: (entries: ReadonlyArray<{ isIntersecting: boolean }>) => void,
  options?: { threshold?: number },
) => ObserverLike;

export function observeViewOnce(
  element: unknown,
  onView: () => void,
  options: { threshold?: number; observer?: ObserverCtor | null } = {},
): () => void {
  const Impl =
    options.observer === undefined
      ? (globalThis as { IntersectionObserver?: ObserverCtor }).IntersectionObserver
      : options.observer;
  if (!Impl || !element) {
    return () => {};
  }
  let fired = false;
  const observer = new Impl(
    (entries) => {
      if (!fired && entries.some((entry) => entry.isIntersecting)) {
        fired = true;
        observer.disconnect();
        onView();
      }
    },
    { threshold: options.threshold ?? 0.25 },
  );
  observer.observe(element);
  return () => observer.disconnect();
}
