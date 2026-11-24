import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PackSheet } from "@/components/pack/PackSheet";
import * as api from "@/lib/api";
import { copy, setLocale } from "@/lib/copy";
import { track } from "@/lib/track";

vi.mock("@/lib/api", async original => ({ ...await original<typeof import("@/lib/api")>(), getPack: vi.fn(), retryPack: vi.fn(), setPackSubject: vi.fn() }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const pack = (extra: Partial<api.Pack> = {}): api.Pack => ({
  id: "p1", status: "extracting", error: null, subject: null, guesses: null, project_id: null, created_at: "2026-11-23T10:00:00Z", updated_at: "2026-11-23T10:00:00Z",
  files: [{ id: "f1", ordinal: 0, status: "pending", media_type: "image/jpeg" }, { id: "f2", ordinal: 1, status: "pending", media_type: "image/jpeg" }],
  blocks: [], nodes: [], ...extra,
});
const ok = (id: string) => ({ id, ordinal: 0, status: "ok" as const, media_type: "image/jpeg" });
const node = (name: string, created: boolean): api.Pack["nodes"][number] => ({ id: name, name, role: "lesson", created });

beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers({ shouldAdvanceTime: true }); setLocale("vi"); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const show = (p: api.Pack, onClose = vi.fn(), onSettled = vi.fn()) => ({ onClose, onSettled, ...render(<PackSheet initial={p} onClose={onClose} onSettled={onSettled} />) });

test("counts the pages read, then names each stage until it is done", async () => {
  vi.mocked(api.getPack)
    .mockResolvedValueOnce(pack({ files: [ok("f1"), { ...ok("f2"), status: "pending" }] }))
    .mockResolvedValueOnce(pack({ files: [ok("f1"), ok("f2")] }))
    .mockResolvedValueOnce(pack({ status: "merging", files: [ok("f1"), ok("f2")] }))
    .mockResolvedValue(pack({ status: "ready", files: [ok("f1"), ok("f2")], nodes: [node("a", true), node("b", true), node("c", false)] }));
  const { onSettled } = show(pack());
  expect(screen.getByRole("status").textContent).toContain(copy.packReading(0, 2));
  await act(() => vi.advanceTimersByTimeAsync(1600));
  expect(screen.getByRole("status").textContent).toContain(copy.packReading(1, 2));
  await act(() => vi.advanceTimersByTimeAsync(1600));
  expect(screen.getByRole("status").textContent).toContain(copy.packFindingSubject);
  await act(() => vi.advanceTimersByTimeAsync(1600));
  expect(screen.getByRole("status").textContent).toContain(copy.packMerging);
  await act(() => vi.advanceTimersByTimeAsync(1600));
  expect(screen.getByRole("status").textContent).toContain(copy.packDone(2, 1));
  expect(screen.getByRole("link", { name: copy.packOpen }).getAttribute("href")).toBe("/packs/p1?via=status_sheet");
  expect(onSettled).toHaveBeenCalledTimes(1);
  await act(() => vi.advanceTimersByTimeAsync(5000));
  expect(api.getPack).toHaveBeenCalledTimes(4); // no polling after it is done
});

test("asks for the subject with the guesses as chips and starts again with the answer", async () => {
  vi.mocked(api.setPackSubject).mockResolvedValue(pack({ status: "extracting", files: [ok("f1")] }));
  vi.mocked(api.getPack).mockResolvedValue(pack({ status: "ready", files: [ok("f1")], nodes: [node("a", true)] }));
  show(pack({ status: "needs_subject", files: [ok("f1")], guesses: ["Toán", "Vật lí", "Ngữ văn"] }));
  fireEvent.click(screen.getByRole("button", { name: "Vật lí" }));
  await waitFor(() => expect(api.setPackSubject).toHaveBeenCalledWith("p1", "Vật lí"));
  expect(api.getPack).not.toHaveBeenCalled(); // needs_subject does not poll
  await act(() => vi.advanceTimersByTimeAsync(1600)); // the poll timer is armed after the render that follows the answer
  await act(() => vi.advanceTimersByTimeAsync(1600));
  expect(screen.getByRole("status").textContent).toContain(copy.packDone(1, 0));
});

test("takes another subject typed in", async () => {
  vi.mocked(api.setPackSubject).mockResolvedValue(pack({ status: "ready", files: [ok("f1")] }));
  show(pack({ status: "needs_subject", files: [ok("f1")], guesses: ["Toán"] }));
  fireEvent.click(screen.getByRole("button", { name: copy.packSubjectOther }));
  fireEvent.change(screen.getByLabelText(copy.packSubjectName), { target: { value: " Cờ vua " } });
  fireEvent.click(screen.getByRole("button", { name: copy.packSubjectConfirm }));
  await waitFor(() => expect(api.setPackSubject).toHaveBeenCalledWith("p1", "Cờ vua"));
});

test("a failed pack offers a retry that names the stage", async () => {
  vi.mocked(api.retryPack).mockResolvedValue(pack({ status: "extracting", files: [ok("f1")] }));
  show(pack({ status: "failed", error: "concepts:upstream", files: [ok("f1")] }));
  expect(screen.getByRole("status").textContent).toContain(copy.packFailed);
  fireEvent.click(screen.getByRole("button", { name: copy.packRetry }));
  await waitFor(() => expect(api.retryPack).toHaveBeenCalledWith("p1"));
  expect(track).toHaveBeenCalledWith("pack_retry_clicked", { pack_id: "p1", stage: "concepts" });
});

test("blurry photos are not retryable, only named", () => {
  show(pack({ status: "partial", files: [ok("f1"), { ...ok("f2"), status: "unreadable" }] }));
  expect(screen.queryByText(copy.packPhotoBlurry(2))).not.toBeNull();
  expect(screen.queryByRole("button", { name: copy.packRetry })).toBeNull();
  expect(screen.getByRole("status").textContent).toContain(copy.packDonePartial(1));
});

test("a pack with no readable page says so and does not offer a retry", () => {
  show(pack({ status: "failed", error: "extract:unreadable", files: [{ ...ok("f1"), status: "unreadable" }] }));
  expect(screen.getByRole("status").textContent).toContain(copy.packFailedNoText);
  expect(screen.queryByRole("button", { name: copy.packRetry })).toBeNull();
});

test("closes on Escape and on the button, leaving the pack running", () => {
  vi.mocked(api.getPack).mockResolvedValue(pack());
  const { onClose } = show(pack());
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: copy.packClose }));
  expect(onClose).toHaveBeenCalledTimes(2);
});

test("from home, a finished sheet says which subject the notes were filed into, and opens it", async () => {
  vi.mocked(api.getPack).mockResolvedValue(pack());
  show(pack({ status: "ready", files: [ok("f1")], nodes: [node("a", true)], project_id: "proj1", subject: { id: "s1", name: "Vật lí", by: "auto", confidence: 0.9 } }));
  expect(screen.getByText(copy.packFiledInto("Vật lí"))).toBeDefined();
  fireEvent.click(screen.getByRole("link", { name: copy.packOpenProject }));
  expect(track).toHaveBeenCalledWith("project_opened", { project_id: "proj1", via: "pack_sheet" });
});

test("inProject: the finished sheet only closes", async () => {
  vi.mocked(api.getPack).mockResolvedValue(pack());
  const initial = pack({ status: "ready", files: [ok("f1")], nodes: [node("a", true)], project_id: "proj1", subject: { id: "s1", name: "Vật lí", by: "auto", confidence: 0.9 } });
  render(<PackSheet initial={initial} onClose={vi.fn()} onSettled={vi.fn()} inProject />);
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.queryByText(copy.packFiledInto("Vật lí"))).toBeNull();
});
