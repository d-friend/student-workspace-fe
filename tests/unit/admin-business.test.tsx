import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import { BusinessSection } from "@/app/admin/BusinessSection";

vi.mock("@/app/admin/sections", () => ({
  Section: ({ title, children }: { title: string; children: ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  UsersSection: () => <section><h2>Users</h2></section>,
  Empty: () => <p>No data</p>,
  Failure: () => <p>Failure</p>,
  Metric: () => <div />,
  money: () => "—",
  percent: () => "—",
  useAdmin: () => ({ data: null, error: false }),
  when: () => "",
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

test("renders UsersSection between Scorecard and return frequency", () => {
  render(<BusinessSection token="token" days={7} onGuestOpen={() => {}} />);

  const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
  expect(headings.indexOf("Scorecard")).toBeLessThan(headings.indexOf("Users"));
  expect(headings.indexOf("Users")).toBeLessThan(headings.indexOf("How often people come back"));
});
