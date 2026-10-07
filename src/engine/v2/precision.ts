import {
  nextAdaptiveStep,
  type AdaptivePhase,
  type BankQuestion,
  type QuestionBank,
  type StopReason,
} from "../adaptive";
import type { PrecisionModuleId } from "../discovery";
import type { FitResult, ProgramId, ProgramInput, RealityCheckInput, RecordedAnswer } from "../types";

/**
 * Precision modules (THI-14, DEC-030): a curated engine that takes over when the V2 shortlist resolves into the programs
 * it knows how to decide between. Only one exists: the V1 CS / DS / MIS engine, wrapped unchanged.
 *
 * The router asks a module:
 * - which programs it decides between (`programIds`, `minPrograms`): eligibility;
 * - which question ids are its own (`ownsQuestion`): answers after handoff must be the module's;
 * - what comes next for the programs in play and its answers so far (`next`): ask, or complete with its own result.
 * Answers given before handoff are carried in by the router only when a V2 question `reuses` a module question.
 */

export type PrecisionStep =
  | { status: "ask"; question: BankQuestion; questionNumber: number; phase: AdaptivePhase }
  | { status: "complete"; result: FitResult; questionsAsked: number; stopReason: StopReason; tieBreakerUsed: boolean };

export interface PrecisionModuleAdapter {
  id: PrecisionModuleId;
  /** The programs the module decides between, in the module's own canonical order. */
  programIds: readonly ProgramId[];
  /** Fewest of those programs that must be in play for a handoff. */
  minPrograms: number;
  ownsQuestion(questionId: string): boolean;
  /** Throws if `answers` do not match the questions the module would ask (same contract as V1 replay). */
  next(programIds: readonly ProgramId[], answers: readonly RecordedAnswer[]): PrecisionStep;
}

export interface V1TechModuleDependencies {
  bank: QuestionBank;
  /** The V1 pilot programs in V1's canonical order. */
  programIds: readonly ProgramId[];
  programInputs(ids: readonly ProgramId[]): ProgramInput[];
  realityChecks(ids: readonly ProgramId[]): RealityCheckInput[];
}

/** The preserved V1 tech engine as a precision module. V1 scoring, routing and thresholds are untouched. */
export function createV1TechPrecisionModule(deps: V1TechModuleDependencies): PrecisionModuleAdapter {
  const owned = new Set(deps.bank.questions.map((question) => question.id));
  return {
    id: "v1_tech",
    programIds: deps.programIds,
    minPrograms: 2,
    ownsQuestion: (questionId) => owned.has(questionId),
    next(programIds, answers) {
      const step = nextAdaptiveStep({
        programs: deps.programInputs(programIds),
        realityChecks: deps.realityChecks(programIds),
        bank: deps.bank,
        answers,
      });
      if (step.status === "ask") {
        return { status: "ask", question: step.question, questionNumber: step.questionNumber, phase: step.phase };
      }
      return {
        status: "complete",
        result: step.result,
        questionsAsked: step.questionsAsked,
        stopReason: step.stopReason,
        tieBreakerUsed: step.tieBreakerUsed,
      };
    },
  };
}
