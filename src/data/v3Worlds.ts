import { z } from "zod";
import { PRECISION_MODULE_IDS, type CareerProject, type ProgramId, type V2Cluster } from "@/engine";
import { V2_PROGRAM_IDS } from "./catalog";
import worldsRaw from "./content/discovery/v3_worlds.json";
import { V2_CLUSTERS, type V2QuestionCopy } from "./discovery";
import { adaptDoors, DoorFollowUpSchema, DoorScenarioSchema, nonEmpty, snakeId } from "./discoveryDoors";
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
 * The adaptation itself is the shared door adapter (`discoveryDoors.ts`), also used by the V5 projects (DEC-037).
 */

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
  scenario: DoorScenarioSchema,
  follow_ups: z.array(DoorFollowUpSchema),
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
  const sorted = [...file.worlds].sort((a, b) => a.order - b.order);
  const { clusters, questionCopy } = adaptDoors(sorted, {
    borrowable: v2Clusters,
    programIds,
    reservedQuestionIds,
    clusterId: worldClusterId,
    fail,
  });
  const worlds: WorldEntry[] = sorted.map((world) => ({
    id: world.id,
    order: world.order,
    enabled: world.enabled,
    titleHe: world.title_he,
    contextHe: world.context_he,
    lineHe: world.line_he,
    coreProgramIds: world.core_program_ids,
    adjacentProgramIds: world.adjacent_program_ids,
    scenarioId: world.scenario.id,
  }));

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
