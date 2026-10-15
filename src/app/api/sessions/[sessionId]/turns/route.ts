// Pipes the turn stream from the backend. next.config rewrites buffer a text/event-stream response until it
// ends (measured: 52 chunks direct, 1 read through the rewrite), so this one route proxies by hand.
// Every other /api route stays on the rewrite.
const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const FORWARD = ["content-type", "cookie", "origin", "user-agent", "x-forwarded-for"];

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const headers = new Headers();
  for (const name of FORWARD) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND}/api/sessions/${encodeURIComponent(sessionId)}/turns`, {
      method: "POST",
      cache: "no-store",
      headers,
      body: await request.arrayBuffer(), // at most 8 MB; the backend enforces the cap
      signal: request.signal, // a closed tab aborts the upstream stream, so the backend records client_closed
    });
  } catch {
    return Response.json(
      { error: { code: "backend_unreachable", message: "the backend did not answer" } },
      { status: 502 },
    );
  }

  const out = new Headers();
  for (const name of ["content-type", "retry-after", "x-accel-buffering"]) {
    const value = upstream.headers.get(name);
    if (value !== null) out.set(name, value);
  }
  // no-transform stops Next's compression from holding small SSE chunks back.
  out.set("cache-control", "no-cache, no-transform");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
