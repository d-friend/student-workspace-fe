import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { copy } from "@/lib/copy";
import { renderBlock } from "@/workspace/blocks";
import type { Block, BlockCtx, CheckResponse } from "@/workspace/types";

afterEach(cleanup);


const ok: CheckResponse = { ok: true, state: "ok", done: true };
const bad: CheckResponse = { ok: false, state: "review", done: false };

const ctxWith = (resp: CheckResponse[] = []): BlockCtx => {
  const q = [...resp];
  return {
    workspaceId: "w",
    phase: "learn",
    report: vi.fn(),
    check: vi.fn(async (): Promise<CheckResponse> => q.shift() ?? ok),
    overrides: {},
    hintCount: 0,
    onSolved: vi.fn(),
  };
};
const show = (b: Block, c: BlockCtx) => render(<>{renderBlock(b, c)}</>);

const choice: Block = { type: "quiz", id: "q1", question_md: "Q?", answer: "choice", options: ["A", "B", "C"], explanation_md: "Vì sao đúng" };

test("quiz choice ok shows explanation and reports", async () => {
  const c = ctxWith([ok]);
  show(choice, c);
  expect(screen.getByRole("radiogroup")).toBeTruthy();
  expect(screen.queryByText("Vì sao đúng")).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "B" }));
  await screen.findByText("Vì sao đúng");
  expect(c.check).toHaveBeenCalledWith("q1", "B", []);
  expect(c.report).toHaveBeenCalledWith("quiz_answered", { block_id: "q1", answer: "B", ok: true, tries: 1 });
});

test("quiz shows explanation after second wrong", async () => {
  const c = ctxWith([bad, bad]);
  show(choice, c);
  fireEvent.click(screen.getByRole("radio", { name: "A" }));
  await waitFor(() => expect(c.report).toHaveBeenCalledTimes(1));
  expect(screen.queryByText("Vì sao đúng")).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "C" }));
  await screen.findByText("Vì sao đúng");
  expect(c.report).toHaveBeenLastCalledWith("quiz_answered", { block_id: "q1", answer: "C", ok: false, tries: 2 });
});

test("quiz open reports without check", async () => {
  const c = ctxWith();
  show({ type: "quiz", id: "q2", question_md: "Vì sao?", answer: "open", explanation_md: "E" }, c);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "vì thế" } });
  fireEvent.click(screen.getByRole("button", { name: copy.answer }));
  await screen.findByText(copy.sent);
  expect(c.check).not.toHaveBeenCalled();
  expect(c.report).toHaveBeenCalledWith("quiz_answered", { block_id: "q2", answer: "vì thế", ok: false, tries: 1 });
});

test("example reveal", () => {
  const b: Block = { type: "example", id: "e1", title: "T", problem_md: "P", steps: ["s-one", "s-two", "s-three"] };
  show(b, ctxWith());
  expect(screen.getByText("s-one")).toBeTruthy();
  expect(screen.queryByText("s-two")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: copy.nextStep }));
  expect(screen.getByText("s-two")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: copy.showAll }));
  expect(screen.getByText("s-three")).toBeTruthy();
  expect(screen.queryByRole("button", { name: copy.nextStep })).toBeNull();
});

test("image error shows alt and credit", () => {
  show({ type: "image", id: "i", src: "/x.jpg", alt: "Mô tả", credit: "Tác giả", source_url: "https://e.org" }, ctxWith());
  fireEvent.error(screen.getByRole("img"));
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByText("Mô tả")).toBeTruthy();
  expect(screen.getByText(/Tác giả/)).toBeTruthy();
});

test("callout labels", () => {
  for (const [tone, label] of [["idea", copy.calloutIdea], ["remember", copy.calloutRemember], ["warning", copy.calloutWarning]] as const) {
    const { unmount } = show({ type: "callout", id: "c", tone, md: "nội dung" }, ctxWith());
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText("nội dung")).toBeTruthy();
    unmount();
  }
});
