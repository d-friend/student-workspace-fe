import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ProfileGate } from "@/components/ProfileGate";
import { getMe, setFeatureEmails, skipProfile } from "@/lib/api";
import { copy } from "@/lib/copy";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), getMe: vi.fn(), setFeatureEmails: vi.fn(), skipProfile: vi.fn() }));
const me = { signed_in: true as const, email: "student@example.com", name: null, profile_needed: false, ask_feature_emails: true };
beforeEach(() => { vi.mocked(getMe).mockResolvedValue(me); vi.mocked(setFeatureEmails).mockResolvedValue(); vi.mocked(skipProfile).mockResolvedValue(); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const renderGate = () => render(<ProfileGate hold><button>Child</button></ProfileGate>);

test("shows only for signed-in users who should be asked", async () => {
  vi.mocked(getMe).mockResolvedValueOnce({ ...me, ask_feature_emails: false });
  const view = renderGate();
  await screen.findByRole("button", { name: "Child" });
  expect(screen.queryByRole("dialog")).toBeNull();
  view.unmount();
  vi.mocked(getMe).mockResolvedValueOnce({ signed_in: false, profile_needed: false, ask_feature_emails: true });
  renderGate();
  await screen.findByRole("button", { name: "Child" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

test.each([false, true])("saves the checkbox value %s and closes", async (checked) => {
  renderGate();
  const checkbox = await screen.findByRole("checkbox", { name: copy.featureEmailLabel }) as HTMLInputElement;
  expect(checkbox.checked).toBe(false);
  await waitFor(() => expect(document.activeElement).toBe(checkbox)); // focus lands in an effect, a tick after the dialog renders
  if (checked) fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole("button", { name: copy.featureEmailDone }));
  expect(setFeatureEmails).toHaveBeenCalledExactlyOnceWith(checked);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("Escape declines and closes even when checked", async () => {
  vi.mocked(setFeatureEmails).mockRejectedValueOnce(new Error("offline"));
  renderGate();
  const checkbox = await screen.findByRole("checkbox", { name: copy.featureEmailLabel });
  fireEvent.click(checkbox);
  fireEvent.keyDown(checkbox, { key: "Escape" });
  expect(setFeatureEmails).toHaveBeenCalledExactlyOnceWith(false);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("waits until the profile dialog is dismissed", async () => {
  vi.mocked(getMe).mockResolvedValueOnce({ ...me, profile_needed: true });
  renderGate();
  await screen.findByLabelText(copy.profileNickname);
  expect(screen.queryByText(copy.featureEmailTitle)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: copy.profileSkip }));
  expect(await screen.findByRole("dialog", { name: copy.featureEmailTitle })).toBeTruthy();
});

test("traps Tab within the dialog", async () => {
  renderGate();
  const checkbox = await screen.findByRole("checkbox", { name: copy.featureEmailLabel });
  const done = screen.getByRole("button", { name: copy.featureEmailDone });
  fireEvent.keyDown(checkbox, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(done);
  fireEvent.keyDown(done, { key: "Tab" });
  await waitFor(() => expect(document.activeElement).toBe(checkbox)); // focus lands in an effect, a tick after the dialog renders
});
