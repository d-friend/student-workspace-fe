import { expect, test } from "vitest";
import { change, changeMoney, changePts, countPercent, daysAgo } from "@/app/admin/BusinessSection";

test("count changes include signed whole percentages and handle zero baselines", () => {
  expect(change(15, 12)).toBe("+3 (+25%) vs prev");
  expect(change(18, 20)).toBe("−2 (−10%) vs prev");
  expect(change(8, 8)).toBe("0 (0%) vs prev");
  expect(change(3, 0)).toBe("—");
  expect(change(5, 8)).toBe("−3 (−38%) vs prev");
});

test("rate changes use percentage points and handle missing rates", () => {
  expect(changePts(0.6, 0.5)).toBe("+10 pts vs prev");
  expect(changePts(0.45, 0.5)).toBe("−5 pts vs prev");
  expect(changePts(0.5, 0.5)).toBe("0 pts vs prev");
  expect(changePts(null, 0.5)).toBe("—");
  expect(changePts(0.5, null)).toBe("—");
});

test("money changes use the existing currency precision and handle missing baselines", () => {
  expect(changeMoney(1, 0.8)).toBe("+$0.2000 (+25%) vs prev");
  expect(changeMoney(0.8, 1)).toBe("−$0.2000 (−20%) vs prev");
  expect(changeMoney(1, 1)).toBe("$0.0000 (0%) vs prev");
  expect(changeMoney(null, 1)).toBe("—");
  expect(changeMoney(1, null)).toBe("—");
  expect(changeMoney(1, 0)).toBe("—");
});

test("business formatters use counts and Vietnam calendar days", () => {
  expect(countPercent(12, 20)).toBe("12 / 20 (60%)");
  expect(countPercent(0, 0)).toBe("—");
  const now = new Date("2026-11-13T18:00:00Z");
  expect(daysAgo("2026-11-14", now)).toBe("today");
  expect(daysAgo("2026-11-12", now)).toBe("2d ago");
});
