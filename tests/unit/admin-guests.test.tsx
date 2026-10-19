import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { GuestsSection, GuestTimeline } from "@/app/admin/sections";
import { adminGet, adminPut, type GuestDetail, type GuestRow } from "@/lib/admin";

vi.mock("@/lib/admin", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/admin")>()), adminGet: vi.fn(), adminPut: vi.fn() }));
const mockedAdminGet = vi.mocked(adminGet);
const mockedAdminPut = vi.mocked(adminPut);

const guests: GuestRow[] = [
  { id: "internal-abcdefgh", created_at: "2026-10-18T00:00:00Z", last_seen_at: "2026-10-19T00:00:00Z", internal: true, sessions: 2, turns: 4, completions: 1, usd: 0.25 },
  { id: "student-abcdefgh", created_at: "2026-10-17T00:00:00Z", last_seen_at: "2026-10-18T00:00:00Z", internal: false, sessions: 1, turns: 2, completions: 0, usd: 0 },
];
const detail: GuestDetail = {
  guest: guests[0],
  sessions: [
    { id: "session-new", started_via: "typed", created_at: "2026-10-19T00:00:00Z", ended_at: null, end_reason: null, mode: "solve", turns: [{ id: "turn-new", started_at: "2026-10-19T00:01:00Z", kind: "message", route: "master", mode: "solve", ok: true, error_code: null, total_ms: 100, first_text_ms: 10, model: "model", usd: 0.1, events: ["task_completed"] }] },
    { id: "session-old", started_via: "photo", created_at: "2026-10-18T00:00:00Z", ended_at: "2026-10-18T01:00:00Z", end_reason: "abandoned", mode: "learn", turns: [{ id: "turn-old", started_at: "2026-10-18T00:01:00Z", kind: "message", route: null, mode: "learn", ok: false, error_code: "upstream", total_ms: 200, first_text_ms: null, model: null, usd: null, events: ["turn_failed"] }] },
  ],
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

test("lists guests with the internal flag checked for internal ones", async () => {
  mockedAdminGet.mockResolvedValue(guests);
  render(<GuestsSection token="token" onGuestOpen={() => {}} />);
  const checkbox = await screen.findByRole("checkbox", { name: "Mark internal for internal-abcdefgh" });
  expect(checkbox).toHaveProperty("checked", true);
  expect(screen.getByTitle("internal-abcdefgh")).toBeTruthy();
});

test("ticking internal calls PUT with {internal:true} and refetches", async () => {
  mockedAdminGet.mockResolvedValue(guests);
  mockedAdminPut.mockResolvedValue();
  render(<GuestsSection token="token" onGuestOpen={() => {}} />);
  fireEvent.click(await screen.findByRole("checkbox", { name: "Mark internal for student-abcdefgh" }));
  await waitFor(() => expect(mockedAdminPut).toHaveBeenCalledWith("/guests/student-abcdefgh/internal", "token", { internal: true }));
  await waitFor(() => expect(mockedAdminGet).toHaveBeenCalledTimes(2));
});

test("a failed toggle reverts the checkbox and shows an error", async () => {
  mockedAdminGet.mockResolvedValue(guests);
  mockedAdminPut.mockRejectedValue(new Error("down"));
  render(<GuestsSection token="token" onGuestOpen={() => {}} />);
  const checkbox = await screen.findByRole("checkbox", { name: "Mark internal for student-abcdefgh" }) as HTMLInputElement;
  fireEvent.click(checkbox);
  expect(await screen.findByText("Could not update internal status.")).toBeTruthy();
  expect(checkbox.checked).toBe(false);
});

test("a refresh failure after a successful toggle keeps the optimistic internal flag", async () => {
  mockedAdminGet.mockResolvedValueOnce(guests).mockRejectedValueOnce(new Error("refresh down"));
  mockedAdminPut.mockResolvedValue();
  render(<GuestsSection token="token" onGuestOpen={() => {}} />);
  const checkbox = await screen.findByRole("checkbox", { name: "Mark internal for student-abcdefgh" }) as HTMLInputElement;
  fireEvent.click(checkbox);
  expect(await screen.findByText("Updated internal status, but could not refresh the list.")).toBeTruthy();
  expect(checkbox.checked).toBe(true);
});

test("clicking an id opens the timeline with sessions newest first", async () => {
  mockedAdminGet.mockImplementation((path) => Promise.resolve(path === "/guests" ? guests : detail));
  function Harness() {
    const [open, setOpen] = useState<string | null>(null);
    return open ? <GuestTimeline token="token" guestId={open} onClose={() => setOpen(null)} /> : <GuestsSection token="token" onGuestOpen={setOpen} />;
  }
  render(<Harness />);
  fireEvent.click(await screen.findByRole("button", { name: "internal" }));
  const newest = await screen.findByText("session-new");
  const oldest = screen.getByText("session-old");
  expect(Boolean(newest.compareDocumentPosition(oldest) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
});

test("closing the timeline returns to the list", async () => {
  mockedAdminGet.mockImplementation((path) => Promise.resolve(path === "/guests" ? guests : detail));
  function Harness() {
    const [open, setOpen] = useState<string | null>("internal-abcdefgh");
    return open ? <GuestTimeline token="token" guestId={open} onClose={() => setOpen(null)} /> : <GuestsSection token="token" onGuestOpen={setOpen} />;
  }
  render(<Harness />);
  fireEvent.click(await screen.findByRole("button", { name: "Close timeline" }));
  expect(await screen.findByTitle("internal-abcdefgh")).toBeTruthy();
});

test("guest dates are readable local times, not raw ISO strings", async () => {
  mockedAdminGet.mockResolvedValue(guests);
  render(<GuestsSection token="token" onGuestOpen={() => {}} />);
  await screen.findByRole("button", { name: "internal" });
  expect(screen.queryByText("2026-10-19T00:00:00Z")).toBeNull();
  expect(screen.getAllByText(/19 Oct.*07:00/).length).toBeGreaterThan(0); // 00:00Z is 07:00 in Ho Chi Minh
});
