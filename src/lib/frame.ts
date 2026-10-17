// Port of public/frame.js. The workspace iframe is srcdoc, so this builds its document and its messages.
import type { ImageBlock, Message, TextBlock } from "./api";
import { parse } from "./parse";
import { KIT_CSS } from "./workspace-kit";

// Built from parts so this source file never contains a literal closing script tag.
const SCRIPT_END = "</scr" + "ipt>";

const head = (origin: string) => `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'unsafe-inline' data: blob:; script-src 'unsafe-inline' 'unsafe-eval' ${origin}/vendor/; style-src 'unsafe-inline' ${origin}/vendor/"><base target="_blank"><script>
(() => {
let lastTouch = -Infinity, errored = false;
const touch = (e) => { if (e.isTrusted) lastTouch = Date.now(); };
addEventListener("pointerdown", touch, true);
addEventListener("keydown", touch, true);
window.dfriend = { report(type, data) {
  let safe; try { safe = JSON.parse(JSON.stringify(data ?? null)); } catch { safe = null; }
  parent.postMessage({ dfriend: true, event: { type: String(type), data: safe, byStudent: Date.now() - lastTouch < 5000, gesture: lastTouch } }, "*");
} };
const fail = (message) => { if (errored) return; errored = true; window.dfriend.report("workspace_error", { message }); };
addEventListener("error", (e) => fail(String(e.message)));
addEventListener("unhandledrejection", (e) => fail(String(e.reason?.message ?? e.reason)));
})();
${SCRIPT_END}<style>${KIT_CSS}</style>`;

const PREFIX = "[workspace] ";

export type WorkspaceEvent = { type: string; data?: unknown; byStudent?: boolean; gesture?: number };

export function frameDoc(html: string, origin: string): string {
  return head(origin) + html;
}

export function eventMessage(events: WorkspaceEvent[]): string {
  const list = events.slice(-20);
  let json = JSON.stringify(list);
  if (json.length > 4000) json = JSON.stringify(list.map((e) => ({ ...e, data: "[omitted: too large]" })));
  return PREFIX + json;
}

// gesture is the timestamp of the student's last click or keypress; handled is the latest one that already
// started a turn, so one gesture starts at most one turn.
export function shouldTrigger(events: WorkspaceEvent[], handled: number): boolean {
  return events.some(
    (e) => (e.byStudent === true && (e.gesture ?? -Infinity) > handled) || e.type === "workspace_error",
  );
}

export function userMessage(events: WorkspaceEvent[], text: string): string {
  if (!events.length) return text;
  return text ? eventMessage(events) + "\n\n" + text : eventMessage(events);
}

export function withPhoto(content: string, data: string | null): Message["content"] {
  if (data === null) return content;
  const image: ImageBlock = { type: "image", source: { type: "base64", media_type: "image/jpeg", data } };
  return content ? [image, { type: "text", text: content } satisfies TextBlock] : [image];
}

export function studentView(
  content: Message["content"],
): { text: string; photo: string | null } | null {
  const blocks: (ImageBlock | TextBlock)[] = typeof content === "string" ? [] : content;
  const photo = typeof content === "string" ? null : content[0].source.data;
  let text = typeof content === "string" ? content : (blocks.find((b): b is TextBlock => b.type === "text")?.text ?? "");
  const workspace = text.startsWith(PREFIX);
  if (workspace) {
    const i = text.indexOf("\n\n");
    text = i === -1 ? "" : text.slice(i + 2);
  }
  return workspace && !photo && !text ? null : { text, photo };
}

// Skips workspace-only user messages: a code-routed batch is stored with no reply after it.
export function watching(messages: Message[]): boolean {
  const last = messages.findLast((m) => m.role === "assistant" || studentView(m.content) !== null);
  return last?.role === "assistant" && typeof last.content === "string" && parse(last.content).chat === "";
}
