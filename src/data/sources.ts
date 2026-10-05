import registry from "./content/sources.json";
import { SourceRegistrySchema, type Source } from "./schema";

/** Registry of official sources cited by program facts and admissions. Validated at load. */
export const SOURCES: readonly Source[] = SourceRegistrySchema.parse(registry).sources;

export function getSource(id: string): Source | undefined {
  return SOURCES.find((source) => source.id === id);
}
