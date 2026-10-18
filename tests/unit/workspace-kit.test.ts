import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { KIT_CSS } from "@/lib/workspace-kit";

// pnpm test runs from the frontend root.
const demo = readFileSync(resolve("tests/fixtures/kit-demo.html"), "utf8");

// The classes of spec 8.2. Every one needs a rule, or the agent's markup looks unstyled.
const SPEC_CLASSES = ["df-problem", "df-steps", "df-step", "df-step-n", "df-entry", "df-actions", "df-hint", "df-idea", "df-done"];

test.each(SPEC_CLASSES)("the kit styles .%s", (name) => {
  expect(KIT_CSS).toContain(`.${name}`);
});

test("every class in the demo fixture has a rule", () => {
  const used = [...demo.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(" "));
  expect(used.length).toBeGreaterThan(0);
  for (const name of used) expect(KIT_CSS).toContain(`.${name}`);
});

test("the kit carries its own light and dark tokens, since the iframe cannot read the app's", () => {
  expect(KIT_CSS).toContain(":root");
  expect(KIT_CSS).toContain("--accent: #15171c");
  expect(KIT_CSS).toContain('[data-theme="dark"]');
  expect(KIT_CSS).not.toContain("prefers-color-scheme"); // light unless the student chose dark
  expect(KIT_CSS).toContain("--accent: #e7e9ee");
});
