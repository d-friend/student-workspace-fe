import { expect, test } from "vitest";
import { countPercent, daysAgo } from "@/app/admin/BusinessSection";

test("business formatters use counts and Vietnam calendar days", () => {
  expect(countPercent(12, 20)).toBe("12 / 20 (60%)");
  expect(countPercent(0, 0)).toBe("—");
  const now = new Date("2026-11-13T18:00:00Z");
  expect(daysAgo("2026-11-14", now)).toBe("today");
  expect(daysAgo("2026-11-12", now)).toBe("2d ago");
});
