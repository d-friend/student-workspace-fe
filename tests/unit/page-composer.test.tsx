import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import Page from "@/app/page";
import * as api from "@/lib/api";
import { copy } from "@/lib/copy";
import { fixtures } from "@/workspace/fixtures";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  createGuest: vi.fn().mockResolvedValue({ guestId: "g", created: false }),
  currentSession: vi.fn().mockResolvedValue(null),
  createSession: vi.fn().mockResolvedValue({ sessionId: "s" }),
  listSessions: vi.fn().mockResolvedValue({ sessions: [], next_before: null }),
  authMethods: vi.fn().mockResolvedValue({ google: false, email: false }),
  getMe: vi.fn().mockResolvedValue({ signed_in: false }),
  turn: vi.fn(),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each([false, true])("hands the only composer to chat during unfold and back on close (desktop=%s)", async (desktop) => {
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({
    matches: desktop && query === "(min-width: 800px)",
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as MediaQueryList);
  let build!: () => void;
  vi.mocked(api.turn).mockImplementationOnce((_session, _message, onDelta, onEvent) => new Promise(resolve => {
    build = () => {
      onEvent!({ event: "workspace", workspaceId: "w", phase: "solve", doc: fixtures["solve-tangent.json"] });
      onDelta("Xong rồi.");
      resolve({ turnId: "t", stopReason: "end_turn" });
    };
  }));
  const { container } = render(<Page />);
  await waitFor(() => expect(api.currentSession).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText(copy.inputLabel), { target: { value: "__build" } });
  fireEvent.keyDown(screen.getByLabelText(copy.inputLabel), { key: "Enter" });
  await waitFor(() => expect(build).toBeTypeOf("function"));
  await act(async () => { build(); });
  expect(container.querySelector('[data-unfold="flying"]')).not.toBeNull();

  fireEvent.click(screen.getByRole("button", { name: copy.petOpen }));
  expect(screen.getByRole("dialog", { name: copy.drawerLabel })).toBeDefined();
  // getAllByLabelText deliberately includes hidden/inert nodes, like Playwright getByLabel.
  expect(screen.getAllByLabelText(copy.inputLabel)).toHaveLength(1);
  expect(container.querySelector("main textarea")).toBeNull();

  fireEvent.keyDown(screen.getByRole("dialog", { name: copy.drawerLabel }), { key: "Escape" });
  expect(screen.getAllByLabelText(copy.inputLabel)).toHaveLength(1);
  expect(container.querySelector('[role="dialog"][data-leaving] textarea')).toBeNull();
});
