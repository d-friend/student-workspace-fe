import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { copy } from "@/lib/copy";
import { StepProgress } from "@/workspace/StepProgress";
import type { Block, StudentWork } from "@/workspace/types";

afterEach(cleanup);

const block: Extract<Block, { type: "steps" }> = {
  type: "steps", id: "s1", problem_id: "p1", input: "text", roadmap: "motion_current",
  scaffold: [
    { kind: "choice", prompt: "One", options: ["A", "B"], stage: 0 },
    { kind: "blank", template: "___", stage: 2 },
  ],
};

test("stages before the current item are done, including empty stages", () => {
  const state: StudentWork = { blocks: { s1: { type: "steps", entries: [{ text: "A", state: "ok" }], done: false, free: false } } };
  render(<StepProgress block={block} state={state} />);
  const names = copy.roadmaps.motion_current;
  expect(screen.getByText(names[0]).parentElement?.textContent).toContain("✓");
  expect(screen.getByText(names[1]).parentElement?.textContent).toContain("✓");
  expect(screen.getByText(names[2]).parentElement?.getAttribute("aria-current")).toBe("step");
  expect(screen.getByText(names[3]).parentElement?.getAttribute("aria-current")).toBeNull();
  expect(screen.getByText(names[3]).parentElement?.textContent).not.toContain("✓");
});

test("items without a stage highlight no node", () => {
  const untagged: typeof block = { ...block, scaffold: [{ kind: "blank", template: "___" }] };
  const { container } = render(<StepProgress block={untagged} />);
  expect(container.querySelector('[aria-current="step"]')).toBeNull();
  expect(container.textContent).not.toContain("✓");
});

test("unknown roadmap displays only the item count", () => {
  const { container } = render(<StepProgress block={{ ...block, roadmap: "unknown" }} />);
  expect(container.textContent).toBe(copy.stepProgress(1, 2));
});
