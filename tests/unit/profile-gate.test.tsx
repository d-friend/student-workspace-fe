import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ProfileGate } from "@/components/ProfileGate";
import { ApiError, getMe, saveProfile, skipProfile } from "@/lib/api";
import { copy } from "@/lib/copy";

vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), getMe: vi.fn(), saveProfile: vi.fn(), skipProfile: vi.fn() }));
beforeEach(() => { vi.mocked(getMe).mockResolvedValue({ signed_in: false, profile_needed: true }); vi.mocked(saveProfile).mockResolvedValue(); vi.mocked(skipProfile).mockResolvedValue(); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const renderGate = () => render(<ProfileGate><button>Child</button></ProfileGate>);
const fill = () => {
  fireEvent.change(screen.getByLabelText(copy.profileNickname), { target: { value: "  An  " } });
  fireEvent.change(screen.getByLabelText(copy.profileProvince), { target: { value: " Hà Nội " } });
  fireEvent.change(screen.getByLabelText(copy.profileGrade), { target: { value: "8" } });
  fireEvent.change(screen.getByLabelText(copy.profileSchool), { target: { value: " Trường A " } });
};
const submit = () => fireEvent.click(screen.getByRole("button", { name: copy.profileStart }));

test("keeps children mounted and inert while needed, then restores them after save", async () => {
  renderGate();
  const child = screen.getByText("Child");
  const wrapper = child.parentElement!;
  expect(wrapper.hasAttribute("inert")).toBe(false);
  const name = await screen.findByLabelText(copy.profileNickname);
  expect(document.activeElement).toBe(name);
  expect(screen.getByText("Child")).toBe(child);
  expect(wrapper.hasAttribute("inert")).toBe(true);
  expect(wrapper.getAttribute("aria-hidden")).toBe("true");
  fill(); submit();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText("Child")).toBe(child);
  expect(wrapper.hasAttribute("inert")).toBe(false);
  expect(wrapper.hasAttribute("aria-hidden")).toBe(false);
  expect(saveProfile).toHaveBeenCalledExactlyOnceWith({ nickname: "An", province: "Hà Nội", grade: 8, school: "Trường A" });
});

test("hold does not mount children while loading or needed", async () => {
  render(<ProfileGate hold><button>Child</button></ProfileGate>);
  expect(screen.queryByText("Child")).toBeNull();
  await screen.findByLabelText(copy.profileNickname);
  expect(screen.queryByText("Child")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: copy.profileSkip }));
  await screen.findByText("Child");
});

test("hold renders children when no profile is needed or the check fails", async () => {
  vi.mocked(getMe).mockResolvedValueOnce({ signed_in: false, profile_needed: false });
  const view = render(<ProfileGate hold><button>Child</button></ProfileGate>);
  await screen.findByText("Child");
  view.unmount();
  vi.mocked(getMe).mockRejectedValueOnce(new Error("offline"));
  render(<ProfileGate hold><button>Child</button></ProfileGate>);
  await screen.findByText("Child");
});

test("validates required fields and lengths, describes errors and focuses the first", async () => {
  renderGate();
  await screen.findByLabelText(copy.profileNickname);
  submit();
  for (const label of [copy.profileNickname, copy.profileProvince, copy.profileGrade, copy.profileSchool]) {
    const field = screen.getByLabelText(label);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    const ids = field.getAttribute("aria-describedby")!.split(" ");
    expect(ids.some((id) => id.endsWith("-error") && document.getElementById(id))).toBe(true);
  }
  expect(document.activeElement).toBe(screen.getByLabelText(copy.profileNickname));
  fill();
  fireEvent.change(screen.getByLabelText(copy.profileNickname), { target: { value: "x".repeat(41) } });
  fireEvent.change(screen.getByLabelText(copy.profileProvince), { target: { value: "x".repeat(61) } });
  fireEvent.change(screen.getByLabelText(copy.profileSchool), { target: { value: "x".repeat(121) } });
  submit();
  expect(saveProfile).not.toHaveBeenCalled();
  expect(screen.getByText(copy.profileSchoolError)).toBeTruthy();
});

test("maps server field errors and allows retry after generic failures", async () => {
  vi.mocked(saveProfile).mockRejectedValueOnce(new ApiError(422, "invalid_profile", "invalid", undefined, ["school"])).mockRejectedValueOnce(new Error("offline"));
  renderGate(); await screen.findByLabelText(copy.profileNickname); fill(); submit();
  await waitFor(() => expect(screen.getByLabelText(copy.profileSchool).getAttribute("aria-invalid")).toBe("true"));
  expect(document.activeElement).toBe(screen.getByLabelText(copy.profileSchool));
  submit();
  expect((await screen.findByRole("alert")).textContent).toBe(copy.profileFailed);
  submit();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});


test("keeps keyboard focus inside the dialog", async () => {
  renderGate();
  const first = await screen.findByLabelText(copy.profileNickname);
  const last = screen.getByRole("button", { name: copy.profileSkip });
  fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(last);
  fireEvent.keyDown(last, { key: "Tab" });
  expect(document.activeElement).toBe(first);
});


test("skips without sending typed fields and reveals children", async () => {
  renderGate();
  await screen.findByLabelText(copy.profileNickname);
  fill();
  fireEvent.click(screen.getByRole("button", { name: copy.profileSkip }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(skipProfile).toHaveBeenCalledExactlyOnceWith();
  expect(saveProfile).not.toHaveBeenCalled();
});

test("a failed skip still reveals children", async () => {
  vi.mocked(skipProfile).mockRejectedValue(new Error("offline"));
  renderGate();
  fireEvent.click(await screen.findByRole("button", { name: copy.profileSkip }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByRole("alert")).toBeNull();
});

test("Escape uses the same skip path", async () => {
  renderGate();
  const name = await screen.findByLabelText(copy.profileNickname);
  fireEvent.keyDown(name, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(skipProfile).toHaveBeenCalledExactlyOnceWith();
});

test("both actions are disabled while skipping and Escape cannot start another request", async () => {
  vi.mocked(skipProfile).mockReturnValue(new Promise(() => {}));
  renderGate();
  const skip = await screen.findByRole("button", { name: copy.profileSkip });
  fireEvent.click(skip);
  expect(skip).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: copy.profileStart })).toHaveProperty("disabled", true);
  fireEvent.keyDown(screen.getByLabelText(copy.profileNickname), { key: "Escape" });
  expect(skipProfile).toHaveBeenCalledTimes(1);
});


test("both actions are disabled while saving", async () => {
  vi.mocked(saveProfile).mockReturnValue(new Promise(() => {}));
  renderGate();
  await screen.findByLabelText(copy.profileNickname);
  fill();
  submit();
  expect(screen.getByRole("button", { name: copy.profileStart })).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: copy.profileSkip })).toHaveProperty("disabled", true);
});
