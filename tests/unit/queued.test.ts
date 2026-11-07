import { expect, it } from "vitest";
import { matchQueued, type QueuedAnswer } from "@/workspace/queued";
import type { Block } from "@/workspace/types";

const choice: QueuedAnswer = { blockId: "s", item: 0, input: "choice", prompt: "Start?", optionText: "Differentiate" };
const steps = (scaffold: Extract<Block, { type: "steps" }>["scaffold"]): Extract<Block, { type: "steps" }> => ({ type: "steps", id: "s", input: "math", problem_id: "p", scaffold });
it("matches a shuffled choice by trimmed text", () => {
  expect(matchQueued(choice, steps([{ kind: "choice", prompt: "Start?", options: ["Integrate", " Differentiate "] }]))).toEqual({ answer: "1", text: "Differentiate", input: "choice", item: 0 });
});
it("drops a missing option", () => {
  expect(matchQueued(choice, steps([{ kind: "choice", prompt: "Start?", options: ["Integrate"] }]))).toBeNull();
});
it("drops a changed prompt, kind, block or missing scaffold", () => {
  expect(matchQueued(choice, steps([{ kind: "choice", prompt: "Finish?", options: ["Differentiate"] }]))).toBeNull();
  expect(matchQueued(choice, steps([{ kind: "blank", template: "___" }]))).toBeNull();
  expect(matchQueued(choice, { ...steps([]), id: "other" })).toBeNull();
  expect(matchQueued(choice, steps(undefined))).toBeNull();
});
it("drops a changed blank template", () => {
  expect(matchQueued({ blockId: "s", item: 0, input: "blank", template: "x=___", value: "2" }, steps([{ kind: "blank", template: "y=___" }]))).toBeNull();
});
it("builds blank text exactly like Steps, including split behavior", () => {
  expect(matchQueued({ blockId: "s", item: 0, input: "blank", template: "$x=___$ + c___ignored", value: " 2 " }, steps([{ kind: "blank", template: "$x=___$ + c___ignored" }]))).toEqual({ answer: " 2 ", text: "$x= 2 $ + c", input: "blank", item: 0 });
});
