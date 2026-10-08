import { z } from "zod";
import {
  PRECISION_MODULE_IDS,
  type CareerProject,
  type PrecisionModuleId,
  type ProgramId,
  type V2Cluster,
  type V2Question,
} from "@/engine";
import { V2_PROGRAM_IDS } from "./catalog";
import worldsRaw from "./content/discovery/v3_worlds.json";
import { V2_CLUSTERS, type V2QuestionCopy } from "./discovery";
import { QUESTION_BANK } from "./questions";

/**
 * V3 WORLD-LED discovery data (DEC-034), validated at load. A "world" is a type of working environment (a product
 * team, a school, an HR department...), not a company. It plays exactly the role a V2 career project plays for the
 * engine, and nothing more:
 *  - it is ROUTING ONLY: it builds the candidate pool (core + adjacent programs) and opens its own first scenario; the
 *    selection itself scores nothing;
 *  - everything after that scenario is the UNCHANGED V2 engine: existing authored focus/tiebreaker questions (borrowed
 *    by id from `borrow_cluster_ids`, so a question shared by two worlds is still asked at most once), engine-generated
 *    focus questions, the existing reality checks and the V1 Tech precision module.
 * This module only adapts data into the engine's existing shapes (`CareerProject`, `V2Cluster`). V2 data is not changed.
 */

const nonEmpty = z.string().trim().min(1);
const id = z.string().regex(/^[A-Za-z0-9_-]+$/);
const snakeId = z.string().regex(/^[a-z][a-z0-9_]*$/);

const WorldOptionSchema = z.strictObject({
  id,
  label_he: nonEmpty,
  program_ids: z.array(snakeId).min(1),
});

const WorldScenarioSchema = z.strictObject({
  id,
  prompt_he: nonEmpty,
  /**
   * The scenario carries its answer into a precision module as that module's own question (same option ids and the
   * same separator), so the module never asks it again. Used by the Tech world for V1 Q1, whose copy names a brand.
   */
  reuses: z.strictObject({ module: z.enum(PRECISION_MODULE_IDS), question_id: id }).optional(),
  options: z.array(WorldOptionSchema).min(2),
});

/**
 * A world's own authored follow-up (focus/tiebreaker), for a world whose programs the borrowed V2 questions do not
 * cover deeply enough (today only People/HR, where MIS would otherwise run out of separating questions).
 */
const WorldFollowUpSchema = z.strictObject({
  id,
  kind: z.enum(["focus", "tiebreaker"]),
  prompt_he: nonEmpty,
  options: z.array(z.strictObject({ id, label_he: nonEmpty, program_ids: z.array(snakeId) })).min(3),
});

const WorldSchema = z.strictObject({
  id: snakeId,
  order: z.number().int().min(1),
  enabled: z.boolean(),
  title_he: nonEmpty,
  context_he: nonEmpty,
  line_he: nonEmpty,
  core_program_ids: z.array(snakeId).min(1),
  adjacent_program_ids: z.array(snakeId),
  precision_module: z.enum(PRECISION_MODULE_IDS).nullable(),
  borrow_cluster_ids: z.array(snakeId),
  scenario: WorldScenarioSchema,
  follow_ups: z.array(WorldFollowUpSchema),
});

const ProvenanceSchema = z.strictObject({
  program_id: snakeId,
  url: z.url(),
  retrieved_at: z.iso.date(),
  validates: nonEmpty,
});

export const V3WorldsFileSchema = z.strictObject({
  version: z.literal("v3"),
  status_note: z.string(),
  opening: z.strictObject({ prompt_he: nonEmpty, helper_he: nonEmpty }),
  provenance: z.array(ProvenanceSchema),
  worlds: z.array(WorldSchema).min(1),
});

/** Candidate-facing copy of a world card. No company, no logo, no brand colour. */
export interface WorldEntry {
  id: string;
  order: number;
  enabled: boolean;
  titleHe: string;
  contextHe: string;
  lineHe: string;
  coreProgramIds: readonly ProgramId[];
  adjacentProgramIds: readonly ProgramId[];
  scenarioId: string;
}

export interface WorldData {
  worlds: readonly WorldEntry[];
  clusters: readonly V2Cluster[];
  questionCopy: ReadonlyMap<string, V2QuestionCopy>;
  opening: { prompt: string; helper: string };
  provenance: ReadonlyArray<{ programId: ProgramId; url: string; retrievedAt: string; validates: string }>;
}

export const worldClusterId = (worldId: string) => `world_${worldId}`;

const fail = (message: string): never => {
  throw new Error(`Invalid V3 worlds: ${message}`);
};

/**
 * Validate the world file and adapt it to engine clusters. Exported for tests.
 * Each world becomes one cluster: its opening scenario (position 1, applicable to that world only) followed by the
 * borrowed V2 focus/tiebreaker questions, same ids and options, in the borrowed clusters' order.
 */
export function buildWorlds(
  input: unknown,
  v2Clusters: readonly V2Cluster[] = V2_CLUSTERS,
  programIds: readonly ProgramId[] = V2_PROGRAM_IDS,
  reservedQuestionIds: readonly string[] = [
    ...QUESTION_BANK.questions.map((question) => question.id),
    ...V2_CLUSTERS.flatMap((cluster) => cluster.questions.map((question) => question.id)),
  ],
): WorldData {
  const file = V3WorldsFileSchema.parse(input);
  const known = new Set(programIds);
  const worldIds = file.worlds.map((world) => world.id);
  if (new Set(worldIds).size !== worldIds.length) fail("duplicate world ids");
  const orders = file.worlds.map((world) => world.order);
  if (new Set(orders).size !== orders.length) fail("duplicate world display order");

  const questionCopy = new Map<string, V2QuestionCopy>();
  const scenarioIds = new Set<string>();
  const worlds: WorldEntry[] = [];
  const clusters: V2Cluster[] = [];

  for (const world of [...file.worlds].sort((a, b) => a.order - b.order)) {
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
        // An opening scenario stays inside its own world: it only separates the programs the world brought in.
        if (!pool.includes(programId)) fail(`${world.id}/${option.id}: "${programId}" is not in the world's pool`);
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
      if (world.precision_module !== scenario.reuses.module) fail(`${world.id}: reuse must target the world's module`);
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

    // The world's own follow-ups come first, then the borrowed questions.
    const own: V2Question[] = world.follow_ups.map((followUp, index) => {
      if (scenarioIds.has(followUp.id) || reservedQuestionIds.includes(followUp.id)) {
        fail(`${world.id}: follow-up id "${followUp.id}" collides with another question`);
      }
      scenarioIds.add(followUp.id);
      for (const option of followUp.options) {
        for (const programId of option.program_ids) {
          if (!pool.includes(programId)) fail(`${world.id}/${followUp.id}: "${programId}" is not in the world's pool`);
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

    // Borrowed questions: existing authored focus/tiebreaker questions only (never another world's or brand's opener,
    // never a reality check: the engine finds those across all clusters by explicit applicability).
    const borrowed: V2Question[] = [];
    for (const clusterId of world.borrow_cluster_ids) {
      const source = v2Clusters.find((cluster) => cluster.id === clusterId);
      if (!source) fail(`${world.id}: unknown borrowed cluster "${clusterId}"`);
      for (const question of [...source!.questions].sort((a, b) => a.position - b.position)) {
        if (question.kind === "scenario" || question.kind === "reality_check") continue;
        if (question.projectIds !== null || question.reuses !== null) continue;
        if (borrowed.some((existing) => existing.id === question.id)) continue;
        borrowed.push({ ...question, position: own.length + borrowed.length + 2 });
      }
    }

    clusters.push({
      id: worldClusterId(world.id),
      programIds: world.core_program_ids,
      adjacentProgramIds: world.adjacent_program_ids,
      precisionModule: world.precision_module,
      maxQuestions: own.length + borrowed.length + 1,
      questions: [opening, ...own, ...borrowed],
    });
    worlds.push({
      id: world.id,
      order: world.order,
      enabled: world.enabled,
      titleHe: world.title_he,
      contextHe: world.context_he,
      lineHe: world.line_he,
      coreProgramIds: world.core_program_ids,
      adjacentProgramIds: world.adjacent_program_ids,
      scenarioId: scenario.id,
    });
  }

  return {
    worlds,
    clusters,
    questionCopy,
    opening: { prompt: file.opening.prompt_he, helper: file.opening.helper_he },
    provenance: file.provenance.map((entry) => ({
      programId: entry.program_id,
      url: entry.url,
      retrievedAt: entry.retrieved_at,
      validates: entry.validates,
    })),
  };
}

const WORLD_DATA = buildWorlds(worldsRaw);

/** The V3 worlds, in display order. */
export const V3_WORLDS: readonly WorldEntry[] = WORLD_DATA.worlds;
/** One engine cluster per world (opening scenario + borrowed V2 questions). */
export const V3_WORLD_CLUSTERS: readonly V2Cluster[] = WORLD_DATA.clusters;
export const V3_WORLD_OPENING = WORLD_DATA.opening;
export const V3_WORLD_PROVENANCE = WORLD_DATA.provenance;

export function getWorld(worldId: string): WorldEntry | undefined {
  return V3_WORLDS.find((world) => world.id === worldId);
}

/** Copy of a world's opening scenario. */
export function getWorldQuestionCopy(questionId: string): V2QuestionCopy | undefined {
  return WORLD_DATA.questionCopy.get(questionId);
}

/**
 * The worlds as the engine's routing entries, for one selection. The selected worlds come first IN SELECTION ORDER
 * (the candidate's own order decides which opening scenario is asked first; it gives no points), then the rest in
 * display order. Being in the pool is never a score.
 */
export function worldsAsRoutingEntries(selectedWorldIds: readonly string[]): CareerProject[] {
  const position = (worldId: string) => {
    const index = selectedWorldIds.indexOf(worldId);
    return index >= 0 ? index + 1 : selectedWorldIds.length + (getWorld(worldId)?.order ?? 0);
  };
  return V3_WORLDS.map((world) => ({
    id: world.id,
    order: position(world.id),
    enabled: world.enabled,
    clusterId: worldClusterId(world.id),
    candidateProgramIds: [...world.coreProgramIds, ...world.adjacentProgramIds],
  }));
}
