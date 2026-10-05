import type { ProgramId } from "@/engine";
import { ALL_PILOT, alternatingPolicy, CS, DS, MIS, preferencePolicy, type AnswerPolicy } from "./fixtures";

/**
 * Validation / sanity cases run through the REAL adaptive flow and question bank (THI-8).
 * Answer policies reflect each persona's described traits (docs/PERSONAS_AND_TESTS.md). They validate the
 * proposed DEC-018 thresholds; they were not used to tune them.
 */
export interface SanityCase {
  id: string;
  description: string;
  programs: ProgramId[];
  policy: () => AnswerPolicy;
}

export const SANITY_CASES: SanityCase[] = [
  {
    id: "persona_a_cs",
    description: "Persona A: enjoys coding and math, wants to build software, low business interest",
    programs: ALL_PILOT,
    policy: () => preferencePolicy(["A", "A", "5"], ["cs", "ds", "mis"]),
  },
  {
    id: "persona_b_ds",
    description: "Persona B: numbers/statistics, behaviour through data, comfortable coding, prediction",
    programs: ALL_PILOT,
    policy: () => preferencePolicy(["B", "B", "4"], ["ds", "cs", "mis"]),
  },
  {
    id: "persona_c_mis",
    description: "Persona C: technology + data, product/business, collaboration, connect tech and business",
    programs: ALL_PILOT,
    policy: () => preferencePolicy(["C", "C", "3"], ["mis", "ds", "cs"]),
  },
  {
    id: "persona_d_no_fit",
    description:
      "Persona D: explicitly finds the offered technical/data directions unattractive ('neither'), minimal math",
    programs: ALL_PILOT,
    policy: () => preferencePolicy(["C", "C", "1"], ["neither", "mis", "ds", "cs"]),
  },
  {
    id: "persona_d_prime_mis",
    description: "D′: people-oriented, low math, but repeatedly chooses MIS-style answers — a legitimate MIS fit",
    programs: ALL_PILOT,
    policy: () => preferencePolicy(["C", "C", "1"], ["mis", "ds", "cs"]),
  },
  {
    id: "low_math_cs",
    description: "Persona A's interests with the lowest math self-rating",
    programs: ALL_PILOT,
    policy: () => preferencePolicy(["A", "A", "1"], ["cs", "ds", "mis"]),
  },
  {
    id: "low_math_ds",
    description: "Persona B's interests with the lowest math self-rating",
    programs: ALL_PILOT,
    policy: () => preferencePolicy(["B", "B", "1"], ["ds", "cs", "mis"]),
  },
  {
    id: "mixed_cs_ds",
    description: "Mixed: builder on Q1, discoverer on Q2, alternates CS/DS answers (CS+DS selected)",
    programs: [CS, DS],
    policy: () => alternatingPolicy(["A", "B", "4"], ["cs", "ds"]),
  },
  {
    id: "mixed_three_way",
    description: "Mixed: a different direction on each opening question, neutral math, alternating pair answers",
    programs: ALL_PILOT,
    policy: () => alternatingPolicy(["A", "C", "3"], ["mis", "cs", "ds"]),
  },
  {
    id: "weak_profile",
    description: "Weak: opening answers point different ways, then 'neither' wherever offered",
    programs: ALL_PILOT,
    policy: () => preferencePolicy(["C", "A", "3"], ["neither", "cs", "mis", "ds"]),
  },
  {
    id: "persona_b_cs_ds_only",
    description: "Persona B comparing only CS and DS",
    programs: [CS, DS],
    policy: () => preferencePolicy(["B", "B", "4"], ["ds", "cs"]),
  },
  {
    id: "persona_c_cs_mis_only",
    description: "Persona C comparing only CS and MIS",
    programs: [CS, MIS],
    policy: () => preferencePolicy(["C", "C", "3"], ["mis", "cs"]),
  },
];
