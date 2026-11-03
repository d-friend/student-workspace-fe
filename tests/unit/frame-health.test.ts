import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { frameDoc } from "@/lib/frame";

// Run the bridge script of a workspace frame in the jsdom window, with the browser pieces it reads replaced.
type Entry = { isIntersecting: boolean };
let observers: ((entries: Entry[]) => void)[] = [];
let reports: string[] = [];
let stage: HTMLElement;
let rect = { left: 0, top: 0, width: 400, height: 300 };
let covering: Element | null = null;

function bridgeScript() {
  const doc = frameDoc("", "http://localhost:3000");
  const scripts = [...doc.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  return scripts[0];
}

function setVisibility(v: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
  document.dispatchEvent(new Event("visibilitychange"));
}

const sees = (isIntersecting: boolean) => observers.at(-1)!([{ isIntersecting }]);

beforeEach(() => {
  vi.useFakeTimers();
  observers = [];
  reports = [];
  rect = { left: 0, top: 0, width: 400, height: 300 };
  covering = null;
  stage = document.createElement("div");
  stage.className = "sim-stage";
  stage.getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: 0, y: 0, toJSON() {} }) as DOMRect;
  document.body.append(stage);
  document.elementFromPoint = () => covering ?? stage;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  vi.stubGlobal("IntersectionObserver", class { constructor(cb: (e: Entry[]) => void) { observers.push(cb); } observe() {} });
  vi.stubGlobal("ResizeObserver", class { observe() {} });
  vi.spyOn(window, "postMessage").mockImplementation(((msg: { event?: { type: string; data: { message: string } } }) => {
    if (msg?.event?.type === "workspace_error") reports.push(msg.event.data.message);
  }) as never);
  new Function(bridgeScript())();
  window.dispatchEvent(new Event("load"));
});

afterEach(() => {
  stage.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("a stage the student never sees is never judged, however long the page lives", () => {
  vi.advanceTimersByTime(60_000);
  expect(reports).toEqual([]);
  sees(false); // a hidden tab: the zero-size stage is not an error
  rect = { left: 0, top: 0, width: 0, height: 0 };
  vi.advanceTimersByTime(60_000);
  expect(reports).toEqual([]);
});

test("a visible stage in a background browser tab is not judged until the tab is shown", () => {
  setVisibility("hidden");
  sees(true);
  rect = { left: 0, top: 0, width: 0, height: 0 };
  vi.advanceTimersByTime(30_000);
  expect(reports).toEqual([]);
  rect = { left: 0, top: 0, width: 400, height: 300 };
  setVisibility("visible");
  vi.advanceTimersByTime(2_999);
  expect(reports).toEqual([]);
  vi.advanceTimersByTime(2);
  expect(reports).toEqual([]); // a healthy stage passes the check
});

test("a visible stage covered by another element is reported once, 3s after it became visible", () => {
  covering = document.createElement("section");
  sees(true);
  vi.advanceTimersByTime(2_999);
  expect(reports).toEqual([]);
  vi.advanceTimersByTime(2);
  expect(reports).toEqual(["stage is covered by section"]);
  setVisibility("hidden");
  setVisibility("visible");
  sees(false);
  sees(true);
  vi.advanceTimersByTime(30_000);
  expect(reports).toEqual(["stage is covered by section"]); // judged once per page
});

test("hiding the stage before the 3 seconds are up cancels the check; showing it again starts a new wait", () => {
  covering = document.createElement("section");
  sees(true);
  vi.advanceTimersByTime(2_000);
  sees(false);
  vi.advanceTimersByTime(10_000);
  expect(reports).toEqual([]);
  sees(true);
  vi.advanceTimersByTime(2_999);
  expect(reports).toEqual([]);
  vi.advanceTimersByTime(2);
  expect(reports).toEqual(["stage is covered by section"]);
});

test("a visible stage that is still 0x0 is reported", () => {
  const io = observers.at(-1)!;
  io([{ isIntersecting: true }]);
  rect = { left: 0, top: 0, width: 0, height: 0 };
  vi.advanceTimersByTime(3_001);
  expect(reports).toEqual(["stage has no size"]);
});

test("a blank canvas is not an error (a simulation may wait for play)", () => {
  const canvas = document.createElement("canvas");
  canvas.width = 300;
  canvas.height = 200;
  stage.append(canvas);
  sees(true);
  vi.advanceTimersByTime(3_001);
  expect(reports).toEqual([]);
});

test("a canvas with no size is still reported", () => {
  const canvas = document.createElement("canvas");
  canvas.width = 0;
  stage.append(canvas);
  sees(true);
  vi.advanceTimersByTime(3_001);
  expect(reports).toEqual(["canvas has no size"]);
});

test("the old blank-canvas check is gone from the bridge", () => {
  expect(bridgeScript()).not.toContain("canvas is blank");
  expect(bridgeScript()).not.toContain("getImageData");
});
