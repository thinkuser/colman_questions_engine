import { getProgramInputs, getRealityCheckInputs } from "@/data";
import {
  mathToleranceSignal,
  type AnsweredQuestion,
  type FitInput,
  type ProgramId,
  type QuestionDefinition,
} from "@/engine";

/**
 * Test fixtures for the THI-7 scoring engine.
 *
 * DOCUMENTED: Q1 and Q2 signals are copied from docs/QUESTION_ENGINE.md. The Q3 mapping
 * `math_affinity = answer − 3` with the self_rating weight is DEC-020.
 *
 * SYNTHETIC: every pair question (CSDS / CSMIS / DSMIS), every "neither" option, and the "least attractive"
 * question are ASSUMED signals for engine validation only. They are not the final question bank, which
 * THI-8 defines. Thresholds validated against them are provisional (DEC-018).
 */

// ── Documented opening questions ────────────────────────────────────────────────────────────────

export const Q1_PROJECT_CHOICE: QuestionDefinition = {
  id: "Q1",
  type: "scenario",
  options: [
    { id: "A", signals: { software_building: 2, coding_depth: 1, abstract_problem_solving: 1 } },
    { id: "B", signals: { data_modeling: 2, statistical_thinking: 1, math_affinity: 0.5 } },
    { id: "C", signals: { business_context: 1.5, systems_process: 1.5, bridge_role: 2 } },
  ],
};

export const Q2_DESIRED_OUTCOME: QuestionDefinition = {
  id: "Q2",
  type: "tradeoff",
  options: [
    { id: "A", signals: { software_building: 2, coding_depth: 1 } },
    { id: "B", signals: { data_modeling: 2, statistical_thinking: 1 } },
    { id: "C", signals: { business_context: 1.5, systems_process: 1.5, bridge_role: 1 } },
  ],
};

/** DEC-020: math_affinity signal = answer − 3 (1 → −2 … 5 → +2), self_rating weight 1.5. */
export const Q3_MATH_TOLERANCE: QuestionDefinition = {
  id: "Q3",
  type: "self_rating",
  options: [1, 2, 3, 4, 5].map((value) => ({
    id: String(value),
    signals: { math_affinity: mathToleranceSignal(value) },
  })),
};

// ── SYNTHETIC pair questions (assumed signals; replaced by THI-8) ───────────────────────────────

const NEITHER = { id: "neither", signals: {} };

export const SYN_CSDS_1: QuestionDefinition = {
  id: "SYN_CSDS_1",
  type: "tradeoff",
  options: [
    { id: "cs", signals: { abstract_problem_solving: 2, coding_depth: 1 } },
    { id: "ds", signals: { data_modeling: 2, statistical_thinking: 1 } },
    NEITHER,
  ],
};

export const SYN_CSDS_2: QuestionDefinition = {
  id: "SYN_CSDS_2",
  type: "scenario",
  options: [
    { id: "cs", signals: { software_building: 2, coding_depth: 1 } },
    { id: "ds", signals: { data_modeling: 2, statistical_thinking: 1 } },
    NEITHER,
  ],
};

export const SYN_CSDS_3: QuestionDefinition = {
  id: "SYN_CSDS_3",
  type: "preference",
  options: [
    { id: "cs", signals: { abstract_problem_solving: 1, coding_depth: 1, software_building: 1 } },
    { id: "ds", signals: { statistical_thinking: 1.5, data_modeling: 1.5 } },
    NEITHER,
  ],
};

export const SYN_CSMIS_1: QuestionDefinition = {
  id: "SYN_CSMIS_1",
  type: "tradeoff",
  options: [
    { id: "cs", signals: { software_building: 2, abstract_problem_solving: 1 } },
    { id: "mis", signals: { bridge_role: 2, business_context: 1 } },
    NEITHER,
  ],
};

export const SYN_CSMIS_2: QuestionDefinition = {
  id: "SYN_CSMIS_2",
  type: "scenario",
  options: [
    { id: "cs", signals: { software_building: 2, coding_depth: 1 } },
    { id: "mis", signals: { systems_process: 2, bridge_role: 1 } },
    NEITHER,
  ],
};

export const SYN_DSMIS_1: QuestionDefinition = {
  id: "SYN_DSMIS_1",
  type: "tradeoff",
  options: [
    { id: "ds", signals: { data_modeling: 2, statistical_thinking: 1 } },
    { id: "mis", signals: { business_context: 2, systems_process: 1 } },
    NEITHER,
  ],
};

export const SYN_DSMIS_2: QuestionDefinition = {
  id: "SYN_DSMIS_2",
  type: "scenario",
  options: [
    { id: "ds", signals: { data_modeling: 2, math_affinity: 1 } },
    { id: "mis", signals: { bridge_role: 2, business_context: 1 } },
    NEITHER,
  ],
};

/** SYNTHETIC negative-signal question ("which is least attractive?"), needed to express genuine no-fit. */
export const SYN_LEAST_ATTRACTIVE: QuestionDefinition = {
  id: "SYN_LEAST_ATTRACTIVE",
  type: "preference",
  options: [
    { id: "coding", signals: { coding_depth: -2, software_building: -1 } },
    { id: "math", signals: { math_affinity: -2 } },
    { id: "data", signals: { data_modeling: -2, statistical_thinking: -1 } },
    { id: "business", signals: { business_context: -2, systems_process: -1 } },
  ],
};

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────

export const answer = (question: QuestionDefinition, answerId: string): AnsweredQuestion => ({ question, answerId });

export const ALL_PILOT: ProgramId[] = ["computer_science", "data_science", "management_information_systems"];

/** Fit input using the real documented program vectors and reality checks from the data layer. */
export function fitInput(answers: AnsweredQuestion[], programs: ProgramId[] = ALL_PILOT): FitInput {
  return { programs: getProgramInputs(programs), answers, realityChecks: getRealityCheckInputs(programs) };
}
