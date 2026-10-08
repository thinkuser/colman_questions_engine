import { z } from "zod";
import {
  PRECISION_MODULE_IDS,
  type PrecisionModuleId,
  type ProgramId,
  type V2Cluster,
  type V2Question,
} from "@/engine";
import type { V2QuestionCopy } from "./discovery";
import { QUESTION_BANK } from "./questions";

/**
 * Discovery "doors" (DEC-034, DEC-037): an opening choice that is ROUTING ONLY. A door builds the candidate pool (core +
 * adjacent programs) and opens its own first scenario; the selection itself scores nothing. Everything after that
 * scenario is the unchanged engine: the door's own authored follow-ups, existing authored focus/tiebreaker questions
 * borrowed by id, engine-generated focus questions, the existing reality checks and the V1 Tech precision module.
 *
 * V3 working worlds and V5 balanced projects are both doors. This module holds their shared validation and their
 * adaptation into the engine's existing shapes (`V2Cluster`); it was extracted unchanged from the V3 world builder.
 */

export const nonEmpty = z.string().trim().min(1);
export const questionId = z.string().regex(/^[A-Za-z0-9_-]+$/);
export const snakeId = z.string().regex(/^[a-z][a-z0-9_]*$/);

export const DoorOptionSchema = z.strictObject({
  id: questionId,
  label_he: nonEmpty,
  program_ids: z.array(snakeId).min(1),
});

export const DoorScenarioSchema = z.strictObject({
  id: questionId,
  prompt_he: nonEmpty,
  /**
   * The scenario carries its answer into a precision module as that module's own question (same option ids and the
   * same separator), so the module never asks it again. Used for V1 Q1, whose copy names a brand.
   */
  reuses: z.strictObject({ module: z.enum(PRECISION_MODULE_IDS), question_id: questionId }).optional(),
  options: z.array(DoorOptionSchema).min(2),
});

/**
 * A door's own authored follow-up (focus/tiebreaker), for a door whose programs the borrowed V2 questions do not cover
 * deeply enough (today only People/HR, where MIS would otherwise run out of separating questions).
 */
export const DoorFollowUpSchema = z.strictObject({
  id: questionId,
  kind: z.enum(["focus", "tiebreaker"]),
  prompt_he: nonEmpty,
  options: z.array(z.strictObject({ id: questionId, label_he: nonEmpty, program_ids: z.array(snakeId) })).min(3),
});

/** The routing part of a door (what the engine needs), shared by worlds and V5 projects. */
export interface DoorDefinition {
  id: string;
  order: number;
  core_program_ids: string[];
  adjacent_program_ids: string[];
  precision_module: PrecisionModuleId | null;
  borrow_cluster_ids: string[];
  scenario: z.infer<typeof DoorScenarioSchema>;
  follow_ups: Array<z.infer<typeof DoorFollowUpSchema>>;
}

export interface DoorAdaptationOptions {
  /** Clusters whose authored focus/tiebreaker questions a door may borrow (by cluster id). */
  borrowable: readonly V2Cluster[];
  programIds: readonly ProgramId[];
  /** Question ids already used elsewhere: a door's scenario and follow-ups must not collide with them. */
  reservedQuestionIds: readonly string[];
  clusterId: (doorId: string) => string;
  fail: (message: string) => never;
  /** What a door is called in validation messages ("world" for V3). */
  noun?: string;
}

export interface DoorAdaptation {
  /** One cluster per door, in the doors' display order. */
  clusters: V2Cluster[];
  questionCopy: Map<string, V2QuestionCopy>;
}

/**
 * Validate the doors and adapt each into one engine cluster: its opening scenario (position 1, applicable to that door
 * only), then its own follow-ups, then the borrowed questions (same ids and options, in the borrowed clusters' order).
 * `doors` must already be in display order.
 */
export function adaptDoors(doors: readonly DoorDefinition[], options: DoorAdaptationOptions): DoorAdaptation {
  const { borrowable, programIds, reservedQuestionIds, clusterId, fail, noun = "world" } = options;
  const known = new Set(programIds);
  const doorIds = doors.map((door) => door.id);
  if (new Set(doorIds).size !== doorIds.length) fail(`duplicate ${noun} ids`);
  const orders = doors.map((door) => door.order);
  if (new Set(orders).size !== orders.length) fail(`duplicate ${noun} display order`);

  const questionCopy = new Map<string, V2QuestionCopy>();
  const scenarioIds = new Set<string>();
  const clusters: V2Cluster[] = [];

  for (const world of doors) {
    const pool = [...world.core_program_ids, ...world.adjacent_program_ids];
    for (const programId of pool) if (!known.has(programId)) fail(`${world.id}: unknown program "${programId}"`);
    if (new Set(pool).size !== pool.length) fail(`${world.id}: a program is both core and adjacent`);

    const scenario = world.scenario;
    if (scenarioIds.has(scenario.id) || reservedQuestionIds.includes(scenario.id)) {
      fail(`${world.id}: scenario id "${scenario.id}" collides with another question`);
    }
    scenarioIds.add(scenario.id);
    const optionIds = scenario.options.map((option) => option.id);
    if (new Set(optionIds).size !== optionIds.length) fail(`${world.id}: duplicate option ids`);
    for (const option of scenario.options) {
      for (const programId of option.program_ids) {
        // An opening scenario stays inside its own door: it only separates the programs the door brought in.
        if (!pool.includes(programId)) fail(`${world.id}/${option.id}: "${programId}" is not in the ${noun}'s pool`);
      }
    }
    for (const programId of world.core_program_ids) {
      if (!scenario.options.some((option) => option.program_ids.includes(programId))) {
        fail(`${world.id}: core program "${programId}" has no answer in the opening scenario`);
      }
    }
    if (scenario.reuses) {
      const reused = QUESTION_BANK.questions.find((question) => question.id === scenario.reuses!.question_id);
      if (!reused) fail(`${world.id}: reuses unknown module question "${scenario.reuses.question_id}"`);
      const reusedIds = reused!.options.map((option) => option.id);
      if (JSON.stringify(reusedIds) !== JSON.stringify(optionIds)) {
        fail(`${world.id}: a reusing scenario must have exactly the module question's option ids`);
      }
      if (world.precision_module !== scenario.reuses.module)
        fail(`${world.id}: reuse must target the ${noun}'s module`);
    }

    questionCopy.set(scenario.id, {
      prompt: scenario.prompt_he,
      options: scenario.options.map((option) => ({ id: option.id, label: option.label_he })),
    });

    const opening: V2Question = {
      id: scenario.id,
      position: 1,
      kind: "scenario",
      projectIds: [world.id],
      reuses: scenario.reuses
        ? { moduleId: scenario.reuses.module as PrecisionModuleId, questionId: scenario.reuses.question_id }
        : null,
      realityForProgramIds: null,
      options: scenario.options.map((option) => ({
        id: option.id,
        programIds: option.program_ids,
        realityLevel: null,
      })),
    };

    // The door's own follow-ups come first, then the borrowed questions.
    const own: V2Question[] = world.follow_ups.map((followUp, index) => {
      if (scenarioIds.has(followUp.id) || reservedQuestionIds.includes(followUp.id)) {
        fail(`${world.id}: follow-up id "${followUp.id}" collides with another question`);
      }
      scenarioIds.add(followUp.id);
      for (const option of followUp.options) {
        for (const programId of option.program_ids) {
          if (!pool.includes(programId))
            fail(`${world.id}/${followUp.id}: "${programId}" is not in the ${noun}'s pool`);
        }
      }
      const neutral = followUp.options.filter((option) => option.program_ids.length === 0);
      if (neutral.length > 1) fail(`${world.id}/${followUp.id}: at most one neutral option`);
      questionCopy.set(followUp.id, {
        prompt: followUp.prompt_he,
        options: followUp.options.map((option) => ({ id: option.id, label: option.label_he })),
      });
      return {
        id: followUp.id,
        position: index + 2,
        kind: followUp.kind,
        projectIds: null,
        reuses: null,
        realityForProgramIds: null,
        options: followUp.options.map((option) => ({
          id: option.id,
          programIds: option.program_ids,
          realityLevel: null,
        })),
      };
    });

    // Borrowed questions: existing authored focus/tiebreaker questions only (never another door's or brand's opener,
    // never a reality check: the engine finds those across all clusters by explicit applicability).
    const borrowed: V2Question[] = [];
    for (const borrowedId of world.borrow_cluster_ids) {
      const source = borrowable.find((cluster) => cluster.id === borrowedId);
      if (!source) fail(`${world.id}: unknown borrowed cluster "${borrowedId}"`);
      for (const question of [...source!.questions].sort((a, b) => a.position - b.position)) {
        if (question.kind === "scenario" || question.kind === "reality_check") continue;
        if (question.projectIds !== null || question.reuses !== null) continue;
        if (borrowed.some((existing) => existing.id === question.id)) continue;
        borrowed.push({ ...question, position: own.length + borrowed.length + 2 });
      }
    }

    clusters.push({
      id: clusterId(world.id),
      programIds: world.core_program_ids,
      adjacentProgramIds: world.adjacent_program_ids,
      precisionModule: world.precision_module,
      maxQuestions: own.length + borrowed.length + 1,
      questions: [opening, ...own, ...borrowed],
    });
  }

  return { clusters, questionCopy };
}
