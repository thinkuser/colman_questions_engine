import type { BankQuestion, StopReason } from "../adaptive";
import {
  buildCandidatePool,
  type CareerProject,
  type PrecisionModuleId,
  type V2AnswerOption,
  type V2Cluster,
  type V2Question,
} from "../discovery";
import type { FitResult, ProgramId, RecordedAnswer } from "../types";
import { buildHeadToHead, type HeadToHeadQuestion } from "./headToHead";
import type { PrecisionModuleAdapter } from "./precision";
import {
  clearLeader,
  rankPrograms,
  resolveAtCeiling,
  shortlist,
  tally,
  V2_MAX_GENERIC_SCORED_ANSWERS,
  V2_MIN_SCORED_ANSWERS_FOR_CLEAR,
  V2_WEIGHTS,
  type V2GenericOutcome,
  type V2QuestionSource,
  type V2RankedProgram,
  type V2RealityAnswer,
  type V2ScoredAnswer,
} from "./scoring";

/**
 * V2 hybrid shortlist router (THI-14, DEC-030). Pure and deterministic: the same projects + answers + data always
 * give the same next step. V2 decides which "room" the candidate is in; a precision module (today: the unchanged V1
 * CS/DS/MIS engine) asks the smart questions inside the tech room.
 *
 * Each step replays the recorded answers in order:
 *   1. Precision handoff: if a module can decide everything still rankable, or (after the project scenarios) the
 *      evidence shortlist sits entirely inside a module, hand off. A V2 answer to a question that `reuses` a module
 *      question is carried in, so the candidate never sees it twice.
 *   2. Project scenarios: the opening scenario of each selected project (project display order, then position).
 *   3. Resolution: a clear leader (>= 3 scored answers, >= 2 supporting, lead >= 4), or at 5 scored answers a near tie
 *      or "insufficient positive evidence". Never forced into a winner.
 *   4. Reality checks for the resolved program(s): recorded, never ranked.
 *   5. Otherwise the next focus question: an authored cluster question that separates the two leaders, else a
 *      generated head-to-head from their work statements, else an explicit `needs_focus_content` step.
 *
 * Project selection scores nothing; the candidate-pool order is never a ranking or tie-break (DEC-027). The array
 * order of tied programs (by id) only makes question choice deterministic and is documented as such.
 */

export interface V2RouterInput {
  projects: readonly CareerProject[];
  clusters: readonly V2Cluster[];
  /** Per-program "day at work" statements for the generic head-to-head (THI-15 content). */
  workStatements: Readonly<Record<ProgramId, readonly string[]>>;
  precisionModules: readonly PrecisionModuleAdapter[];
  selectedProjectIds: readonly string[];
  /** Every answer so far, in the order asked: generic V2 answers, then (after handoff) the module's own answers. */
  answers: readonly RecordedAnswer[];
}

export type V2AskedQuestion =
  | { source: "cluster"; clusterId: string; question: V2Question }
  | { source: "head_to_head"; question: HeadToHeadQuestion };

/** Why a generic question was chosen (developer trace; not candidate copy). */
export type V2AskReason = "project_scenario" | "separates_leaders" | "head_to_head" | "reality_check";

export interface V2PrecisionState {
  moduleId: PrecisionModuleId;
  /** Programs handed to the module, in the module's canonical order. */
  programIds: readonly ProgramId[];
  /** Generic answers carried into the module (translated to its question ids). */
  carriedAnswers: readonly RecordedAnswer[];
  /** Everything the module has seen: carried answers, then answers given after handoff. */
  moduleAnswers: readonly RecordedAnswer[];
}

/** Derived, recomputable state. Nothing here needs persisting: projects + answers + data reproduce it. */
export interface V2State {
  selectedProjectIds: readonly string[];
  activeClusterIds: readonly string[];
  candidatePoolProgramIds: readonly ProgramId[];
  /** Programs outside the initial pool that became rankable because an answer actually pointed to them. */
  surfacedProgramIds: readonly ProgramId[];
  rankableProgramIds: readonly ProgramId[];
  scores: Readonly<Record<ProgramId, number>>;
  support: Readonly<Record<ProgramId, number>>;
  ranking: readonly V2RankedProgram[];
  shortlist: readonly ProgramId[];
  scoredAnswerCount: number;
  evidence: readonly V2ScoredAnswer[];
  realityEvidence: readonly V2RealityAnswer[];
  askedQuestionIds: readonly string[];
  /** The generic ranking result once reached (reality checks may still follow). */
  resolution: V2GenericOutcome | null;
  precision: V2PrecisionState | null;
}

export type V2Outcome =
  | V2GenericOutcome
  | {
      kind: "precision";
      moduleId: PrecisionModuleId;
      result: FitResult;
      stopReason: StopReason;
      questionsAsked: number;
      tieBreakerUsed: boolean;
    };

export type V2CompletionReason =
  "clear_leader" | "ceiling_near_tie" | "ceiling_insufficient_evidence" | "precision_complete";

export type V2Step =
  | { status: "ask"; mode: "generic"; reason: V2AskReason; question: V2AskedQuestion; state: V2State }
  | {
      status: "ask";
      mode: "precision";
      moduleId: PrecisionModuleId;
      question: BankQuestion;
      /** 1-based position within the module's own flow (carried answers count). */
      questionNumber: number;
      state: V2State;
    }
  /** The generic flow has no authored question and no work statements for the current leaders. Explicit, never guessed. */
  | { status: "needs_focus_content"; mode: "generic"; programIds: readonly ProgramId[]; state: V2State }
  | { status: "complete"; mode: "complete"; outcome: V2Outcome; completionReason: V2CompletionReason; state: V2State };

const MAX_STEPS = 100;

const byPosition = (questions: readonly V2Question[]) => [...questions].sort((a, b) => a.position - b.position);
const targets = (option: V2AnswerOption, programId: ProgramId) => option.programIds.includes(programId);

/** Does the question let the candidate choose between the leader and the runner-up (or, alone, leave the leader)? */
function separatesLeaders(question: V2Question, leader: ProgramId, runnerUp: ProgramId | undefined): boolean {
  if (runnerUp === undefined) {
    return (
      question.options.some((option) => targets(option, leader)) &&
      question.options.some((option) => option.programIds.some((programId) => programId !== leader))
    );
  }
  const forLeader = question.options.find((option) => targets(option, leader) && !targets(option, runnerUp));
  const forRunnerUp = question.options.find((option) => targets(option, runnerUp) && !targets(option, leader));
  return Boolean(forLeader && forRunnerUp && forLeader !== forRunnerUp);
}

export function nextV2Step(input: V2RouterInput): V2Step {
  const pool = buildCandidatePool(input.selectedProjectIds, input.projects);
  const clusters = pool.clusterIds.map(
    (id) => input.clusters.find((cluster) => cluster.id === id) ?? fail(`unknown cluster "${id}"`),
  );
  const rankable: ProgramId[] = [...pool.programIds];
  const evidence: V2ScoredAnswer[] = [];
  const realityEvidence: V2RealityAnswer[] = [];
  const asked: string[] = [];
  /** Generic cluster questions answered, for carry-over into a precision module. */
  const answeredClusterQuestions: Array<{ question: V2Question; answerId: string }> = [];
  let cursor = 0;
  let resolution: V2GenericOutcome | null = null;
  let completionReason: V2CompletionReason | null = null;

  const state = (precision: V2PrecisionState | null = null): V2State => {
    const counts = tally(rankable, evidence);
    const ranking = rankPrograms(rankable, counts);
    return {
      selectedProjectIds: pool.projectIds,
      activeClusterIds: pool.clusterIds,
      candidatePoolProgramIds: pool.programIds,
      surfacedProgramIds: rankable.filter((id) => !pool.programIds.includes(id)),
      rankableProgramIds: [...rankable],
      scores: counts.scores,
      support: counts.support,
      ranking,
      shortlist: shortlist(ranking),
      scoredAnswerCount: evidence.length,
      evidence: [...evidence],
      realityEvidence: [...realityEvidence],
      askedQuestionIds: [...asked],
      resolution,
      precision,
    };
  };

  /** Consume the recorded answer for `questionId`, or return null if the candidate has not answered it yet. */
  const take = (questionId: string, options: readonly V2AnswerOption[]): V2AnswerOption | null => {
    const recorded = input.answers[cursor];
    if (!recorded) return null;
    if (recorded.questionId !== questionId) {
      fail(`answer ${cursor + 1} is for "${recorded.questionId}" but the V2 flow asked "${questionId}"`);
    }
    const option = options.find((candidate) => candidate.id === recorded.answerId);
    if (!option) fail(`"${recorded.answerId}" is not an option of "${questionId}"`);
    cursor += 1;
    asked.push(questionId);
    return option!;
  };

  const score = (
    questionId: string,
    option: V2AnswerOption,
    kind: "scenario" | "focus" | "tiebreaker",
    source: V2QuestionSource,
  ) => {
    evidence.push({
      questionId,
      answerId: option.id,
      source,
      weightClass: kind,
      weight: V2_WEIGHTS[kind],
      programIds: option.programIds,
    });
    // An answer that points outside the pool surfaces that program: expressed evidence, never a prior (DEC-022).
    for (const programId of option.programIds) if (!rankable.includes(programId)) rankable.push(programId);
  };

  const noMoreAnswers = () => {
    if (cursor < input.answers.length)
      fail(`received ${input.answers.length} answers but the flow stopped after ${cursor}`);
  };

  const nextProjectScenario = (): { cluster: V2Cluster; question: V2Question } | null => {
    for (const projectId of pool.projectIds) {
      const project = input.projects.find((candidate) => candidate.id === projectId)!;
      const cluster = clusters.find((candidate) => candidate.id === project.clusterId)!;
      for (const question of byPosition(cluster.questions)) {
        if (question.kind === "scenario" && question.projectIds?.includes(projectId) && !asked.includes(question.id)) {
          return { cluster, question };
        }
      }
    }
    return null;
  };

  const findHandoff = (scenariosDone: boolean, contenders: readonly ProgramId[]) => {
    for (const candidate of input.precisionModules) {
      const inPlay = candidate.programIds.filter((id) => rankable.includes(id));
      if (inPlay.length < candidate.minPrograms) continue;
      const everythingInModule = rankable.every((id) => candidate.programIds.includes(id));
      const evidenceInModule =
        scenariosDone && contenders.length > 0 && contenders.every((id) => candidate.programIds.includes(id));
      if (everythingInModule || evidenceInModule) return { adapter: candidate, programIds: inPlay };
    }
    return null;
  };

  const runPrecision = (adapter: PrecisionModuleAdapter, programIds: readonly ProgramId[]): V2Step => {
    const candidates: RecordedAnswer[] = answeredClusterQuestions
      .filter(({ question }) => question.reuses?.moduleId === adapter.id)
      .map(({ question, answerId }) => ({ questionId: question.reuses!.questionId, answerId }));
    // Carry the longest prefix the module accepts as its own opening answers.
    let carried: RecordedAnswer[] = [];
    for (let length = candidates.length; length > 0; length -= 1) {
      try {
        adapter.next(programIds, candidates.slice(0, length));
        carried = candidates.slice(0, length);
        break;
      } catch {
        // not a valid prefix for the module; try a shorter one
      }
    }
    const after = input.answers.slice(cursor);
    for (const answer of after) {
      if (!adapter.ownsQuestion(answer.questionId)) {
        fail(`"${answer.questionId}" was answered after handoff to "${adapter.id}", which does not ask it`);
      }
    }
    const moduleAnswers = [...carried, ...after];
    const precision: V2PrecisionState = { moduleId: adapter.id, programIds, carriedAnswers: carried, moduleAnswers };
    const step = adapter.next(programIds, moduleAnswers);
    if (step.status === "ask") {
      return {
        status: "ask",
        mode: "precision",
        moduleId: adapter.id,
        question: step.question,
        questionNumber: step.questionNumber,
        state: state(precision),
      };
    }
    return {
      status: "complete",
      mode: "complete",
      outcome: {
        kind: "precision",
        moduleId: adapter.id,
        result: step.result,
        stopReason: step.stopReason,
        questionsAsked: step.questionsAsked,
        tieBreakerUsed: step.tieBreakerUsed,
      },
      completionReason: "precision_complete",
      state: state(precision),
    };
  };

  for (let guard = 0; guard < MAX_STEPS; guard += 1) {
    const ranking = rankPrograms(rankable, tally(rankable, evidence));
    const contenders = shortlist(ranking);
    const scenario = nextProjectScenario();

    // 1. Precision handoff.
    const handoff = findHandoff(scenario === null, contenders);
    if (handoff) return runPrecision(handoff.adapter, handoff.programIds);

    // 2. Opening scenario of each selected project.
    if (scenario) {
      const option = take(scenario.question.id, scenario.question.options);
      if (!option) {
        const question: V2AskedQuestion = {
          source: "cluster",
          clusterId: scenario.cluster.id,
          question: scenario.question,
        };
        return { status: "ask", mode: "generic", reason: "project_scenario", question, state: state() };
      }
      score(scenario.question.id, option, "scenario", { type: "cluster", clusterId: scenario.cluster.id });
      answeredClusterQuestions.push({ question: scenario.question, answerId: option.id });
      continue;
    }

    // 3. Resolution.
    if (!resolution) {
      const leader = clearLeader(ranking, evidence.length);
      if (leader) {
        resolution = { kind: "recommended", programId: leader };
        completionReason = "clear_leader";
      } else if (evidence.length >= V2_MAX_GENERIC_SCORED_ANSWERS) {
        resolution = resolveAtCeiling(ranking, evidence.length);
        completionReason =
          resolution.kind === "recommended"
            ? "clear_leader"
            : resolution.kind === "near_tie"
              ? "ceiling_near_tie"
              : "ceiling_insufficient_evidence";
      }
    }

    // 4. Reality checks for the resolved program(s), then complete.
    if (resolution) {
      const resolved =
        resolution.kind === "recommended"
          ? [resolution.programId]
          : resolution.kind === "near_tie"
            ? resolution.programIds
            : [];
      const reality = clusters
        .flatMap((cluster) => byPosition(cluster.questions).map((question) => ({ cluster, question })))
        .find(
          ({ cluster, question }) =>
            question.kind === "reality_check" &&
            !asked.includes(question.id) &&
            cluster.programIds.some((programId) => resolved.includes(programId)),
        );
      if (reality) {
        const option = take(reality.question.id, reality.question.options);
        if (!option) {
          const question: V2AskedQuestion = {
            source: "cluster",
            clusterId: reality.cluster.id,
            question: reality.question,
          };
          return { status: "ask", mode: "generic", reason: "reality_check", question, state: state() };
        }
        realityEvidence.push({
          questionId: reality.question.id,
          answerId: option.id,
          clusterId: reality.cluster.id,
          realityLevel: option.realityLevel!,
        });
        continue;
      }
      noMoreAnswers();
      return {
        status: "complete",
        mode: "complete",
        outcome: resolution,
        completionReason: completionReason!,
        state: state(),
      };
    }

    // 5. Next focus question.
    const leader = ranking[0]?.programId;
    const runnerUp = ranking[1]?.programId;
    if (leader === undefined) fail("no rankable program");
    const authored = clusters
      .flatMap((cluster) => byPosition(cluster.questions).map((question) => ({ cluster, question })))
      .find(
        ({ question }) =>
          !asked.includes(question.id) &&
          question.kind !== "reality_check" &&
          question.projectIds === null &&
          question.reuses === null &&
          (question.kind !== "tiebreaker" || evidence.length >= V2_MIN_SCORED_ANSWERS_FOR_CLEAR) &&
          separatesLeaders(question, leader!, runnerUp),
      );
    if (authored) {
      const option = take(authored.question.id, authored.question.options);
      if (!option) {
        const question: V2AskedQuestion = {
          source: "cluster",
          clusterId: authored.cluster.id,
          question: authored.question,
        };
        return { status: "ask", mode: "generic", reason: "separates_leaders", question, state: state() };
      }
      score(authored.question.id, option, authored.question.kind as "scenario" | "focus" | "tiebreaker", {
        type: "cluster",
        clusterId: authored.cluster.id,
      });
      answeredClusterQuestions.push({ question: authored.question, answerId: option.id });
      continue;
    }

    const headToHead =
      runnerUp === undefined ? null : buildHeadToHead([leader!, runnerUp], asked, input.workStatements);
    if (!headToHead) {
      noMoreAnswers();
      const programIds = runnerUp === undefined ? [leader!] : [...[leader!, runnerUp]].sort();
      return { status: "needs_focus_content", mode: "generic", programIds, state: state() };
    }
    const option = take(headToHead.id, headToHead.options);
    if (!option) {
      return {
        status: "ask",
        mode: "generic",
        reason: "head_to_head",
        question: { source: "head_to_head", question: headToHead },
        state: state(),
      };
    }
    score(headToHead.id, option, "focus", { type: "head_to_head", programIds: headToHead.programIds });
  }
  return fail("the V2 flow did not terminate");
}

function fail(message: string): never {
  throw new Error(`V2 router: ${message}`);
}
