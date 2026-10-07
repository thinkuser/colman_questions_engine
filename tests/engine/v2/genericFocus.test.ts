import { describe, expect, it } from "vitest";
import { buildGenericFocus, genericFocusId, evidenceLeadingSet, type V2RankedProgram } from "@/engine";

const row = (programId: string, score: number, support: number, rank: number): V2RankedProgram => ({
  programId,
  score,
  support,
  rank,
});

describe("evidenceLeadingSet", () => {
  it("is the whole top-rank group when two or more programs share it", () => {
    expect(evidenceLeadingSet([row("c", 3, 1, 1), row("a", 3, 1, 1), row("b", 3, 1, 1), row("d", 0, 0, 4)])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("is the leader plus every program sharing the next rank", () => {
    expect(evidenceLeadingSet([row("z", 6, 2, 1), row("y", 3, 1, 2), row("b", 3, 1, 2), row("a", 0, 0, 4)])).toEqual([
      "b",
      "y",
      "z",
    ]);
  });

  it("is the leader alone when it is the only rankable program, and empty when there is none", () => {
    expect(evidenceLeadingSet([row("law", 3, 1, 1)])).toEqual(["law"]);
    expect(evidenceLeadingSet([])).toEqual([]);
  });

  it("ignores zero-support programs once another program has support, even when they share the next rank", () => {
    expect(evidenceLeadingSet([row("z", 6, 2, 1), row("a", 0, 0, 2), row("b", 0, 0, 2), row("c", 0, 0, 2)])).toEqual([
      "z",
    ]);
  });

  it("adds supported runners-up but never the zero-support programs behind them", () => {
    expect(evidenceLeadingSet([row("z", 6, 2, 1), row("y", 3, 1, 2), row("a", 0, 0, 3), row("b", 0, 0, 3)])).toEqual([
      "y",
      "z",
    ]);
  });

  it("invents no leader when no program has support: the whole no-evidence group", () => {
    expect(evidenceLeadingSet([row("c", 0, 0, 1), row("a", 0, 0, 1), row("b", 0, 0, 1)])).toEqual(["a", "b", "c"]);
  });

  it("does not depend on the order of equally ranked rows", () => {
    const rows = [row("z", 6, 2, 1), row("y", 3, 1, 2), row("b", 3, 1, 2)];
    expect(evidenceLeadingSet([rows[0]!, rows[2]!, rows[1]!])).toEqual(evidenceLeadingSet(rows));
  });
});

describe("buildGenericFocus", () => {
  const statements = { a: ["a1", "a2"], b: ["b1", "b2"], c: ["c1"], d: ["d1"] };

  it("builds one option per program in canonical id order plus a neutral option, whatever the input order", () => {
    const focus = buildGenericFocus(["c", "a", "b"], [], statements)!;
    expect(focus.id).toBe("focus:a|b|c:0");
    expect(focus.programIds).toEqual(["a", "b", "c"]);
    expect(focus.options.map((option) => [option.id, option.programIds])).toEqual([
      ["A", ["a"]],
      ["B", ["b"]],
      ["C", ["c"]],
      ["neither", []],
    ]);
    expect(buildGenericFocus(["b", "c", "a"], [], statements)).toEqual(focus);
  });

  it("uses the next unused statement index for exactly that program set", () => {
    const asked = [genericFocusId(["a", "b"], 0), genericFocusId(["a", "b", "c"], 0)];
    expect(buildGenericFocus(["b", "a"], asked, statements)).toMatchObject({ id: "focus:a|b:1", statementIndex: 1 });
  });

  it("returns null for fewer than 2 or more than 3 programs, or when a statement is missing", () => {
    expect(buildGenericFocus(["a"], [], statements)).toBeNull();
    expect(buildGenericFocus(["a", "b", "c", "d"], [], statements)).toBeNull();
    expect(buildGenericFocus(["a", "c"], [genericFocusId(["a", "c"], 0)], statements)).toBeNull();
    expect(buildGenericFocus(["a", "x"], [], statements)).toBeNull();
  });
});
