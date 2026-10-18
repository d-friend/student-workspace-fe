import { expect, test } from "vitest";
import { placePet, type Rect } from "@/lib/pet-place";

const stage: Rect = { left: 0, top: 0, right: 1440, bottom: 900 };
const column: Rect = { left: 312, top: 0, right: 1128, bottom: 900 };
const at = (top: number, h = 40): Rect => ({ left: 400, top, right: 1000, bottom: top + h });
const base = { column, stage, pet: 88, bubbleW: 300 };

test("anchor in the middle: lane beside the column, centred on the anchor", () => {
  const p = placePet({ ...base, anchor: at(300) });
  expect(p).toEqual({ mode: "lane", left: 1152, top: 320 - 44, side: "above", flip: false });
});

test("a wide stage has room for the bubble to the right of the pet", () => {
  const wide = { ...stage, right: 1700 };
  const p = placePet({ ...base, stage: wide, anchor: at(300) });
  expect(p).toMatchObject({ mode: "lane", left: 1152, side: "right" });
});

test("top is clamped inside the stage", () => {
  expect(placePet({ ...base, anchor: at(-500) })).toMatchObject({ top: 8 });
  expect(placePet({ ...base, anchor: at(2000) })).toMatchObject({ top: 900 - 88 - 8 });
});

test("a lane narrower than the pet docks", () => {
  expect(placePet({ ...base, column: { ...column, right: 1400 }, anchor: at(300) })).toEqual({ mode: "dock" });
});

test("the lane must leave a bubble at least 200px: 199 docks, 200 stays", () => {
  // stage 1440, column.right + 24 = left; lane = 1440 - left
  expect(placePet({ ...base, column: { ...column, right: 1217 }, anchor: at(300) })).toEqual({ mode: "dock" }); // lane 199
  expect(placePet({ ...base, column: { ...column, right: 1216 }, anchor: at(300) })).toMatchObject({ mode: "lane", left: 1240, side: "above" }); // lane 200
});

test("no anchor or no column docks", () => {
  expect(placePet({ ...base, anchor: null })).toEqual({ mode: "dock" });
  expect(placePet({ ...base, column: null, anchor: at(300) })).toEqual({ mode: "dock" });
});

test("a pet in the lower 40% of the stage flips", () => {
  expect(placePet({ ...base, anchor: at(700) })).toMatchObject({ flip: true });
  expect(placePet({ ...base, anchor: at(100) })).toMatchObject({ flip: false });
});
