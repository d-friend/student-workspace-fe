import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";
import { KIT_CSS } from "@/lib/workspace-kit";

function cssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? cssFiles(path) : entry.isFile() && path.endsWith(".css") ? [path] : [];
  });
}

function violations(file: string, css: string, firstLine = 1): string[] {
  // Preserve line offsets while ignoring declarations in comments.
  const source = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  return [...source.matchAll(/\bborder-radius\s*:\s*([^;}]+)/g)].flatMap((match) => {
    const value = match[1].trim();
    const parts = value.split(/\s+/);
    const pixels = [...value.matchAll(/(?:\d*\.)?\d+px\b/gi)];
    const allowedTail = parts.length > 1 && parts.filter((part) => part === "4px").length === 1 && parts.every((part) => part === "4px" || part === "0" || part === "50%" || /^var\(--[\w-]+\)$/.test(part));
    // The kit's 6px-high hint indicator deliberately keeps its 3px end caps.
    const kitBar = file === "src/lib/workspace-kit.ts" && value === "3px" && /\.df-hint::after\s*\{[^{}]*$/.test(source.slice(0, match.index));
    if (pixels.every((pixel) => /^0(?:\.0+)?px$/i.test(pixel[0])) || allowedTail || kitBar) return [];
    const line = firstLine + source.slice(0, match.index).split("\n").length - 1;
    return [`${file}:${line}: ${value}`];
  });
}

test("border radii use shared tokens", () => {
  const kitPath = "src/lib/workspace-kit.ts";
  const kitSource = readFileSync(kitPath, "utf8");
  const kitStart = kitSource.indexOf("export const KIT_CSS = `") + "export const KIT_CSS = `".length;
  const kitFirstLine = kitSource.slice(0, kitStart).split("\n").length;
  const errors = cssFiles("src").flatMap((file) => violations(relative(".", file), readFileSync(file, "utf8")));
  errors.push(...violations(kitPath, KIT_CSS, kitFirstLine));
  expect(errors, `Raw border-radius values:\n${errors.join("\n")}`).toEqual([]);
});


test("iframe radius tokens match the app", () => {
  const app = readFileSync("src/app/globals.css", "utf8");
  for (const [name, value] of Object.entries({ sm: "8px", md: "12px", lg: "16px" })) {
    const declaration = new RegExp(`--radius-${name}:\\s*${value};`);
    expect(app).toMatch(declaration);
    expect(KIT_CSS).toMatch(declaration);
  }
});
