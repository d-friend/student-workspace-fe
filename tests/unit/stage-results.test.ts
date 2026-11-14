import { expect, test } from "vitest";
import { stageResults, type StageEntry, type StageResult } from "@/workspace/stageResults";

const ok = (fields: Partial<StageEntry> = {}): StageEntry => ({ state: "ok", tries: 1, hint: 0, ...fields });

const singleItems: [StageEntry, StageResult][] = [
  [ok(), { stage: 0, result: "first" }],
  [ok({ hint: 2 }), { stage: 0, result: "hint", n: 2 }],
  [ok({ tries: 3 }), { stage: 0, result: "fixed", n: 2 }],
  [{ state: "ok" as const }, { stage: 0, result: "unknown" }],
  [{ state: "review" as const }, { stage: 0, result: "todo" }],
];

test.each(singleItems)("folds a single item %j", (entry, row) => {
  expect(stageResults([0], [entry])).toEqual([row]);
});

test("groups in stage order, skips untagged items, and matches item before array index", () => {
  expect(stageResults([2, null, 0, undefined, 2], [ok({ item: 4 }), ok({ item: 2 }), ok({ item: 0 })])).toEqual([
    { stage: 0, result: "first" }, { stage: 2, result: "first" },
  ]);
});

test("fixed sums extra tries and wins over unknown and first", () => {
  expect(stageResults([0, 0, 0, 0], [ok({ tries: 3 }), ok({ tries: 2 }), { state: "ok" }, ok()])).toEqual([
    { stage: 0, result: "fixed", n: 3 },
  ]);
});

test("hint wins over fixed and unknown and uses the highest hint", () => {
  expect(stageResults([0, 0, 0, 0], [ok({ hint: 1, tries: 5 }), ok({ hint: 3 }), { state: "ok" }, ok()])).toEqual([
    { stage: 0, result: "hint", n: 3 },
  ]);
});

test("unknown wins over first", () => {
  expect(stageResults([0, 0], [ok(), { state: "ok" }])).toEqual([{ stage: 0, result: "unknown" }]);
});

test("an unaccepted or missing item makes its stage todo even with hints", () => {
  expect(stageResults([0, 0, 1], [ok({ hint: 2 }), { state: "review" }])).toEqual([
    { stage: 0, result: "todo" }, { stage: 1, result: "todo" },
  ]);
});

test("free work and absent stages have no rows", () => {
  expect(stageResults([0], [ok()], true)).toEqual([]);
  expect(stageResults([], [ok()])).toEqual([]);
  expect(stageResults([undefined, null], [ok(), ok()])).toEqual([]);
});

test("only hint and fixed rows carry the first reason in scaffold order", () => {
  expect(stageResults([0, 0, 1, 2, 3, 4], [
    ok({ item: 1, hint: 2, wrong: "second" }), ok({ item: 0, wrong: "first" }),
    ok({ tries: 2, wrong: "fixed reason" }), ok({ wrong: "hidden first" }),
    { state: "ok", wrong: "hidden unknown" }, { state: "review", wrong: "hidden todo" },
  ])).toEqual([
    { stage: 0, result: "hint", n: 2, wrong: "first" },
    { stage: 1, result: "fixed", n: 1, wrong: "fixed reason" },
    { stage: 2, result: "first" }, { stage: 3, result: "unknown" }, { stage: 4, result: "todo" },
  ]);
});

test("uses the override-mapped state supplied by the caller", () => {
  const entries: StageEntry[] = [{ state: "review" }, ok()];
  const overrides: Record<number, "ok" | "review"> = { 1: "ok", 2: "review" };
  expect(stageResults([0, 1], entries.map((e, i) => ({ ...e, state: overrides[i + 1] ?? e.state })))).toEqual([
    { stage: 0, result: "unknown" }, { stage: 1, result: "todo" },
  ]);
});

test("two items in a stage sum fixes and a hint on either item takes precedence", () => {
  expect(stageResults([0, 0], [ok({ tries: 2 }), ok({ tries: 3 })])).toEqual([{ stage: 0, result: "fixed", n: 3 }]);
  expect(stageResults([0, 0], [ok({ hint: 1 }), ok({ tries: 3 })])).toEqual([{ stage: 0, result: "hint", n: 1 }]);
  expect(stageResults([0, 0], [ok({ tries: 3 }), ok({ hint: 2 })])).toEqual([{ stage: 0, result: "hint", n: 2 }]);
});
