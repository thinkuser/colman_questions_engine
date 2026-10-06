import {
  FunnelTracker,
  type DataLayerEvent,
  type DataLayerHost,
  type DispatchOptions,
  type StorageLike,
} from "@/analytics";
import { nextComparisonStep, type ComparisonAction, type ComparisonState } from "@/flow";
import type { ProgramId } from "@/engine";
import type { AnswerPolicy } from "../engine/fixtures";

export function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/**
 * Drives a FunnelTracker the way the provider does: every dispatched action is enqueued and then flushed (the
 * provider flushes in a layout effect after the product reducer has applied it).
 */
export function makeHarness(
  options: {
    storage?: StorageLike;
    search?: string;
    restored?: ComparisonState | null;
    uuid?: () => string;
    host?: DataLayerHost;
  } = {},
) {
  const host: DataLayerHost = options.host ?? {};
  let counter = 0;
  const tracker = new FunnelTracker({
    host,
    storage: options.storage ?? memoryStorage(),
    uuid: options.uuid ?? (() => `cmp-${(counter += 1)}`),
  });
  tracker.hydrate(options.restored ?? null, options.search ?? "");

  const events = (): DataLayerEvent[] => (host.dataLayer ?? []) as DataLayerEvent[];
  const names = () => events().map((e) => e.event);
  const of = (name: string) => events().filter((e) => e.event === name);

  const dispatch = (action: ComparisonAction, dispatchOptions?: DispatchOptions) => {
    tracker.enqueue(action, dispatchOptions);
    tracker.flush();
  };
  const select = (...ids: ProgramId[]) => ids.forEach((programId) => dispatch({ type: "toggle_program", programId }));
  const start = () => dispatch({ type: "start_questions" });
  const answer = (questionId: string, answerId: string) =>
    dispatch({ type: "record_answer", answer: { questionId, answerId } });

  /** Play the whole flow like the UI: show the question (exposure), then answer it. */
  const play = (programs: ProgramId[], policy: AnswerPolicy) => {
    select(...programs);
    start();
    for (let guard = 0; guard < 20; guard++) {
      tracker.questionViewed();
      const step = nextComparisonStep(tracker.getState());
      if (step?.status !== "ask") return;
      answer(step.question.id, policy(step.question));
    }
  };

  return { host, tracker, events, names, of, dispatch, select, start, answer, play };
}

export const SAFE_VALUE = /^[A-Za-z0-9_|:.-]+$/;
