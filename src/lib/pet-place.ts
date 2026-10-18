export type Rect = { left: number; top: number; right: number; bottom: number };
export type Place =
  | { mode: "dock" }
  | { mode: "lane"; left: number; top: number; side: "right" | "above"; flip: boolean };

const GAP = 24; // between the doc column and the pet
const EDGE = 8; // keep the pet this far inside the stage
const LANE_MIN = 200; // narrowest lane that still leaves a readable bubble; narrower docks
const RIGHT_MIN = 316; // lane width that fits the bubble to the right of the pet

// The pet stands in the lane right of the doc column, level with the anchor; it docks when the lane is too narrow.
// bubbleW is part of the contract with PetLayer; the right/above switch uses RIGHT_MIN.
export function placePet({ anchor, column, stage, pet }: { anchor: Rect | null; column: Rect | null; stage: Rect; pet: number; bubbleW: number }): Place {
  if (!anchor || !column) return { mode: "dock" };
  const left = column.right + GAP;
  const lane = stage.right - left;
  if (lane < Math.max(pet + 16, LANE_MIN)) return { mode: "dock" };
  const mid = (anchor.top + anchor.bottom) / 2;
  const top = Math.min(Math.max(mid - pet / 2, stage.top + EDGE), stage.bottom - pet - EDGE);
  const flip = top + pet / 2 > stage.top + (stage.bottom - stage.top) * 0.6;
  return { mode: "lane", left, top, side: lane >= RIGHT_MIN ? "right" : "above", flip };
}
