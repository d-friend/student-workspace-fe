import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

afterEach(cleanup);

test("renders a React component in jsdom", () => {
  render(<p>xin chào</p>);
  expect(screen.getByText("xin chào")).toBeTruthy();
});
