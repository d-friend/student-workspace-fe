import { afterEach, expect, test, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { adminGet, adminPost, clearToken, readToken, saveToken } from "@/lib/admin";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

test("adminGet sends the bearer header and parses json", async () => {
  const fetchMock = vi.fn().mockResolvedValue(json(200, { turns: 4 }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(adminGet<{ turns: number }>("/health?days=7", "secret-token")).resolves.toEqual({ turns: 4 });
  expect(fetchMock).toHaveBeenCalledWith("/api/admin/health?days=7", { headers: { Authorization: "Bearer secret-token" } });
});

test("adminGet turns a 404 into an ApiError with status 404", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(404, { error: { code: "not_found", message: "not found" } })));

  const error = await adminGet("/health", "wrong").catch((reason) => reason);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status: 404, code: "not_found" });
});

test("saveToken then readToken round-trips and clearToken removes it", () => {
  saveToken("admin-token");
  expect(readToken()).toBe("admin-token");
  clearToken();
  expect(readToken()).toBeNull();
});

test("readToken returns null when sessionStorage throws", () => {
  const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });

  expect(readToken()).toBeNull();
  getItem.mockRestore();
});

test("adminPost sends the bearer header and the json body, and parses the reply", async () => {
  const fetchMock = vi.fn().mockResolvedValue(json(201, { id: "s1" }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(adminPost<{ id: string }>("/sheets", "secret-token", { title: "t" })).resolves.toEqual({ id: "s1" });
  expect(fetchMock).toHaveBeenCalledWith("/api/admin/sheets", {
    method: "POST",
    headers: { Authorization: "Bearer secret-token", "content-type": "application/json" },
    body: JSON.stringify({ title: "t" }),
  });
});

test("adminPost turns a 400 into an ApiError that carries the server's message", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(400, { error: { code: "invalid_item", message: "line 2: no such workspace", line: 2 } })));

  const error = await adminPost("/sheets", "token", {}).catch((reason) => reason);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status: 400, code: "invalid_item", message: "line 2: no such workspace" });
});
