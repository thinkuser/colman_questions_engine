/**
 * Deterministic fit engine — pure, framework-free functions only.
 * The engine decides fit; an LLM may only explain the result (DEC-003). See docs/SCORING.md.
 */
export * from "./adaptive";
export * from "./computeFit";
export * from "./discovery";
export * from "./constants";
export * from "./dimensions";
export * from "./explain";
export * from "./scoring";
export * from "./types";
