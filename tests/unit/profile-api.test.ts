import { afterEach, expect, test, vi } from "vitest";
import { ApiError, saveProfile, skipProfile } from "@/lib/api";

const profile = { nickname: "An", province: "Hà Nội", grade: 8, school: "Trường A" };
afterEach(() => vi.unstubAllGlobals());

test("saves the profile with PUT and retries after no_guest", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "no_guest" } }), { status: 401 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ guest_id: "g", created: true }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ profile_needed: false }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await saveProfile(profile);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  for (const call of [fetchMock.mock.calls[0], fetchMock.mock.calls[2]]) {
    expect(call[0]).toBe("/api/guest/profile");
    expect(call[1].method).toBe("PUT");
    expect(JSON.parse(call[1].body)).toEqual(profile);
  }
  expect(fetchMock.mock.calls[1][0]).toBe("/api/guest");
});

test("retains server field names without exposing its message", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "invalid_profile", message: "sensitive", fields: ["school"] } }), { status: 422 })));
  try { await saveProfile(profile); throw new Error("expected failure"); } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).fields).toEqual(["school"]);
    expect((error as ApiError).message).toBe("Profile could not be saved");
  }
});


test("skips with an empty POST and retries after no_guest", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "no_guest" } }), { status: 401 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ guest_id: "g", created: true }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ profile_needed: false }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await skipProfile();
  expect(fetchMock).toHaveBeenCalledTimes(3);
  for (const call of [fetchMock.mock.calls[0], fetchMock.mock.calls[2]]) {
    expect(call[0]).toBe("/api/guest/profile/skip");
    expect(call[1].method).toBe("POST");
    expect(JSON.parse(call[1].body)).toEqual({});
  }
  expect(fetchMock.mock.calls[1][0]).toBe("/api/guest");
});
