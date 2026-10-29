import { afterEach, expect, it, vi } from "vitest";
import { createGuest } from "@/lib/api";

afterEach(() => vi.unstubAllGlobals());

it("shares one POST /api/guest between concurrent callers, then allows a new one", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ guest_id: "g1", created: true })));
  vi.stubGlobal("fetch", fetchMock);
  const [a, b] = await Promise.all([createGuest("vi"), createGuest()]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(a).toEqual(b);
  await createGuest();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
