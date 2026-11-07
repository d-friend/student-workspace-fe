import type { Block } from "./types";

export type QueuedAnswer = { blockId: string; item: 0 } & (
  | { input: "choice"; prompt: string; optionText: string }
  | { input: "blank"; template: string; value: string }
);

export type QueuedAttempt = { blockId: string; answer: string; text: string; input: "choice" | "blank"; item: 0 };

export function matchQueued(queued: QueuedAnswer, steps: Pick<Extract<Block, { type: "steps" }>, "id" | "scaffold">): Omit<QueuedAttempt, "blockId"> | null {
  if (queued.blockId !== steps.id) return null;
  const item = steps.scaffold?.[0];
  if (queued.input === "choice" && item?.kind === "choice" && queued.prompt === item.prompt) {
    const index = item.options.findIndex((o) => o.trim() === queued.optionText.trim());
    return index < 0 ? null : { answer: String(index), text: queued.optionText, input: "choice", item: 0 };
  }
  if (queued.input === "blank" && item?.kind === "blank" && queued.template === item.template) {
    const [pre = "", post = ""] = item.template.split("___");
    return { answer: queued.value, text: pre + queued.value + post, input: "blank", item: 0 };
  }
  return null;
}
