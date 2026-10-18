import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { KIT_CSS } from "@/lib/workspace-kit";

// pnpm test runs from the frontend root.
const appCss = readFileSync(resolve("src/styles/tokens.css"), "utf8");

// { "--name": "value" } for every declaration in a block.
function vars(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

// The light :root and the :root[data-theme="dark"] block, from one stylesheet.
function tokens(css: string) {
  const light = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
  const dark = css.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/)?.[1] ?? "";
  return { light: vars(light), dark: vars(dark) };
}

const app = tokens(appCss);
const kit = tokens(KIT_CSS);

describe("tokens", () => {
  test("kit and app tokens match", () => {
    expect(Object.keys(kit.light).sort()).toEqual(Object.keys(app.light).sort());
    expect(Object.keys(kit.dark).sort()).toEqual(Object.keys(app.dark).sort());
    for (const [name, value] of Object.entries(kit.light)) expect(app.light[name], name).toBe(value);
    for (const [name, value] of Object.entries(kit.dark)) expect(app.dark[name], name).toBe(value);
  });

  test("dark block defines every light token", () => {
    expect(Object.keys(app.dark).sort()).toEqual(Object.keys(app.light).sort());
    expect(Object.keys(kit.dark).sort()).toEqual(Object.keys(kit.light).sort());
  });

  test("light values match spec section 7", () => {
    expect(app.light).toMatchObject({
      "--bg": "#f3f5f7", "--panel": "#ffffff", "--text": "#15171c", "--muted": "#4a4f5c",
      "--border": "#d9dee6", "--hairline": "#e3e6ec", "--accent": "#15171c", "--accent-text": "#ffffff",
      "--brand": "#b4461a", "--pet": "#f27a3d", "--student": "#15171c", "--student-text": "#ffffff", "--agent": "#f1f3f6",
      "--desk": "#e9ecf0", "--desk-dot": "#d3d8df",
    });
  });

  test("dark values match spec section 7", () => {
    expect(app.dark).toMatchObject({
      "--bg": "#12151b", "--panel": "#1a1e26", "--text": "#e7e9ee", "--muted": "#a3abb8",
      "--hairline": "#262b35", "--border": "#343a46", "--accent": "#e7e9ee", "--accent-text": "#12151b",
      "--brand": "#f7b48c", "--pet": "#f27a3d", "--student": "#2a3142", "--student-text": "#e7e9ee", "--agent": "#222833",
      "--review-bg": "#2b1d10", "--review-text": "#ffb27a", "--error-bg": "#3a1717", "--error-text": "#ffb4b4",
      "--desk": "#0f1217", "--desk-dot": "#222833",
    });
  });
});
