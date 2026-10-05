import { describe, expect, it } from "vitest";
import { getFitProfile, OfficialFactSchema, ProgramFitProfileSchema, SourceSchema } from "@/data";

const validProfile = getFitProfile("data_science")!;

describe("schema validation", () => {
  it("accepts the seeded fit profile", () => {
    expect(ProgramFitProfileSchema.safeParse(validProfile).success).toBe(true);
  });

  it("rejects a vector with a missing dimension", () => {
    const dimensions: Partial<typeof validProfile.dimensions> = { ...validProfile.dimensions };
    delete dimensions.bridge_role;
    expect(ProgramFitProfileSchema.safeParse({ ...validProfile, dimensions }).success).toBe(false);
  });

  it("rejects an undocumented dimension", () => {
    const dimensions = { ...validProfile.dimensions, likes_technology: 3 };
    expect(ProgramFitProfileSchema.safeParse({ ...validProfile, dimensions }).success).toBe(false);
  });

  it.each([0, 6, 2.5])("rejects a dimension score of %s (scale is integer 1–5)", (score) => {
    const dimensions = { ...validProfile.dimensions, data_modeling: score };
    expect(ProgramFitProfileSchema.safeParse({ ...validProfile, dimensions }).success).toBe(false);
  });

  it("rejects sources outside the official COLMAN properties", () => {
    const source = { id: "blog", url: "https://example.com/cs", title_he: "x", retrieved_at: "2026-10-05" };
    expect(SourceSchema.safeParse(source).success).toBe(false);
    expect(SourceSchema.safeParse({ ...source, url: "https://www.colman.ac.il/x/" }).success).toBe(true);
  });

  it("rejects an official fact without a source", () => {
    expect(OfficialFactSchema.safeParse({ text_he: "מדעי המחשב", source_ids: [] }).success).toBe(false);
  });
});
