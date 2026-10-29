import { expect, test } from "vitest";
import { readSse } from "@/lib/sse";

function responseOf(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream);
}

async function collect(chunks: string[]) {
  const out = [];
  for await (const ev of readSse(responseOf(chunks))) out.push(ev);
  return out;
}

test("parses events split mid-line and mid-event, and skips the ping comment", async () => {
  const wire = ': ping\n\nevent: text\ndata: {"delta": "Mình"}\n\nevent: done\ndata: {"turn_id": "t1", "stop_reason": "end_turn"}\n\n';
  // One character per chunk: every boundary is exercised.
  const events = await collect(wire.split(""));
  expect(events).toEqual([
    { event: "text", data: { delta: "Mình" } },
    { event: "done", data: { turn_id: "t1", stop_reason: "end_turn" } },
  ]);
});

test("an incomplete event at the end of the stream is dropped", async () => {
  expect(await collect(['event: text\ndata: {"delta": "x"}'])).toEqual([]);
});


test("preserves workspace replacement and active ids across chunk boundaries", async () => {
  const wire = 'event: workspace\ndata: {"workspace_id":"S2","phase":"solve","doc":{},"replaces":"S1"}\n\nevent: active\ndata: {"workspace_id":"L1"}\n\n';
  expect(await collect(wire.split(""))).toEqual([
    { event: "workspace", data: { workspace_id: "S2", phase: "solve", doc: {}, replaces: "S1" } },
    { event: "active", data: { workspace_id: "L1" } },
  ]);
});
