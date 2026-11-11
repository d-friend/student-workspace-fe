import { expect, test } from "vitest";
import { canReturnToProblem, returnTarget } from "@/workspace/navigation";
import type { Phase, Workspace } from "@/workspace/types";

const tab = (id: string, phase: Phase, parent_workspace_id?: string | null): Workspace & { phase: Phase } => ({
  id,
  phase,
  parent_workspace_id,
  doc: { version: 1, phase, title: id, blocks: [], sources: [] },
});

test("returnTarget prefers the parent when it is present", () => {
  const learn = tab("learn", "learn", "parent");
  expect(returnTarget([tab("parent", "solve"), tab("later", "solve"), learn], learn)).toBe("parent");
});

test("returnTarget falls back to the last solve tab when the parent is missing", () => {
  const learn = tab("learn", "learn", "missing");
  expect(returnTarget([tab("first", "solve"), learn, tab("last", "solve")], learn)).toBe("last");
});

test("returnTarget returns null when there is no parent or solve tab", () => {
  const learn = tab("learn", "learn", "missing");
  expect(returnTarget([learn, tab("practice", "practice")], learn)).toBeNull();
});

test("a parentless learn copy cannot return even when a solve tab exists", () => {
  expect(canReturnToProblem("learn", null, true)).toBe(false);
});

test("learn tabs with a parent and a solve tab can return", () => {
  expect(canReturnToProblem("learn", "solve-1", true)).toBe(true);
  expect(canReturnToProblem("learn", "solve-1", false)).toBe(false);
  expect(canReturnToProblem("solve", "solve-1", true)).toBe(false);
});

test("live tabs without parent metadata retain the existing solve-tab fallback", () => {
  expect(canReturnToProblem("learn", undefined, true)).toBe(true);
  expect(canReturnToProblem("learn", undefined, false)).toBe(false);
});
