// Port of public/frame.js. The workspace iframe is srcdoc, so this builds its document and its messages.
import type { ImageBlock, Message, TextBlock } from "./api";
import { parse } from "./parse";
import { KIT_CSS } from "./workspace-kit";

// Built from parts so this source file never contains a literal closing script tag.
const SCRIPT_END = "</scr" + "ipt>";

const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const VIETNAMESE = "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB";

const fontFaces = (origin: string) =>
  ([["vietnamese", VIETNAMESE], ["latin", LATIN]] as const)
    .flatMap(([subset, range]) =>
      [400, 500, 600].map(
        (w) =>
          `@font-face{font-family:"Be Vietnam Pro";font-style:normal;font-weight:${w};font-display:swap;src:url(${origin}/vendor/fonts/BeVietnamPro-${subset}-${w}.woff2) format("woff2");unicode-range:${range}}`,
      ),
    )
    .join("");

// Iframes of mounted `custom` blocks; the workspace hook accepts bridge messages from these too.
export const customFrames = new Set<Window>();

const head = (origin: string) => `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'unsafe-inline' data: blob:; script-src 'unsafe-inline' 'unsafe-eval' ${origin}/vendor/; style-src 'unsafe-inline' ${origin}/vendor/; font-src ${origin}/vendor/"><base target="_blank"><script>
(() => {
let lastTouch = -Infinity, errored = false;
const touch = (e) => { if (e.isTrusted) lastTouch = Date.now(); };
addEventListener("pointerdown", touch, true);
addEventListener("keydown", touch, true);
window.dfriend = { report(type, data) {
  let safe; try { safe = JSON.parse(JSON.stringify(data ?? null)); } catch { safe = null; }
  parent.postMessage({ dfriend: true, event: { type: String(type), data: safe, byStudent: Date.now() - lastTouch < 5000, gesture: lastTouch } }, "*");
} };
addEventListener("message", (e) => { const t = e.data && e.data.dfriendTheme; if (e.source === parent && (t === "light" || t === "dark")) document.documentElement.dataset.theme = t; });
const fail = (message) => { if (errored) return; errored = true; window.dfriend.report("workspace_error", { message }); };
addEventListener("error", (e) => fail(String(e.message)));
addEventListener("unhandledrejection", (e) => fail(String(e.reason?.message ?? e.reason)));
})();
${SCRIPT_END}<style>${fontFaces(origin)}${KIT_CSS}</style>`;

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
