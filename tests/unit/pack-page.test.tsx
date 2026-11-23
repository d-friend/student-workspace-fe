import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { PackPage } from "@/app/packs/PackPage";
import * as api from "@/lib/api";
import { copy, setLocale } from "@/lib/copy";
import { track } from "@/lib/track";

vi.mock("@/lib/api", async original => ({
  ...await original<typeof import("@/lib/api")>(),
  getPack: vi.fn(), retryPack: vi.fn(), setPackSubject: vi.fn(), getMe: vi.fn(), createGuest: vi.fn(), authMethods: vi.fn(),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "p1" }), useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const pack = (extra: Partial<api.Pack> = {}): api.Pack => ({
  id: "p1", status: "ready", error: null, subject: { id: "phys", name: "Vật lí", by: "auto", confidence: 0.9 }, guesses: null,
  created_at: "2026-11-23T10:00:00Z", updated_at: "2026-11-23T10:00:00Z",
  files: [{ id: "f1", ordinal: 0, status: "ok", media_type: "image/jpeg" }, { id: "f2", ordinal: 1, status: "ok", media_type: "image/jpeg" }],
  blocks: [
    { id: "b1", file_id: "f1", page: 1, ordinal: 0, kind: "heading", text: "Định luật Ôm" },
    { id: "b2", file_id: "f1", page: 1, ordinal: 1, kind: "formula", text: "$$I = \\dfrac{U}{R}$$" },
    { id: "b3", file_id: "f2", page: 1, ordinal: 0, kind: "figure", text: "[Hình: mạch điện]" },
  ],
  nodes: [{ node_id: "phys.ohm", level: "topic", parent_id: "phys", name: "Định luật Ôm", summary: "I = U/R", block_ids: ["b1"], created: true }], ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  setLocale("vi");
  history.replaceState(null, "", "/packs/p1?via=node_source&block=b2");
  vi.mocked(api.createGuest).mockResolvedValue({ guestId: "g", created: false });
  vi.mocked(api.getMe).mockResolvedValue({ signed_in: false, profile_needed: false });
  vi.mocked(api.authMethods).mockResolvedValue({ google: false, email: false });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); history.replaceState(null, "", "/"); });

test("shows each photo with the text read from it, highlights the block it was opened for and tracks how it was opened", async () => {
  vi.mocked(api.getPack).mockResolvedValue(pack());
  const { container } = render(<PackPage />);
  await screen.findByRole("heading", { name: "Vật lí" });
  const photos = screen.getAllByRole("img");
  expect(photos.map(p => p.getAttribute("src"))).toEqual(["/api/packs/p1/files/f1", "/api/packs/p1/files/f2"]);
  expect(container.querySelector("#block-b2")?.hasAttribute("data-highlight")).toBe(true);
  expect(container.querySelector("#block-b1")?.hasAttribute("data-highlight")).toBe(false);
  expect(container.querySelectorAll(".katex").length).toBeGreaterThan(0);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenCalledExactlyOnceWith("pack_opened", { pack_id: "p1", via: "node_source" });
});

test("an unknown via counts as the list", async () => {
  history.replaceState(null, "", "/packs/p1?via=whatever");
  vi.mocked(api.getPack).mockResolvedValue(pack());
  render(<PackPage />);
  await screen.findByRole("heading", { name: "Vật lí" });
  expect(track).toHaveBeenCalledWith("pack_opened", { pack_id: "p1", via: "list" });
});

test("moves the pack to another subject", async () => {
  vi.mocked(api.getPack).mockResolvedValue(pack());
  vi.mocked(api.setPackSubject).mockResolvedValue(pack({ status: "extracting", subject: { id: "math", name: "Toán", by: "student", confidence: null } }));
  render(<PackPage />);
  fireEvent.click(await screen.findByRole("button", { name: copy.packChangeSubject }));
  expect(screen.queryByRole("button", { name: "Vật lí" })).toBeNull(); // not offered the subject it is already in
  fireEvent.click(screen.getByRole("button", { name: "Toán" }));
  await waitFor(() => expect(api.setPackSubject).toHaveBeenCalledWith("p1", "Toán"));
  await screen.findByRole("heading", { name: "Toán" });
});

test("a failed pack can be retried; an unreadable one only says what to do", async () => {
  vi.mocked(api.getPack).mockResolvedValue(pack({ status: "failed", error: "concepts:upstream", nodes: [] }));
  vi.mocked(api.retryPack).mockResolvedValue(pack({ status: "extracting", nodes: [] }));
  const { unmount } = render(<PackPage />);
  fireEvent.click(await screen.findByRole("button", { name: copy.packRetry }));
  await waitFor(() => expect(api.retryPack).toHaveBeenCalledWith("p1"));
  expect(track).toHaveBeenCalledWith("pack_retry_clicked", { pack_id: "p1", stage: "concepts" });
  unmount();
  vi.mocked(api.getPack).mockResolvedValue(pack({ status: "failed", error: "extract:unreadable", files: [{ id: "f1", ordinal: 0, status: "unreadable", media_type: "image/jpeg" }] }));
  render(<PackPage />);
  await screen.findByText(copy.packPhotoBlurry(1));
  expect(screen.queryByRole("button", { name: copy.packRetry })).toBeNull();
});

test("a pack that is not there, or that fails to load, says so", async () => {
  vi.mocked(api.getPack).mockRejectedValue(new api.ApiError(404, "pack_not_found", "no"));
  render(<PackPage />);
  expect((await screen.findByRole("alert")).textContent).toBe(copy.packNotFound);
});
