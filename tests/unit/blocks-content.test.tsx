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

test("quiz marks Xem lại only on the option whose check returned, not on a pending or failed pick", async () => {
  const c = ctxWith([bad]);
  show(choice, c);
  fireEvent.click(screen.getByRole("radio", { name: "A" }));
  await screen.findByText(copy.stateReview);

  let release!: (r: CheckResponse) => void;
  vi.mocked(c.check).mockImplementationOnce(() => new Promise((res) => (release = res)));
  fireEvent.click(screen.getByRole("radio", { name: /B/ }));
  // B is picked but unchecked: no verdict on it, A keeps its own.
  expect(screen.getByRole("radio", { name: /B/ }).textContent).not.toContain(copy.stateReview);
  expect(screen.getByRole("radio", { name: /A/ }).textContent).toContain(copy.stateReview);
  release(ok);
  await screen.findByText(copy.stateOk);
  expect(screen.getByRole("radio", { name: /A/ }).textContent).not.toContain(copy.stateReview);
});

test("quiz network failure leaves no badge on the pick", async () => {
  const c = ctxWith([bad]);
  show(choice, c);
  fireEvent.click(screen.getByRole("radio", { name: "A" }));
  await screen.findByText(copy.stateReview);
  vi.mocked(c.check).mockRejectedValueOnce(new Error("net"));
  fireEvent.click(screen.getByRole("radio", { name: /B/ }));
  await screen.findByText(copy.checkFailed);
  expect(screen.getByRole("radio", { name: /B/ }).textContent).not.toContain(copy.stateReview);
});

test("quiz option answers on Enter and Space", async () => {
  const c = ctxWith([bad, ok]);
  show(choice, c);
  fireEvent.keyDown(screen.getByRole("radio", { name: "A" }), { key: "Enter" });
  await screen.findByText(copy.stateReview);
  fireEvent.keyDown(screen.getByRole("radio", { name: /B/ }), { key: " " });
  await screen.findByText(copy.stateOk);
  expect(c.check).toHaveBeenNthCalledWith(1, "q1", "A", []);
  expect(c.check).toHaveBeenNthCalledWith(2, "q1", "B", []);
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

test("quiz feedback region exists before answering and holds the explanation after", async () => {
  const { container } = show(choice, ctxWith([ok]));
  const live = container.querySelector('[aria-live="polite"]')!;
  expect(live).toBeTruthy();
  expect(live.textContent).toBe("");
  fireEvent.click(screen.getByRole("radio", { name: "A" }));
  await screen.findByText("Vì sao đúng");
  expect(live.textContent).toContain("Vì sao đúng");
});

test("quiz radiogroup is named by the question and selection drives aria-checked", async () => {
  show(choice, ctxWith([bad, ok]));
  expect(screen.getByRole("radiogroup", { name: "Q?" })).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "A" }));
  await screen.findByText(copy.stateReview);
  const a = screen.getByRole("radio", { name: /A/ });
  expect(a.getAttribute("aria-checked")).toBe("true");
  expect(a.textContent).toContain(copy.stateReview);
  fireEvent.click(screen.getByRole("radio", { name: "B" }));
  await screen.findByText(copy.stateOk);
  const b = screen.getByRole("radio", { name: /B/ });
  expect(b.getAttribute("aria-checked")).toBe("true");
  expect(screen.getByRole("radio", { name: /A/ }).getAttribute("aria-checked")).toBe("false");
});

test("quiz radiogroup uses roving tabindex and arrow keys", () => {
  show(choice, ctxWith());
  const [a, b, c] = screen.getAllByRole("radio");
  expect([a, b, c].map((r) => r.tabIndex)).toEqual([0, -1, -1]);
  a.focus();
  fireEvent.keyDown(a, { key: "ArrowDown" });
  expect(document.activeElement).toBe(b);
  fireEvent.keyDown(b, { key: "ArrowLeft" });
  expect(document.activeElement).toBe(a);
  fireEvent.keyDown(a, { key: "ArrowUp" });
  expect(document.activeElement).toBe(c);
});

test("quiz text input has a visible label and a rejected check shows checkFailed without counting a try", async () => {
  const c = ctxWith([bad]);
  vi.mocked(c.check).mockRejectedValueOnce(new Error("net"));
  show({ type: "quiz", id: "q3", question_md: "Q", answer: "number", explanation_md: "E" }, c);
  const input = screen.getByLabelText(copy.answer);
  fireEvent.change(input, { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: copy.answer }));
  await screen.findByText(copy.checkFailed);
  expect(c.report).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: copy.answer }));
  await waitFor(() => expect(c.report).toHaveBeenCalled());
  expect(c.report).toHaveBeenCalledWith("quiz_answered", { block_id: "q3", answer: "5", ok: false, tries: 1 });
});

test("example title renders inline math inside the h3 without a <p>", () => {
  const { container } = show({ type: "example", id: "e9", title: "Đạo hàm của $y = x^2$ tại $x = 3$", problem_md: "P", steps: ["a"] }, ctxWith());
  const h3 = container.querySelector("h3")!;
  expect(h3.querySelector(".katex")).toBeTruthy();
  expect(h3.querySelector("p")).toBeNull();
  expect(h3.textContent).not.toContain("$");
});

test("image caption and credit are separate lines", () => {
  const { container } = show({ type: "image", id: "i9", src: "/x.jpg", alt: "a", caption: "Cap", credit: "Cred", source_url: "https://x.y" }, ctxWith());
  const spans = container.querySelectorAll("figcaption > span");
  expect([...spans].map((s) => s.textContent)).toEqual(["Cap", "Cred"]);
});
