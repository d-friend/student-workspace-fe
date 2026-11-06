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
    { kind: "blank", template: "___", stage: 1 },
    { kind: "blank", template: "___", stage: 3 },
    { kind: "blank", template: "___", stage: 4 },
  ],
};

test.each([
  [0, 0],
  [1, 1],
  [2, 3],
  [3, 4],
])("with %i accepted entries, stage %i is current", (accepted, stage) => {
  const state: StudentWork = { blocks: { s1: { type: "steps", entries: Array.from({ length: accepted }, () => ({ text: "A", state: "ok" as const })), done: false, free: false } } };
  render(<StepProgress block={block} state={state} />);

  copy.roadmaps.motion_current.forEach((name, i) => {
    const node = screen.getByText(name).parentElement;
    expect(node?.getAttribute("aria-current")).toBe(i === stage ? "step" : null);
    expect(node?.textContent).toBe(`${i < stage ? "✓" : i + 1}${name}`);
  });

  const label = copy.stepProgress(accepted + 1, 4);
  const counter = screen.getByLabelText(label);
  expect(counter.textContent).toBe(`${accepted + 1}/4`);
  expect(screen.queryByText(label)).toBeNull();
});

test("all nodes are done when every item is accepted", () => {
  const state: StudentWork = { blocks: { s1: { type: "steps", entries: Array.from({ length: 4 }, () => ({ text: "A", state: "ok" as const })), done: true, free: false } } };
  const { container } = render(<StepProgress block={block} state={state} />);
  copy.roadmaps.motion_current.forEach((name) => {
    expect(screen.getByText(name).parentElement?.textContent).toBe(`✓${name}`);
  });
  expect(container.querySelector('[aria-current="step"]')).toBeNull();
  expect(screen.getByLabelText(copy.stepProgress(4, 4)).textContent).toBe("4/4");
});

test("items without a stage highlight no node", () => {
  const untagged: typeof block = { ...block, scaffold: [{ kind: "blank", template: "___" }] };
  const { container } = render(<StepProgress block={untagged} />);
  expect(container.querySelector('[aria-current="step"]')).toBeNull();
  expect(container.textContent).not.toContain("✓");
});

test.each([undefined, "unknown"])("roadmap %s displays only the item count", (roadmap) => {
  const { container } = render(<StepProgress block={{ ...block, roadmap }} />);
  expect(container.textContent).toBe(copy.stepProgress(1, 4));
  expect(container.querySelector('[aria-current="step"]')).toBeNull();
  copy.roadmaps.motion_current.forEach((name) => expect(screen.queryByText(name)).toBeNull());
});
