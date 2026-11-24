import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChatView, type ChatActions, type ChatState } from "@/components/chat/ChatView";
import type { Bubble } from "@/hooks/useWorkspace";
import { copy } from "@/lib/copy";

const surprise = vi.hoisted(() => ({
  id: "lesson-1", title: "Vì sao bầu trời xanh?", emoji: "🌤️", teaser: "Tự thử với ánh sáng.", tag: "Bí ẩn đời thường",
}));
vi.mock("@/lib/api", async (original) => ({
  ...await original<typeof import("@/lib/api")>(),
  getSurpriseCard: vi.fn().mockResolvedValue(surprise),
}));

afterEach(cleanup);

const agent = (id: number, text: string, extra: Partial<Extract<Bubble, { kind: "agent" }>> = {}): Bubble => ({
  id, turn: id, kind: "agent", text, waiting: false, line: null, offer: false, restate: false, opts: null, ask: null, ...extra,
});

function setup() {
  const actions = {
    onConfirmRestate: vi.fn(), onCorrectRestate: vi.fn(), onAcceptOffer: vi.fn(), onOfferLater: vi.fn(),
    onOpt: vi.fn(), onRetry: vi.fn(), onRebuild: vi.fn(), onOpenWorkspace: vi.fn(),
  } satisfies ChatActions;
  const props = {
    actions,
    composer: { value: "", onChange: vi.fn(), onSend: vi.fn(), onPickPhoto: vi.fn(), placeholder: copy.placeholderEmpty },
    composerRef: { current: null },
    emptyThread: { onStarter: vi.fn(), onSurprise: vi.fn() },
    onDismissQuote: vi.fn(),
  };
  const ui = (bubbles: Bubble[], extra: Partial<ChatState> = {}, quote?: string, workspaceVisible = false) => (
    <ChatView {...props} quote={quote} workspaceVisible={workspaceVisible} state={{
      bubbles, busy: false, status: null, watching: false, restateChips: false, offerChips: false,
      optChips: null, optChipKind: "answer", optChipSeed: 0, ...extra,
    }} />
  );
  return { actions, ui, onDismissQuote: props.onDismissQuote };
}

it("shows a hint for a column containing only workspace cards", () => {
  const { ui } = setup();
  const card: Bubble = { kind: "workspace", id: 1, turn: 1, workspaceId: "w", title: "Bài toán", state: "ready" };
  const { rerender } = render(ui([card], {}, undefined, true));
  expect(screen.getByText(copy.chatEmptyHint)).toBeTruthy();
  expect(screen.queryByText(copy.entryTitle)).toBeNull();
  rerender(ui([card, agent(2, "Chào bạn")], {}, undefined, true));
  expect(screen.queryByText(copy.chatEmptyHint)).toBeNull();
});

it("shows the sample, Surprise and the footer inside the empty log until the first message", async () => {
  const { ui } = setup();
  const { rerender } = render(ui([]));
  const log = within(screen.getByRole("log"));
  expect(log.getByRole("heading", { name: copy.entryTitle })).toBeTruthy();
  expect(log.getByText(copy.starter1)).toBeTruthy();
  expect(await log.findByText(surprise.title)).toBeTruthy();
  expect(log.getByText(copy.entryFoot)).toBeTruthy();
  rerender(ui([{ kind: "student", id: 1, turn: 1, text: "Chào bạn", photos: [], failed: null }]));
  expect(log.getByText("Chào bạn")).toBeTruthy();
  for (const text of [copy.entryTitle, copy.starter1, surprise.title, copy.entryFoot]) {
    expect(log.queryByText(text)).toBeNull();
  }
  expect(screen.getAllByRole("textbox", { name: copy.inputLabel })).toHaveLength(1);
});

it("renders bubbles, recap and quote, with chips attached to the latest agent reply", () => {
  const { actions, ui, onDismissQuote } = setup();
  render(ui([
    { kind: "student", id: 1, turn: 1, text: "Đề của mình", photos: ["aA=="], failed: null },
    agent(2, "Mình đọc đề là x.", { restate: true }),
    { kind: "reset", id: 3, turn: 2, text: "", title: "Bài x" },
    { kind: "note", id: 4, turn: 2, text: "Một ghi chú" },
    { kind: "error", id: 5, turn: 2, text: "Một lỗi" },
    agent(6, "Em chọn nhé.", { line: 2 }),
  ], { restateChips: true, offerChips: true, optChips: ["Lựa chọn A"] }, "Một đoạn trích"));
  expect(screen.getByTestId("chat-view")).toBeTruthy();
  const log = within(screen.getByRole("log"));
  expect(log.getByRole("img", { name: copy.photoChip }).getAttribute("src")).toBe("data:image/jpeg;base64,aA==");
  for (const text of ["Đề của mình", "Mình đọc đề là x.", copy.workspaceResetDivider("Bài x"), "Một ghi chú", "Một lỗi", copy.reviewLabel(2)]) {
    expect(log.getByText(text)).toBeTruthy();
  }
  expect(screen.getByText(copy.problemRecap)).toBeTruthy();
  const latest = within(log.getByText("Em chọn nhé.").parentElement!.parentElement!);
  fireEvent.click(latest.getByRole("button", { name: copy.restateNo }));
  fireEvent.click(latest.getByRole("button", { name: copy.offerYes }));
  fireEvent.click(latest.getByRole("button", { name: "Lựa chọn A" }));
  expect(actions.onCorrectRestate).toHaveBeenCalledOnce();
  expect(actions.onAcceptOffer).toHaveBeenCalledOnce();
  expect(actions.onOpt).toHaveBeenCalledWith("Lựa chọn A");
  expect(screen.getByText("Một đoạn trích").closest("blockquote")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: copy.selectionDismiss }));
  expect(onDismissQuote).toHaveBeenCalledOnce();
});

it("shows the typing status and falls back to Thinking while waiting for an agent reply", () => {
  const { ui } = setup();
  const bubbles = [agent(1, "Waiting placeholder", { waiting: true })];
  const { rerender } = render(ui(bubbles, { busy: true }));
  expect(screen.getByText(copy.thinking)).toBeTruthy();
  rerender(ui(bubbles, { busy: true, status: copy.statusSearching }));
  expect(screen.getByText(copy.statusSearching)).toBeTruthy();
  expect(screen.queryByText("Waiting placeholder")).toBeNull();
});

it("offers retry only on the last student bubble and disables it while busy", () => {
  const { actions, ui } = setup();
  const bubbles: Bubble[] = [
    { kind: "student", id: 1, turn: 1, text: "Đề thứ nhất", photos: [], failed: "Lỗi thứ nhất" },
    { kind: "student", id: 2, turn: 2, text: "Đề thứ hai", photos: ["aA=="], failed: "Lỗi thứ hai" },
  ];
  const { rerender } = render(ui(bubbles, { busy: true }));
  expect(screen.getByText("Lỗi thứ nhất")).toBeTruthy();
  expect(screen.getByText("Lỗi thứ hai")).toBeTruthy();
  expect((screen.getByRole("button", { name: copy.retry }) as HTMLButtonElement).disabled).toBe(true);
  rerender(ui(bubbles));
  fireEvent.click(screen.getByRole("button", { name: copy.retry }));
  expect(actions.onRetry).toHaveBeenCalledExactlyOnceWith(2);
  rerender(ui([...bubbles, { kind: "student", id: 3, turn: 3, text: "Đề mới", photos: [], failed: null }]));
  expect(screen.queryByRole("button", { name: copy.retry })).toBeNull();
});

it("renders building, ready and failed workspace cards with the corresponding action", () => {
  const { actions, ui } = setup();
  render(ui([
    { kind: "workspace", id: 1, turn: 1, workspaceId: null, title: null, state: "building" },
    { kind: "workspace", id: 2, turn: 2, workspaceId: "w", title: "Ca nô xuôi dòng", state: "ready" },
    { kind: "workspace", id: 3, turn: 3, workspaceId: null, title: "Đạo hàm", state: "failed" },
  ], { status: copy.statusPlanning }));
  expect(screen.getByText(copy.statusPlanning).closest("article")?.querySelector("button")).toBeNull();
  const ready = within(screen.getByText("Ca nô xuôi dòng").closest("article")!);
  fireEvent.click(ready.getByRole("button", { name: copy.workspaceOpen }));
  expect(actions.onOpenWorkspace).toHaveBeenCalledExactlyOnceWith("w");
  const failed = within(screen.getByText("Đạo hàm").closest("article")!);
  expect(failed.getByText(copy.workspaceBuildFailed)).toBeTruthy();
  fireEvent.click(failed.getByRole("button", { name: copy.retry }));
  expect(actions.onRebuild).toHaveBeenCalledOnce();
});

it("draws the math in a student's message (the Học thêm message quotes the notes) and keeps a typed * as text", () => {
  const { ui } = setup();
  const text = "Mình muốn hiểu kĩ hơn: Định luật Ôm. Vở ghi: «$I = \\dfrac{U}{R}$» và 2 * 3";
  const { container } = render(ui([{ kind: "student", id: 1, turn: 1, text, photos: [], failed: null }]));
  expect(container.querySelector(".katex")).not.toBeNull();
  expect(container.textContent).not.toContain("$");
  expect(container.textContent).toContain("2 * 3");
});
