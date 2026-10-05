import type { AnsweredQuestion, ProgramId } from "@/engine";
import {
  ALL_PILOT,
  answer,
  Q1_PROJECT_CHOICE as Q1,
  Q2_DESIRED_OUTCOME as Q2,
  Q3_MATH_TOLERANCE as Q3,
  SYN_CSDS_1,
  SYN_CSDS_2,
  SYN_CSDS_3,
  SYN_CSMIS_1,
  SYN_CSMIS_2,
  SYN_DSMIS_1,
  SYN_DSMIS_2,
  SYN_LEAST_ATTRACTIVE,
} from "./fixtures";

/**
 * Validation / sanity cases (docs/PERSONAS_AND_TESTS.md plus mixed, weak, low-math, and near-tie cases).
 * Answers are chosen to reflect each persona's described traits. They validate the PROPOSED thresholds;
 * they are not used to fit them. Pair questions are SYNTHETIC (see fixtures.ts).
 */
export interface SanityCase {
  id: string;
  description: string;
  programs: ProgramId[];
  answers: AnsweredQuestion[];
}

export const SANITY_CASES: SanityCase[] = [
  {
    id: "persona_a_cs",
    description: "Persona A: enjoys coding and math, wants to build software, low business interest",
    programs: ALL_PILOT,
    answers: [
      answer(Q1, "A"),
      answer(Q2, "A"),
      answer(Q3, "5"),
      answer(SYN_CSDS_1, "cs"),
      answer(SYN_CSDS_2, "cs"),
      answer(SYN_CSDS_3, "cs"),
    ],
  },
  {
    id: "persona_b_ds",
    description: "Persona B: numbers/statistics, behaviour through data, comfortable coding, prediction",
    programs: ALL_PILOT,
    answers: [
      answer(Q1, "B"),
      answer(Q2, "B"),
      answer(Q3, "4"),
      answer(SYN_CSDS_1, "ds"),
      answer(SYN_CSDS_2, "ds"),
      answer(SYN_DSMIS_1, "ds"),
    ],
  },
  {
    id: "persona_c_mis",
    description: "Persona C: technology + data, product/business, collaboration, connect tech and business",
    programs: ALL_PILOT,
    answers: [
      answer(Q1, "C"),
      answer(Q2, "C"),
      answer(Q3, "3"),
      answer(SYN_DSMIS_1, "mis"),
      answer(SYN_DSMIS_2, "mis"),
      answer(SYN_CSMIS_1, "mis"),
    ],
  },
  {
    id: "persona_d_no_fit",
    description: "Persona D: likes the idea of AI, minimal math, no coding, no data analysis, people/creative work",
    programs: ALL_PILOT,
    answers: [
      answer(Q1, "C"),
      answer(Q2, "C"),
      answer(Q3, "1"),
      answer(SYN_CSMIS_1, "neither"),
      answer(SYN_DSMIS_1, "neither"),
      answer(SYN_LEAST_ATTRACTIVE, "coding"),
    ],
  },
  {
    id: "low_math_cs",
    description: "Persona A's interests with the lowest math self-rating",
    programs: ALL_PILOT,
    answers: [
      answer(Q1, "A"),
      answer(Q2, "A"),
      answer(Q3, "1"),
      answer(SYN_CSDS_1, "cs"),
      answer(SYN_CSDS_2, "cs"),
      answer(SYN_CSDS_3, "cs"),
    ],
  },
  {
    id: "low_math_ds",
    description: "Persona B's interests with the lowest math self-rating",
    programs: ALL_PILOT,
    answers: [
      answer(Q1, "B"),
      answer(Q2, "B"),
      answer(Q3, "1"),
      answer(SYN_CSDS_1, "ds"),
      answer(SYN_CSDS_2, "ds"),
      answer(SYN_DSMIS_1, "ds"),
    ],
  },
  {
    id: "mixed_cs_ds",
    description: "Mixed: builder on Q1, discoverer on Q2, splits the CS/DS pair questions",
    programs: ["computer_science", "data_science"],
    answers: [
      answer(Q1, "A"),
      answer(Q2, "B"),
      answer(Q3, "4"),
      answer(SYN_CSDS_1, "cs"),
      answer(SYN_CSDS_2, "ds"),
      answer(SYN_CSDS_3, "cs"),
    ],
  },
  {
    id: "mixed_three_way",
    description: "Mixed: a different direction on each opening question, neutral math, split pair answers",
    programs: ALL_PILOT,
    answers: [
      answer(Q1, "A"),
      answer(Q2, "C"),
      answer(Q3, "3"),
      answer(SYN_CSMIS_1, "mis"),
      answer(SYN_CSMIS_2, "cs"),
      answer(SYN_DSMIS_1, "ds"),
    ],
  },
  {
    id: "weak_profile",
    description: "Weak: opening answers point different ways, then 'neither' on every pair question",
    programs: ALL_PILOT,
    answers: [
      answer(Q1, "C"),
      answer(Q2, "A"),
      answer(Q3, "3"),
      answer(SYN_CSDS_1, "neither"),
      answer(SYN_CSMIS_1, "neither"),
      answer(SYN_DSMIS_1, "neither"),
    ],
  },
  {
    id: "mirrored_cs_ds",
    description:
      "Mirrored CS/DS answers (A then B; cs then ds) with math 4: math signals favour DS's higher math/statistics emphasis, so this leans DS rather than tying",
    programs: ["computer_science", "data_science"],
    answers: [answer(Q1, "A"), answer(Q2, "B"), answer(Q3, "4"), answer(SYN_CSDS_1, "cs"), answer(SYN_CSDS_2, "ds")],
  },
];
