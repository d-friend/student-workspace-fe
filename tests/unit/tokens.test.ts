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

// The light :root and the :root under prefers-color-scheme: dark, from one stylesheet.
function tokens(css: string) {
  const light = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? "";
  const dark = css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/)?.[1] ?? "";
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

  test("new tokens have the spec-workspace 4.1 values", () => {
    expect(app.light).toMatchObject({ "--control-border": "#7d8696", "--idea-bg": "#eef3ff" });
    expect(app.dark).toMatchObject({ "--control-border": "#6b7486", "--idea-bg": "#1c2640" });
  });

  test("dark values match spec-workspace 4.1", () => {
    expect(app.dark).toMatchObject({
      "--bg": "#12151b",
      "--panel": "#1a1e26",
      "--text": "#e7e9ee",
      "--muted": "#a3abb8",
      "--hairline": "#262b35",
      "--border": "#343a46",
      "--accent": "#7da2ff",
      "--accent-text": "#0d1220",
      "--review-bg": "#2b1d10",
      "--review-text": "#ffb27a",
      "--error-bg": "#3a1717",
      "--error-text": "#ffb4b4",
    });
  });
});
