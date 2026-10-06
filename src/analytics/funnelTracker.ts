import { z } from "zod";
import { getBankQuestion, computeFit, type AnsweredQuestion, type ProgramId } from "@/engine";
import { getProgramInputs, QUESTION_BANK } from "@/data";
import {
  comparisonReducer,
  initialComparisonState,
  nextComparisonStep,
  type ComparisonAction,
  type ComparisonState,
} from "@/flow";
import { canonicalPair, comparisonContext, hasUtm, parseUtm, resultParams, UTM_KEYS, type UtmContext } from "./context";
import type { AnalyticsEventName, AnalyticsParams } from "./events";
import { trackEvent, type DataLayerEvent, type DataLayerHost } from "./track";

/**
 * Funnel analytics for the comparison flow (THI-11). Analytics OBSERVES the product:
 * - it never feeds back into scoring, routing, results, persistence validation or product state;
 * - events are derived from the same pure reducer the product uses, by replaying dispatched actions, so a
 *   rejected action (double tap, stale answer, invalid option) yields no state change and therefore no event;
 * - every failure is swallowed: analytics can never break the experience, and nothing needs a GTM/GA4 container.
 *
 * Session context (comparison id, first-touch UTMs, last question exposure) lives in its own versioned
 * sessionStorage record, never in the durable comparison payload.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const ANALYTICS_STORAGE_KEY = "colman-studymatch:analytics";
export const ANALYTICS_STORAGE_VERSION = 1;

const StoredContextSchema = z.strictObject({
  version: z.literal(ANALYTICS_STORAGE_VERSION),
  comparison_id: z.string().min(1).nullable(),
  utm: z.strictObject(Object.fromEntries(UTM_KEYS.map((key) => [key, z.string().optional()])) as never),
  last_question_view: z.string().nullable(),
});

export interface DispatchOptions {
  /** Apply the action to analytics state (comparison id lifecycle) but emit no events for it. */
  silent?: boolean;
}

export interface FunnelTrackerOptions {
  host: DataLayerHost | null;
  storage?: StorageLike | null;
  uuid?: () => string;
  /** Development inspection hook; production behaviour never depends on it. */
  debug?: (payload: DataLayerEvent) => void;
}

interface QueuedAction {
  action: ComparisonAction;
  silent: boolean;
}

const isRunning = (state: ComparisonState) => state.status === "answering" || state.status === "completed";

function defaultUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** The current top-ranked program for the answers so far: analytical metadata only. */
function leadingProgram(selectedProgramIds: readonly ProgramId[], answers: ComparisonState["answers"]) {
  const answered: AnsweredQuestion[] = answers.map(({ questionId, answerId }) => ({
    question: getBankQuestion(QUESTION_BANK, questionId),
    answerId,
  }));
  return computeFit({ programs: getProgramInputs(selectedProgramIds), answers: answered }).ranking[0]?.programId;
}

export class FunnelTracker {
  private readonly host: DataLayerHost | null;
  private readonly storage: StorageLike | null;
  private readonly uuid: () => string;
  private readonly debug?: (payload: DataLayerEvent) => void;

  /** Replayed baseline: always equals the product's committed state once the queue is flushed. */
  private state: ComparisonState = initialComparisonState;
  private comparisonId: string | null = null;
  private utm: UtmContext = {};
  private lastQuestionView: string | null = null;
  private queue: QueuedAction[] = [];
  private fired = new Set<string>();
  /** Bumped on every completion so result-page "view once" events can fire again for a re-completed result. */
  private epoch = 0;

  constructor(options: FunnelTrackerOptions) {
    this.host = options.host;
    this.storage = options.storage ?? null;
    this.uuid = options.uuid ?? defaultUuid;
    this.debug = options.debug;
  }

  /**
   * Initialise from the restored product state and the initial URL. Emits nothing: restoring state after a refresh
   * is not a candidate action. Reuses the stored comparison id for a running comparison; first-touch UTMs are kept.
   */
  hydrate(restored: ComparisonState | null, search = ""): void {
    this.state = restored ?? initialComparisonState;
    const stored = this.load();
    const fromUrl = parseUtm(search);
    this.utm = hasUtm(stored.utm) ? stored.utm : fromUrl;
    this.lastQuestionView = stored.last_question_view;
    this.comparisonId = isRunning(this.state) ? (stored.comparison_id ?? this.uuid()) : null;
    this.persist();
  }

  /** Record a dispatched action. Events are produced by `flush()` after the product has applied it. */
  enqueue(action: ComparisonAction, options: DispatchOptions = {}): void {
    this.queue.push({ action, silent: options.silent === true });
  }

  /** Replay queued actions through the product reducer and emit the resulting events, in order. */
  flush(): void {
    const items = this.queue.splice(0);
    for (const { action, silent } of items) {
      const prev = this.state;
      const next = comparisonReducer(prev, action);
      this.state = next;
      try {
        this.transition(prev, action, next, silent);
      } catch {
        // Analytics must never affect the product.
      }
    }
  }

  getState(): ComparisonState {
    return this.state;
  }

  getComparisonId(): string | null {
    return this.comparisonId;
  }

  /** Program selection experience shown. `token` is stable per mounted view, so re-renders never duplicate it. */
  compareViewed(token: string): void {
    if (!this.once(`compare:${token}`)) return;
    this.safely(() => this.emit("degree_compare_view", this.context({ withComparisonId: false })));
  }

  /**
   * The question currently displayed was exposed. One event per logical exposure: showing the same question again
   * after Back is a new exposure; a refresh that restores the exact same displayed question is not.
   */
  questionViewed(): void {
    this.safely(() => {
      if (this.state.status !== "answering") return;
      const step = nextComparisonStep(this.state);
      if (step?.status !== "ask") return;
      const id = this.ensureComparisonId();
      const key = `${id}:${step.questionNumber}:${step.question.id}`;
      if (key === this.lastQuestionView) return;
      this.lastQuestionView = key;
      this.persist();
      const params: AnalyticsParams = {
        ...this.context(),
        question_id: step.question.id,
        question_type: step.question.type,
        question_index: step.questionNumber,
        is_tie_breaker: step.phase === "tie_breaker",
        ...(step.branch ? { branch_id: canonicalPair(...step.branch.programs) } : {}),
      };
      this.emit("question_view", params);
      if (step.phase === "tie_breaker") this.emit("tie_breaker_view", params);
    });
  }

  mirrorResponse(value: "yes" | "no"): void {
    this.resultEvent("mirror_response", { mirror_response: value });
  }

  admissionClick(): void {
    this.resultEvent("admission_click");
  }

  advisorClick(): void {
    this.resultEvent("advisor_cta_click");
  }

  /** The secondary-program section was actually exposed (once per completed result). */
  secondaryProgramViewed(): void {
    if (!this.once(`secondary:${this.comparisonId}:${this.epoch}`)) return;
    const secondary = this.state.result?.secondaryProgram;
    this.resultEvent("secondary_program_view", secondary ? { program_id: secondary } : {});
  }

  /** A reality-check card for `programId` was actually exposed (once per completed result and program). */
  realityCheckViewed(programId: ProgramId): void {
    if (!this.once(`reality:${this.comparisonId}:${this.epoch}:${programId}`)) return;
    this.resultEvent("reality_check_view", { program_id: programId });
  }

  // ---------------------------------------------------------------------------------------------------------

  private transition(prev: ComparisonState, action: ComparisonAction, next: ComparisonState, silent: boolean): void {
    const previousComparisonId = this.comparisonId;

    // comparison_id lifecycle: a running comparison (answering/completed) has exactly one id; selecting has none.
    if (action.type === "start_questions" && next !== prev && next.status === "answering") {
      this.comparisonId = this.uuid();
    } else if (!isRunning(next)) {
      this.comparisonId = null;
    } else if (!this.comparisonId) {
      this.comparisonId = this.uuid();
    }
    // Any state change makes the next displayed question a new exposure (e.g. Back from the result re-shows the
    // last question); only re-renders and refreshes without a transition are deduplicated.
    if (next !== prev) this.lastQuestionView = null;
    this.persist();
    if (silent) return;

    switch (action.type) {
      case "toggle_program":
        this.selectionEvents(prev, next);
        break;
      case "start_questions":
        if (next !== prev && next.status === "answering") {
          this.emit("comparison_started", this.context({ state: next }));
        }
        break;
      case "record_answer":
        if (next.answers.length === prev.answers.length + 1) this.answerEvents(prev, action, next);
        break;
      case "restart":
        if (prev.selectedProgramIds.length > 0 || prev.answers.length > 0) {
          this.emit("restart_comparison", {
            ...comparisonContext({
              comparisonId: previousComparisonId,
              selectedProgramIds: prev.selectedProgramIds,
              utm: this.utm,
            }),
            questions_answered: prev.answers.length,
          });
        }
        break;
      default:
        break;
    }
  }

  private selectionEvents(prev: ComparisonState, next: ComparisonState): void {
    const before = new Set(prev.selectedProgramIds);
    const after = new Set(next.selectedProgramIds);
    for (const id of next.selectedProgramIds) {
      if (!before.has(id)) this.emit("degree_selected", { ...this.context({ state: next }), program_id: id });
    }
    for (const id of prev.selectedProgramIds) {
      if (!after.has(id)) this.emit("change_program", { ...this.context({ state: next }), program_id: id });
    }
  }

  private answerEvents(
    prev: ComparisonState,
    action: Extract<ComparisonAction, { type: "record_answer" }>,
    next: ComparisonState,
  ): void {
    const before = nextComparisonStep(prev);
    if (before?.status !== "ask") return;
    const after = nextComparisonStep(next);
    const base = this.context({ state: next });
    const leading = leadingProgram(next.selectedProgramIds, next.answers);

    this.emit("question_answer", {
      ...base,
      question_id: before.question.id,
      question_type: before.question.type,
      answer_id: action.answer.answerId,
      question_index: before.questionNumber,
      is_tie_breaker: before.phase === "tie_breaker",
      ...(before.branch ? { branch_id: canonicalPair(...before.branch.programs) } : {}),
      ...(leading ? { leading_program: leading } : {}),
    });

    // The pair branch becomes determined once, when the opening questions are done.
    if (before.branch === null && after?.branch) {
      this.emit("adaptive_branch_selected", { ...base, branch_id: canonicalPair(...after.branch.programs) });
    }

    if (next.status === "completed" && next.result) {
      this.epoch += 1;
      const completed: AnalyticsParams = {
        ...base,
        questions_answered: next.answers.length,
        ...resultParams(next.result),
      };
      this.emit("comparison_completed", completed);
      if (next.result.bestFitProgram) this.emit("recommended_program", completed);
    }
  }

  private resultEvent(event: AnalyticsEventName, extra: AnalyticsParams = {}): void {
    this.safely(() => {
      const result = this.state.result;
      if (this.state.status !== "completed" || !result) return;
      this.emit(event, { ...this.context(), ...resultParams(result), ...extra });
    });
  }

  private context(options: { state?: ComparisonState; withComparisonId?: boolean } = {}): AnalyticsParams {
    const state = options.state ?? this.state;
    return comparisonContext({
      comparisonId: options.withComparisonId === false ? null : this.comparisonId,
      selectedProgramIds: state.selectedProgramIds,
      utm: this.utm,
    });
  }

  private ensureComparisonId(): string {
    this.comparisonId ??= this.uuid();
    return this.comparisonId;
  }

  private once(key: string): boolean {
    if (this.fired.has(key)) return false;
    this.fired.add(key);
    return true;
  }

  private emit(event: AnalyticsEventName, params: AnalyticsParams): void {
    const payload = trackEvent(event, params, this.host);
    if (payload) this.debug?.(payload);
  }

  private safely(fn: () => void): void {
    try {
      fn();
    } catch {
      // Analytics must never affect the product.
    }
  }

  private load(): z.infer<typeof StoredContextSchema> {
    const empty = {
      version: ANALYTICS_STORAGE_VERSION,
      comparison_id: null,
      utm: {},
      last_question_view: null,
    } as const;
    try {
      const raw = this.storage?.getItem(ANALYTICS_STORAGE_KEY);
      if (!raw) return { ...empty, utm: {} };
      const parsed = StoredContextSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : { ...empty, utm: {} };
    } catch {
      return { ...empty, utm: {} };
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(
        ANALYTICS_STORAGE_KEY,
        JSON.stringify({
          version: ANALYTICS_STORAGE_VERSION,
          comparison_id: this.comparisonId,
          utm: this.utm,
          last_question_view: this.lastQuestionView,
        }),
      );
    } catch {
      // Storage can be unavailable (private mode); analytics context is then simply not preserved.
    }
  }
}
