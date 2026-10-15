import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTracker, FLUSH_AFTER_MS, MAX_BATCH } from "@/lib/track";

const photoProps = { has_photo: false, has_text: true, text_len: 4, had_events: false, queued: false };

describe("track", () => {
  const send = vi.fn();
  const beacon = vi.fn();
  let tracker: ReturnType<typeof createTracker>;

  const setup = () => createTracker({ send, beacon, now: () => new Date("2026-10-15T09:00:00.000Z") });

  beforeEach(() => {
    vi.useFakeTimers();
    send.mockReset().mockResolvedValue({ accepted: 0, rejected: [] });
    beacon.mockReset().mockReturnValue(true);
    tracker = setup();
  });
  afterEach(() => {
    tracker.dispose();
    vi.useRealTimers();
  });

  it("flushes after 5 seconds with the event shape", async () => {
    tracker.track("message_sent", photoProps, "s1");
    tracker.track("photo_removed");
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(FLUSH_AFTER_MS);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual([
      { type: "message_sent", at: "2026-10-15T09:00:00.000Z", session_id: "s1", props: photoProps },
      { type: "photo_removed", at: "2026-10-15T09:00:00.000Z", session_id: null, props: {} },
    ]);
  });

  it("flushes at 20 queued events, without waiting", () => {
    for (let i = 0; i < 19; i++) tracker.track("photo_removed");
    expect(send).not.toHaveBeenCalled();
    tracker.track("photo_removed");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toHaveLength(20);
  });

  it("sends batches of at most 50 events", async () => {
    // Three slow sends of 20 all fail together, so 60 events come back to the queue at once.
    const rejects: ((e: Error) => void)[] = [];
    send.mockImplementation(() => new Promise((_, reject) => rejects.push(reject)));
    for (let i = 0; i < 60; i++) tracker.track("photo_removed");
    expect(send).toHaveBeenCalledTimes(3);
    rejects.forEach((reject) => reject(new Error("down")));
    send.mockReset().mockResolvedValue({});
    await vi.advanceTimersByTimeAsync(FLUSH_AFTER_MS);
    expect(send.mock.calls.map(([batch]) => batch.length)).toEqual([MAX_BATCH, 10]);
  });

  it("sends the queue with a beacon on pagehide", () => {
    tracker.track("empty_state_shown");
    window.dispatchEvent(new Event("pagehide"));
    expect(beacon).toHaveBeenCalledTimes(1);
    const body = JSON.parse(beacon.mock.calls[0][0]);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].type).toBe("empty_state_shown");
    expect(send).not.toHaveBeenCalled();
    // Nothing is left for the timer.
    vi.advanceTimersByTime(FLUSH_AFTER_MS);
    expect(send).not.toHaveBeenCalled();
  });

  it("sends a beacon when the page becomes hidden, but not when visible", () => {
    tracker.track("empty_state_shown");
    const state = vi.spyOn(document, "visibilityState", "get");
    state.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(beacon).not.toHaveBeenCalled();
    state.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(beacon).toHaveBeenCalledTimes(1);
    state.mockRestore();
  });

  it("retries a failed batch once, then drops it, and never throws", async () => {
    send.mockRejectedValue(new Error("down"));
    tracker.track("photo_removed");
    await vi.advanceTimersByTimeAsync(FLUSH_AFTER_MS); // first send fails, requeued
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(FLUSH_AFTER_MS); // retry fails, dropped
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(FLUSH_AFTER_MS * 3);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("survives a send that throws synchronously and a beacon that throws", () => {
    send.mockImplementation(() => {
      throw new Error("boom");
    });
    beacon.mockImplementation(() => {
      throw new Error("boom");
    });
    tracker.track("photo_removed");
    expect(() => tracker.flush()).not.toThrow();
    tracker.track("photo_removed");
    expect(() => window.dispatchEvent(new Event("pagehide"))).not.toThrow();
  });

  it("rejects content props at compile time", () => {
    // @ts-expect-error text is not a prop of message_sent
    tracker.track("message_sent", { ...photoProps, text: "hello" });
    // @ts-expect-error a required prop is missing
    tracker.track("workspace_shown", { replaced: false });
    // @ts-expect-error props are required when the type has some
    tracker.track("app_opened");
  });
});
