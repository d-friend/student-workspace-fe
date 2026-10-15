import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { useWorkspace } from "@/hooks/useWorkspace";

it("wires the controller into React: input, a typed turn, and the screen", async () => {
  const api = {
    createGuest: vi.fn().mockResolvedValue({ guestId: "g", created: true }),
    currentSession: vi.fn().mockResolvedValue(null),
    createSession: vi.fn().mockResolvedValue({ sessionId: "s1" }),
    endSession: vi.fn().mockResolvedValue(undefined),
    turn: vi.fn(async (_s: string, _m: unknown[], onDelta: (t: string) => void) => {
      onDelta("Chào bạn.");
      return { turnId: "t", stopReason: "end_turn" };
    }),
  };
  const { result } = renderHook(() => useWorkspace({ api: api as never, track: vi.fn() as never }));
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.screen).toBe("empty");

  act(() => result.current.setInput("xin chào"));
  expect(result.current.input).toBe("xin chào");
  await act(async () => {
    await result.current.submit();
  });
  expect(result.current.input).toBe("");
  expect(result.current.bubbles.map((b) => b.text)).toEqual(["xin chào", "Chào bạn."]);
  expect(result.current.busy).toBe(false);
});
