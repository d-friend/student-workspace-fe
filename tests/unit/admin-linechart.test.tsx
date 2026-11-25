import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { LineChart, labelIndices } from "@/app/admin/LineChart";

afterEach(cleanup);

test("axis labels are evenly spaced for every window size and always include the newest point", () => {
  for (let count = 1; count <= 90; count++) {
    const picked = labelIndices(count);
    expect(picked.at(-1)).toBe(count - 1);
    const gaps = new Set(picked.slice(1).map((index, i) => index - picked[i]));
    expect(gaps.size).toBeLessThanOrEqual(1);
    expect(picked.length).toBeLessThanOrEqual(Math.max(count <= 8 ? count : 6, 1));
  }
  expect(labelIndices(7)).toEqual([0, 1, 2, 3, 4, 5, 6]); // a week of days: every day
  expect(labelIndices(12)).toEqual([1, 3, 5, 7, 9, 11]); // twelve weeks: every second, ending on the current week
});

const labels = Array.from({ length: 12 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);
const series = [{ label: "Active", color: "red", values: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 2] }];

test("the weekly chart prints equally spaced labels", () => {
  const { container } = render(<LineChart labels={labels} series={series} label="Weekly" />);
  const shown = Array.from(container.querySelectorAll("svg text")).map((node) => node.textContent).filter((text) => text?.includes("-"));
  expect(shown).toEqual(labelIndices(12).map((i) => labels[i].slice(5)));
});

test("a partial last bucket is a faded dashed segment ending in a hollow point", () => {
  const { container } = render(<LineChart labels={labels} series={series} label="Weekly" partialLast />);
  const segment = container.querySelector("[data-testid=partial-segment]")!;
  expect(segment.getAttribute("stroke-dasharray")).toBe("2 5");
  expect(Number(segment.getAttribute("opacity"))).toBeLessThan(1);
  expect(segment.getAttribute("points")!.split(" ")).toHaveLength(2);
  const dots = Array.from(container.querySelectorAll("circle"));
  expect(dots.filter((dot) => dot.hasAttribute("data-partial"))).toEqual([dots.at(-1)]);
  expect(dots.at(-1)!.getAttribute("fill")).toBe("var(--panel)");
  expect(dots[0].getAttribute("fill")).toBe("red");
  // the solid line stops one point short of the partial one
  expect(container.querySelector("polyline:not([data-testid])")!.getAttribute("points")!.split(" ")).toHaveLength(11);
});

test("a complete series keeps the plain look", () => {
  const { container } = render(<LineChart labels={labels} series={series} label="Weekly" />);
  expect(container.querySelector("[data-testid=partial-segment]")).toBeNull();
  expect(container.querySelectorAll("[data-partial]")).toHaveLength(0);
  expect(container.querySelector("polyline")!.getAttribute("points")!.split(" ")).toHaveLength(12);
});
