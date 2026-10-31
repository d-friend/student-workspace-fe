import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { TeX } from "@/workspace/TeX";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test.each([false, true])("Vietnamese math labels render without compatibility warnings (display=%s)", (display) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const tex = String.raw`x_{\text{chỉ số}} = 2 \quad \text{độ dài đường thẳng}`;
  const { container } = render(<TeX tex={tex} display={display} />);
  expect(container.querySelector(".katex")).not.toBeNull();
  expect(container.querySelector(".katex-error")).toBeNull();
  expect(container.querySelector(".katex-html")?.textContent).toContain("ỉ");
  expect(container.querySelector("annotation")?.textContent).toBe(tex);
  expect(warn).not.toHaveBeenCalled();
});

test("invalid math remains an error and unsafe commands cannot create links", () => {
  const { container } = render(<>
    <TeX tex={String.raw`\frac{`} display={false} />
    <TeX tex={String.raw`\href{javascript:alert(1)}{x}`} display={false} />
  </>);
  expect(container.querySelector(".katex-error")).not.toBeNull();
  expect(container.querySelector("a, [href], [onclick]")).toBeNull();
});
