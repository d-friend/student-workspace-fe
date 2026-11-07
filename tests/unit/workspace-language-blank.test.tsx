import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { copy, copyFor, setLocale } from "@/lib/copy";
import { WorkspaceView } from "@/workspace/WorkspaceView";
import { blankSides } from "@/workspace/blocks/Steps";
import { workspaceLocale } from "@/workspace/workspaceLocale";
import type { BlockCtx, WorkspaceDoc } from "@/workspace/types";

afterEach(() => { cleanup(); setLocale("vi"); });

const doc = (blocks: WorkspaceDoc["blocks"], phase: WorkspaceDoc["phase"] = "solve"): WorkspaceDoc => ({
  version: 1, phase, title: "Title", blocks, sources: [],
});

test("workspace language comes from the problem or the first learn text", () => {
  expect(workspaceLocale(doc([{ type: "problem", id: "p", md: "Một người đi xe đạp" }]))).toBe("vi");
  expect(workspaceLocale(doc([{ type: "problem", id: "p", md: "Find x" }]))).toBe("en");
  expect(workspaceLocale(doc([{ type: "text", id: "t", md: "Đạo hàm" }, { type: "text", id: "t2", md: "English" }], "learn"))).toBe("vi");
  expect(workspaceLocale(doc([{ type: "text", id: "t", md: "English" }, { type: "text", id: "t2", md: "Tiếng Việt" }], "learn"))).toBe("en");
  setLocale("en");
  expect(workspaceLocale(doc([]))).toBe("en");
  setLocale("vi");
  expect(workspaceLocale(doc([{ type: "problem", id: "p", md: "  " }]))).toBe("vi");
});

test("copyFor returns the corresponding existing copy independent of global locale", () => {
  setLocale("en");
  expect(copyFor("en").fillBlank).toBe(copy.fillBlank);
  expect(copyFor("vi").fillBlank).toBe("Điền vào chỗ trống");
  setLocale("vi");
  expect(copyFor("vi").fillBlank).toBe(copy.fillBlank);
  expect(copyFor("en").fillBlank).toBe("Fill in the blank");
});

test.each([
  ["$x = $___", ["$x = $", ""]],
  ["$x = ___$", ["$x = $", "$$"]],
  ["___ km", ["", " km"]],
  ["answer ___ now", ["answer ", " now"]],
  ["giá \\$5 ___", ["giá \\$5 ", ""]],
])("prepares only the rendered sides of %s", (template, expected) => {
  const [pre, post = ""] = (template as string).split("___");
  expect(blankSides(pre, post)).toEqual(expected);
});

test("workspace copy follows content and the submitted blank keeps its original text", async () => {
  setLocale("en");
  const check = vi.fn(async () => ({ ok: true, state: "ok" as const, done: false }));
  const ctx: BlockCtx = { workspaceId: "w", phase: "solve", report: vi.fn(), check, overrides: {}, hintCount: 0, onSolved: vi.fn(), help: null };
  const content = doc([
    { type: "problem", id: "p", md: "Một bài toán" },
    { type: "steps", id: "s", problem_id: "p", input: "math", roadmap: "generic", scaffold: [{ kind: "blank", template: "$x = ___$", stage: 0 }] },
  ]);
  const { container } = render(<WorkspaceView tabs={[{ id: "w", phase: "solve", doc: content }]} activeId="w" onActive={vi.fn()} makeCtx={() => ctx} />);
  expect(screen.getByText(copyFor("vi").fillBlank)).toBeTruthy();
  expect(screen.getByText(copyFor("vi").roadmaps.generic[0])).toBeTruthy();
  expect(screen.getByRole("button", { name: copyFor("vi").hint })).toBeTruthy();
  expect(container.querySelector("form")?.textContent).not.toContain("$$");
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "2" } });
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
  await waitFor(() => expect(ctx.report).toHaveBeenCalledWith("line_checked", expect.objectContaining({ text: "$x = 2$" })));
  expect(check).toHaveBeenCalledWith("s", "2", [], 0);
});
