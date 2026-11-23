import { afterEach, expect, test, vi } from "vitest";
import { createPack, createSession, getMapNode, getProject, getReader, listProjects, listSessions, moveSession } from "@/lib/api";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
// A fresh Response per call: a body can be read once.
const stub = (response: Response) => { const fetchMock = vi.fn().mockImplementation(async () => response.clone()); vi.stubGlobal("fetch", fetchMock); return fetchMock; };
const sent = (fetchMock: ReturnType<typeof vi.fn>) => JSON.parse(fetchMock.mock.calls[0][1].body);
afterEach(() => vi.unstubAllGlobals());

test("the read endpoints hit the contract paths and unwrap their lists", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(json(200, { projects: [{ id: "p1" }] }))
    .mockResolvedValueOnce(json(200, { id: "p1", map: [], packs: [] }))
    .mockResolvedValueOnce(json(200, { pages: [{ pack_id: "k1", blocks: [] }] }))
    .mockResolvedValueOnce(json(200, { node: { id: "n1" }, project_id: "p1", blocks: [], pack_ids: [] }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await listProjects()).toEqual([{ id: "p1" }]);
  expect((await getProject("p1")).id).toBe("p1");
  expect(await getReader("p1")).toEqual([{ pack_id: "k1", blocks: [] }]);
  expect((await getMapNode("n1")).project_id).toBe("p1");
  expect(fetchMock.mock.calls.map(c => c[0])).toEqual(["/api/projects", "/api/projects/p1", "/api/projects/p1/reader", "/api/map-nodes/n1"]);
});

test("a missing projects list reads as empty, not undefined", async () => {
  stub(json(200, {}));
  expect(await listProjects()).toEqual([]);
});

test("a project id is sent only when there is one", async () => {
  let fetchMock = stub(json(200, { session_id: "s1" }));
  await createSession("typed");
  expect(sent(fetchMock)).toEqual({ started_via: "typed" });
  fetchMock = stub(json(200, { session_id: "s1" }));
  await createSession("pack_learn_more", "p1");
  expect(sent(fetchMock)).toEqual({ started_via: "pack_learn_more", project_id: "p1" });
  fetchMock = stub(json(202, { id: "k1" }));
  await createPack(["abc"]);
  expect(sent(fetchMock)).toEqual({ photos: [{ media_type: "image/jpeg", data: "abc" }] });
  fetchMock = stub(json(202, { id: "k1" }));
  await createPack(["abc"], "p1");
  expect(sent(fetchMock).project_id).toBe("p1");
});

test("listSessions filters by project", async () => {
  const fetchMock = stub(json(200, { sessions: [], next_before: null }));
  await listSessions(undefined, 20, "p1");
  expect(fetchMock).toHaveBeenLastCalledWith("/api/sessions?limit=20&project_id=p1");
  await listSessions("c", 5);
  expect(fetchMock).toHaveBeenLastCalledWith("/api/sessions?limit=5&before=c");
});

test("moving a session sends the project, or null to take it out", async () => {
  let fetchMock = stub(json(200, {}));
  await moveSession("s1", "p1");
  expect(fetchMock.mock.calls[0][0]).toBe("/api/sessions/s1");
  expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
  expect(sent(fetchMock)).toEqual({ project_id: "p1" });
  fetchMock = stub(json(200, {}));
  await moveSession("s1", null);
  expect(sent(fetchMock)).toEqual({ project_id: null });
  stub(json(404, { error: { code: "not_found" } }));
  await expect(moveSession("s1", "someone-elses")).rejects.toMatchObject({ status: 404 });
});
