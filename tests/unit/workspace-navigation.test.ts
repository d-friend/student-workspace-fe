import { expect, test } from "vitest";
import { canReturnToProblem } from "@/workspace/navigation";

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
