import { existsSync } from "node:fs";
import { expect, test } from "vitest";
import { KIT_CSS } from "@/lib/workspace-kit";
import {
  eventMessage,
  frameDoc,
  shouldTrigger,
  studentView,
  userMessage,
  watching,
  withPhoto,
} from "@/lib/frame";

const O = "http://localhost:3000";
const img = { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: "AAAA" } };

test("frameDoc puts the doctype, policy, base and bridge before the agent's document", () => {
  const doc = frameDoc("<p>agent</p>", O);
  expect(doc.startsWith("<!doctype html>")).toBe(true);
  expect(doc.endsWith("<p>agent</p>")).toBe(true);
  const csp = doc.indexOf(
    `content="default-src 'unsafe-inline' data: blob:; script-src 'unsafe-inline' 'unsafe-eval' ${O}/vendor/; style-src 'unsafe-inline' ${O}/vendor/; font-src ${O}/vendor/"`,
  );
  const base = doc.indexOf(`<base target="_blank">`);
  const bridge = doc.indexOf("window.dfriend");
  expect(csp).toBeGreaterThan(0);
  expect(base).toBeGreaterThan(csp);
  expect(bridge).toBeGreaterThan(base);
  expect(bridge).toBeLessThan(doc.indexOf("<p>agent</p>"));
});

test("frameDoc injects the kit CSS after the bridge and before the agent's document", () => {
  const doc = frameDoc("<p>agent</p>", O);
  const kit = doc.indexOf(KIT_CSS);
  expect(kit).toBeGreaterThan(doc.indexOf("window.dfriend"));
  expect(kit).toBeLessThan(doc.indexOf("<p>agent</p>"));
});

test("frameDoc bridge marks student actions and reports errors once", () => {
  const doc = frameDoc("", O);
  for (const s of ["byStudent", "gesture", "pointerdown", "keydown", "isTrusted", "workspace_error", "unhandledrejection"]) {
    expect(doc.includes(s), s).toBe(true);
  }
});

test("shouldTrigger", () => {
  expect(shouldTrigger([{ type: "answer", byStudent: true, gesture: 1 }], 0)).toBe(true);
  expect(shouldTrigger([{ type: "workspace_error", byStudent: false, gesture: 0 }], 0)).toBe(true);
  expect(shouldTrigger([], 0)).toBe(false);
});

test("shouldTrigger ignores events the student did not cause", () => {
  expect(shouldTrigger([{ type: "tick", byStudent: false, gesture: 1 }, { type: "tick" }], 0)).toBe(false);
});

test("shouldTrigger fires on a completion the student did not cause", () => {
  expect(shouldTrigger([{ type: "task_completed", byStudent: false }], 0)).toBe(true);
});

test("shouldTrigger fires once per student gesture", () => {
  const ticks = [
    { type: "tick", byStudent: true, gesture: 1 },
    { type: "tick", byStudent: true, gesture: 1 },
  ];
  expect(shouldTrigger(ticks, 1)).toBe(false);
  expect(shouldTrigger([...ticks, { type: "answer", byStudent: true, gesture: 2 }], 1)).toBe(true);
});

test("userMessage", () => {
  const ev = [{ type: "answer", data: 1, byStudent: true }];
  expect(userMessage([], "is this right?")).toBe("is this right?");
  expect(userMessage(ev, "")).toBe(eventMessage(ev));
  expect(userMessage(ev, "is this right?")).toBe(eventMessage(ev) + "\n\nis this right?");
});

test("eventMessage formats a batch", () => {
  expect(eventMessage([{ type: "answer", data: { value: 4 } }])).toBe('[workspace] [{"type":"answer","data":{"value":4}}]');
});

test("eventMessage keeps the last 20 events", () => {
  const events = Array.from({ length: 25 }, (_, i) => ({ type: "tick", data: i }));
  const list = JSON.parse(eventMessage(events).slice("[workspace] ".length));
  expect(list.length).toBe(20);
  expect(list[0].data).toBe(5);
  expect(list[19].data).toBe(24);
});

test("eventMessage drops oversized data", () => {
  const list = JSON.parse(eventMessage([{ type: "big", data: "x".repeat(5000) }]).slice("[workspace] ".length));
  expect(list).toEqual([{ type: "big", data: "[omitted: too large]" }]);
});

test("withPhoto", () => {
  expect(withPhoto("hi", null)).toBe("hi");
  expect(withPhoto("", "AAAA")).toEqual([img]);
  expect(withPhoto("câu 2", "AAAA")).toEqual([img, { type: "text", text: "câu 2" }]);
});

test("studentView", () => {
  expect(studentView("hi")).toEqual({ text: "hi", photo: null });
  expect(studentView('[workspace] [{"type":"x"}]')).toBeNull();
  expect(studentView('[workspace] [{"type":"x"}]\n\nhi')).toEqual({ text: "hi", photo: null });
  expect(studentView([img])).toEqual({ text: "", photo: "AAAA" });
  expect(studentView([img, { type: "text", text: "[workspace] []\n\nhi" }])).toEqual({ text: "hi", photo: "AAAA" });
});

test("watching", () => {
  const u = { role: "user" as const, content: "x" };
  expect(watching([u, { role: "assistant", content: "[silent]" }])).toBe(true);
  expect(watching([u, { role: "assistant", content: "```html\n<p>x</p>\n```" }])).toBe(true);
  expect(watching([u, { role: "assistant", content: "Xem lại dòng 2." }])).toBe(false);
  expect(watching([u])).toBe(false);
  // A code-routed workspace batch has no reply: look past it to the last visible message.
  const batch = { role: "user" as const, content: '[workspace] [{"type":"line_checked"}]' };
  expect(watching([u, { role: "assistant", content: "[silent]" }, batch, batch])).toBe(true);
  expect(watching([u, { role: "assistant", content: "Xem lại dòng 2." }, batch])).toBe(false);
  expect(watching([])).toBe(false);
});

test("frame csp allows vendor fonts", () => {
  expect(frameDoc("", O)).toContain(`font-src ${O}/vendor/"`);
});

test("frame head declares be vietnam pro", () => {
  const doc = frameDoc("", O);
  for (const w of [400, 500, 600])
    for (const s of ["latin", "vietnamese"]) expect(doc).toContain(`${O}/vendor/fonts/BeVietnamPro-${s}-${w}.woff2`);
  expect(doc).toContain("font-display:swap");
  expect(doc).toContain("U+0102-0103");
  expect(doc).toContain('font-family: "Be Vietnam Pro", system-ui, sans-serif');
});

test("kit control edges use --control-border", () => {
  expect(KIT_CSS).not.toMatch(/\.df-hint \{[^}]*1px solid var\(--border\)/);
});

test("frame head maps three to files that exist, before any author script", () => {
  const doc = frameDoc("<script>x</script>", O);
  const map = JSON.parse(doc.match(/<script type="importmap">(.*?)<\/script>/)![1]).imports as Record<string, string>;
  expect(Object.keys(map)).toEqual(["three", "three/addons/"]);
  for (const url of Object.values(map)) expect(url.startsWith(`${O}/vendor/three@`)).toBe(true);
  expect(existsSync(`public${map.three.slice(O.length)}`)).toBe(true);
  expect(existsSync(`public${map["three/addons/"].slice(O.length)}controls/OrbitControls.js`)).toBe(true);
  expect(doc.indexOf("importmap")).toBeLessThan(doc.indexOf("<script>x"));
});
