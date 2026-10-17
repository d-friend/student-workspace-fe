// CSS-module class names are hashed under vitest, so match the `scroll` class by substring.
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { Md } from "@/workspace/md";

afterEach(cleanup);

const r = (text: string) => render(<Md text={text} />).container;

test("paragraphs and line breaks", () => {
  const c = r("one\ntwo\n\nthree");
  const ps = c.querySelectorAll("p");
  expect(ps).toHaveLength(2);
  expect(ps[0].querySelectorAll("br")).toHaveLength(1);
  expect(ps[0].textContent).toBe("onetwo");
});

test("bold and italic", () => {
  const c = r("a **b** and *c*");
  expect(c.querySelector("strong")?.textContent).toBe("b");
  expect(c.querySelector("em")?.textContent).toBe("c");
});

test("lists one level", () => {
  const u = r("- a\n- b");
  expect(u.querySelectorAll("ul > li")).toHaveLength(2);
  cleanup();
  const o = r("1. a\n2. b\n3. c");
  expect(o.querySelectorAll("ol > li")).toHaveLength(3);
});

test("inline and display math render katex", () => {
  const c = r("x $a^2$ y\n\n$$\\frac{1}{2}$$");
  expect(c.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
  expect(c.querySelector('[class*="scroll"] .katex-display')).not.toBeNull();
});

test("html is literal", () => {
  const c = r("<b>x</b><script>");
  expect(c.textContent).toBe("<b>x</b><script>");
  expect(c.querySelector("b, script")).toBeNull();
});

test("links, headings, tables are literal", () => {
  const src = "# H\n\n[a](http://x.y) ![i](u)\n\n| a | b |";
  const c = r(src);
  expect(c.querySelector("a, img, h1, table")).toBeNull();
  expect(c.textContent).toContain("# H");
  expect(c.textContent).toContain("[a](http://x.y)");
  expect(c.textContent).toContain("| a | b |");
});

test("bad tex does not throw", () => {
  expect(() => r("$\\notacommand{$ and $$\\frac{$$")).not.toThrow();
});

test("test_wide_math_scrolls_in_box", () => {
  const c = r("$$a+b+c+d+e+f+g+h+i+j+k+l+m+n+o+p$$");
  expect(c.querySelector('[class*="scroll"] .katex-display')).not.toBeNull();
});

test("display math inside text and lists has no div inside p or li", () => {
  const spy = vi.spyOn(console, "error");
  const c = r("Ta có $$x^2$$ suy ra y\n\n- a $$z$$ b");
  expect(c.querySelector("p div, li div")).toBeNull();
  expect(c.querySelector('p [class*="scroll"] .katex-display')).not.toBeNull();
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});

test("display math is left-aligned in the CSS module", () => {
  const css = readFileSync("src/workspace/TeX.module.css", "utf8");
  expect(css).toMatch(/\.katex-display\)\s*\{[^}]*text-align:\s*left/);
});

test("hostile tex produces no links or javascript:", () => {
  const c = r("$\\href{javascript:alert(1)}{x}$ and $\\htmlClass{x}{y}$");
  expect(c.querySelector("a[href]")).toBeNull();
  // The source survives only as inert annotation text, never as an attribute.
  expect(c.querySelector('[href], [src], [onclick]')).toBeNull();
  expect(c.innerHTML).not.toMatch(/(href|src)=/);
});
