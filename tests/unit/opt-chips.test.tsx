import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OptChips, orderOpts } from "@/components/rail/OptChips";

const UNSURE = "Mình cũng không chắc";
const WHY = ["Vì cây AA chỉ cho giao tử A", "Vì cây AA cho cả giao tử A và a", UNSURE];

describe("orderOpts", () => {
  it("shuffles a [why] row for some seeds, is stable per seed, and keeps the unsure option last", () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const a = orderOpts(WHY, "why", seed);
      expect(orderOpts(WHY, "why", seed)).toEqual(a);
      expect(a.at(-1)).toBe(UNSURE);
      expect([...a].sort()).toEqual([...WHY].sort());
      orders.add(a.join("|"));
    }
    expect(orders.size).toBe(2); // both orders of the two reasons appear
    expect(orderOpts(WHY, "why", "message-id-7")).toEqual(orderOpts(WHY, "why", "message-id-7"));
  });

  it("does not touch offer or answer rows, and does not mutate its input", () => {
    const copy = [...WHY];
    expect(orderOpts(WHY, "offer", 3)).toEqual(WHY);
    expect(orderOpts(WHY, "answer", 3)).toEqual(WHY);
    orderOpts(WHY, "why", 5);
    expect(WHY).toEqual(copy);
  });

  it("shuffles a why row with no unsure option", () => {
    const opts = ["a", "b", "c"];
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => orderOpts(opts, "why", s).join())).size).toBeGreaterThan(1);
  });
});

describe("OptChips", () => {
  it("highlights no chip on a [why] row", () => {
    const { container } = render(<OptChips options={WHY} kind="why" seed={1} onPick={() => {}} />);
    expect(container.querySelectorAll("button")).toHaveLength(3);
    expect([...container.querySelectorAll("button")].some((b) => /primary/.test(b.className))).toBe(false);
  });

  it("highlights only the first chip on an [offer] row", () => {
    const { container } = render(<OptChips options={["Học kỹ hơn: Alen", "Để sau"]} kind="offer" seed={1} onPick={() => {}} />);
    const [first, second] = [...container.querySelectorAll("button")];
    expect(first.className).toMatch(/primary/);
    expect(second.className).not.toMatch(/primary/);
    expect(screen.getByText("Học kỹ hơn: Alen")).toBeTruthy();
  });
});
