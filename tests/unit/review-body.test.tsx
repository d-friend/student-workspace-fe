import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { copy } from "@/lib/copy";
import { track } from "@/lib/track";
import { ReviewBody } from "@/workspace/ReviewBody";
import type { BlockCtx, SavedBlockState, StudentWork, Workspace, WorkspaceDoc } from "@/workspace/types";
import * as api from "@/lib/api";

vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/lib/api", async original => ({ ...await original<typeof import("@/lib/api")>(), listSessions: vi.fn(), listProjects: vi.fn() }));

window.matchMedia ??= (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
Element.prototype.scrollIntoView ??= vi.fn();
beforeEach(() => {
  vi.mocked(api.listSessions).mockResolvedValue({ sessions: [{ id: "s1", project_id: "p1", title: null, created_at: "", last_active_at: "", tabs: [], done: false, current: true }], next_before: null });
  vi.mocked(api.listProjects).mockResolvedValue([{ id: "p1", name: "Toán" }] as never);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const doc = (exam_on: string | null = tomorrow()): WorkspaceDoc => ({
  version: 1, phase: "review", title: "Ôn tập · Đường tròn", sources: [], exam_on,
  blocks: [
    { type: "heading", id: "h1", text: "Tiếp tuyến", level: 2 },
    { type: "callout", id: "n1", tone: "note", md: "- Tiếp tuyến vuông góc bán kính.\n- $OA^2 = R^2 + AB^2$", source_block: "b-1" },
    { type: "callout", id: "m1", tone: "mistake", md: "Hay nhầm hai tiếp tuyến." },
    { type: "heading", id: "h2", text: "Góc", level: 2 },
    { type: "callout", id: "n2", tone: "note", md: "- Góc nội tiếp bằng một nửa góc ở tâm." },
    { type: "quiz", id: "q1", lesson: "h1", question_md: "Tiếp tuyến vuông góc với?", answer: "choice", options: ["Bán kính", "Dây cung"], explanation_md: "Vuông góc với bán kính." },
    { type: "quiz", id: "q2", lesson: "h2", question_md: "Góc nội tiếp chắn nửa đường tròn?", answer: "number", explanation_md: "90 độ." },
    { type: "practice", id: "p1", title: "Tiếp tuyến", md: "Tính $AB$." },
    { type: "practice", id: "p2", title: "Ngoại tiếp", md: "Tính $R$." },
  ],
});
const quizState = (tries: number, ok: boolean): SavedBlockState => ({ type: "quiz", tries, done: ok || tries >= 2, text: "", selected: null, answered: { option: "x", ok } });
const ws = (state: StudentWork | null, exam_on?: string | null): Workspace => ({ id: "w1", doc: doc(exam_on), state });

function Harness({ initial = null, tabs = [], taskDone = {}, report = vi.fn(), exam_on, check = vi.fn(async () => ({ ok: true, state: "ok" as const, done: true })), onLeave }: {
  initial?: StudentWork | null; tabs?: Workspace[]; taskDone?: Record<string, string[]>; report?: BlockCtx["report"]; exam_on?: string | null;
  check?: BlockCtx["check"]; onLeave?: (url: string) => void;
}) {
  const [state, setState] = useState<StudentWork | null>(initial);
  const w = ws(state, exam_on);
  const ctx: BlockCtx = {
    workspaceId: "w1", sessionId: "s1", phase: "review", state, report, check, overrides: {}, hintCount: 0, onSolved: () => {}, help: null,
    saveBlock: (id, saved) => setState(previous => ({ ...previous, blocks: { ...previous?.blocks, [id]: saved } })),
  };
  return <ReviewBody w={w} ctx={ctx} tabs={[w, ...tabs]} taskDone={taskDone} hidden={false} busy={false} onActive={() => {}} onLeave={onLeave} />;
}

test("the bar counts what is done, the test date is a muted line, and a mistake callout is named", () => {
  render(<Harness initial={{ blocks: { q1: quizState(1, true) } }} />);
  expect(screen.getByRole("button", { name: new RegExp(copy.reviewSegTest) }).textContent).toContain("1/2");
  expect(screen.getByRole("button", { name: new RegExp(copy.reviewSegPractice) }).textContent).toContain("0/2");
  expect(screen.getByText(/^Kiểm tra: mai/)).toBeTruthy();
  expect(screen.getByText(copy.reviewMistake)).toBeTruthy();
  expect(screen.getByText(copy.reviewQuestion(2, "Góc"))).toBeTruthy();
});

test("no test date means no date line, and a past one is not shown either", () => {
  const { rerender } = render(<Harness exam_on={null} />);
  expect(screen.queryByText(/^Kiểm tra:/)).toBeNull();
  rerender(<Harness exam_on="2020-01-01" />);
  expect(screen.queryByText(/^Kiểm tra:/)).toBeNull();
});

test("'Xem trong vở' links to the subject's notes at the block, once the subject is known", async () => {
  render(<Harness />);
  const link = await screen.findByRole("link", { name: new RegExp(copy.reviewInNotes) });
  expect(link.getAttribute("href")).toBe("/projects/p1?tab=sources&block=b-1");
  expect(screen.getAllByRole("link", { name: new RegExp(copy.reviewInNotes) })).toHaveLength(1); // only the note that has a source
});

test("a second wrong answer ends with the way back to that lesson's note; a right one has none", async () => {
  const check = vi.fn(async () => ({ ok: false, state: "review" as const, done: false }));
  render(<Harness check={check} />);
  fireEvent.click(screen.getByRole("radio", { name: "Dây cung" }));
  await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("button", { name: copy.reviewSeeAgain("Tiếp tuyến") })).toBeNull(); // still has its retry
  fireEvent.click(screen.getByRole("radio", { name: "Bán kính" }));
  const back = await screen.findByRole("button", { name: copy.reviewSeeAgain("Tiếp tuyến") });
  fireEvent.click(back);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
});

test("Làm bài này asks for that card once; Để sau marks it skipped and the card says so", () => {
  const report = vi.fn();
  render(<Harness report={report} />);
  const [first, second] = screen.getAllByRole("button", { name: copy.reviewPractice });
  fireEvent.click(first);
  fireEvent.click(first);
  expect(report).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith("practice_requested", { block_id: "p1" });
  expect((second as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getAllByRole("button", { name: copy.reviewLater })[1]);
  expect(screen.getAllByRole("button", { name: copy.reviewLater })).toHaveLength(1); // only the card still open has the button
  expect(screen.getAllByText(copy.reviewLaterBadge)).toHaveLength(2); // its own button text, and the skipped card's badge
  expect(screen.getByRole("button", { name: new RegExp(copy.reviewSegPractice) }).textContent).toContain("1/2");
});

test("a practice tab built from a card turns it into 'Tiếp tục', and finishing it shows Đã làm", () => {
  const practice: Workspace = { id: "w2", parent_workspace_id: "w1", doc: { ...doc(), phase: "practice", from_block: "p1", blocks: [] }, state: null };
  const { rerender } = render(<Harness tabs={[practice]} />);
  expect(screen.getByRole("button", { name: new RegExp(copy.reviewPracticeContinue) })).toBeTruthy();
  rerender(<Harness tabs={[practice]} taskDone={{ w2: ["s1"] }} />);
  expect(screen.getByText(copy.reviewDoneBadge)).toBeTruthy();
});

test("the end card shows when every quiz is answered and every card is done or skipped: score, kept cards, a promise that names a day", async () => {
  const onLeave = vi.fn();
  const practice: Workspace = { id: "w2", parent_workspace_id: "w1", doc: { ...doc(), phase: "practice", from_block: "p1", blocks: [] }, state: null };
  render(<Harness tabs={[practice]} taskDone={{ w2: ["s1"] }} onLeave={onLeave}
    initial={{ blocks: { q1: quizState(1, true), q2: quizState(2, false), p2: { type: "practice", skipped: true } } }} />);
  const end = screen.getByRole("status");
  expect(within(end).getByText(copy.reviewEnd(1, 2))).toBeTruthy();
  expect(end.textContent).toContain(copy.reviewKept(1, copy.reviewTomorrow));
  expect(track).toHaveBeenCalledWith("review_finished", { workspace_id: "w1", correct: 1, total: 2, kept_cards: 1, practices_done: 1 }, "s1");
  const subject = await screen.findByRole("button", { name: copy.reviewBackTo("Toán") });
  fireEvent.click(subject);
  expect(onLeave).toHaveBeenCalledWith("/projects/p1");
  fireEvent.click(screen.getByRole("button", { name: new RegExp(copy.reviewMore) }));
  const more = new URL(onLeave.mock.calls[1][0], "http://x");
  expect([more.searchParams.get("via"), more.searchParams.get("project"), more.searchParams.get("q")]).toEqual(["review", "p1", copy.reviewMoreMessage("Toán")]);
});

test("with nothing wrong the card says so instead of promising a reminder; before the end there is no card", () => {
  const { rerender } = render(<Harness initial={{ blocks: { q1: quizState(1, true), q2: quizState(1, true), p1: { type: "practice", skipped: true }, p2: { type: "practice", skipped: true } } }} />);
  expect(screen.getByRole("status").textContent).toContain(copy.reviewSolid);
  expect(screen.getByRole("status").textContent).not.toContain("nhắc bạn");
  rerender(<Harness initial={{ blocks: { q1: quizState(1, true) } }} key="fresh" />);
  expect(screen.queryByRole("status")).toBeNull();
});
