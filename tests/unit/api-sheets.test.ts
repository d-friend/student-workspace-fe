import { afterEach, expect, test, vi } from "vitest";
import { currentSession, getSheet, nameSheet, openSheetItem } from "@/lib/api";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

test("getSheet maps the sheet and its items", async () => {
  const fetchMock = vi.fn().mockResolvedValue(json(200, {
    id: "sh 1", title: "Ôn tập HK1", named: true, count: 2, done: 1,
    items: [
      { position: 1, label: "Bài 1", first_line: "Giải phương trình.", state: "done" },
      { position: 2, label: "Bài 2", first_line: "", state: "new" },
    ],
  }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await getSheet("sh 1")).toEqual({
    id: "sh 1", title: "Ôn tập HK1", named: true, count: 2, done: 1,
    items: [
      { position: 1, label: "Bài 1", firstLine: "Giải phương trình.", state: "done" },
      { position: 2, label: "Bài 2", firstLine: "", state: "new" },
    ],
  });
  expect(fetchMock.mock.calls[0][0]).toBe("/api/sheets/sh%201");
});

test("getSheet exposes a missing sheet as a 404 ApiError", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(404, { error: { code: "sheet_not_found", message: "no such sheet" } })));
  await expect(getSheet("gone")).rejects.toMatchObject({ status: 404, code: "sheet_not_found" });
});

test("nameSheet posts the name as JSON and resolves on 204", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(nameSheet("sh1", "An")).resolves.toBeUndefined();
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/sheets/sh1/name");
  expect(init).toMatchObject({ method: "POST", headers: { "content-type": "application/json" } });
  expect(JSON.parse(init.body)).toEqual({ name: "An" });
});

test("nameSheet rejects with the server's error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(429, { error: { code: "rate_limited", message: "slow", scope: "sheet_opens" } })));
  await expect(nameSheet("sh1", "An")).rejects.toMatchObject({ status: 429, code: "rate_limited" });
});

test("openSheetItem posts to the item and returns the session, new or existing", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(json(201, { session_id: "s-new" }))
    .mockResolvedValueOnce(json(200, { session_id: "s-old" }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await openSheetItem("sh1", 3)).toEqual({ sessionId: "s-new" });
  expect(await openSheetItem("sh1", 3)).toEqual({ sessionId: "s-old" });
  expect(fetchMock.mock.calls[0][0]).toBe("/api/sheets/sh1/items/3/open");
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: "{}" });
});

test("openSheetItem exposes name_required", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(409, { error: { code: "name_required", message: "name first" } })));
  await expect(openSheetItem("sh1", 1)).rejects.toMatchObject({ status: 409, code: "name_required" });
});

test("currentSession carries the sheet of a sheet session, and null otherwise", async () => {
  const base = { session_id: "s1", messages: [], html: null, tabs: [], active_workspace_id: null };
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(json(200, { ...base, sheet: { id: "sh1", title: "Ôn tập", position: 2, count: 12 } }))
    .mockResolvedValueOnce(json(200, base)));
  expect((await currentSession())?.sheet).toEqual({ id: "sh1", title: "Ôn tập", position: 2, count: 12 });
  expect((await currentSession())?.sheet).toBeNull();
});
