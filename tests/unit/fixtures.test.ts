import { describe, expect, it } from "vitest";
import { fixtures } from "@/workspace/fixtures";

const TYPES = ["heading", "text", "math", "image", "callout", "example", "quiz", "problem", "steps", "graph", "geometry", "custom"];
const docs = Object.entries(fixtures);

describe("workspace fixtures", () => {
  it("every fixture satisfies the schema rules", () => {
    for (const [name, d] of docs) {
      expect(d.version, name).toBe(1);
      expect(d.title.length, name).toBeLessThanOrEqual(80);
      expect(d.blocks.length, name).toBeGreaterThanOrEqual(1);
      expect(d.blocks.length, name).toBeLessThanOrEqual(30);
      expect(d.blocks.filter((b) => b.type === "custom").length, name).toBeLessThanOrEqual(1);
      expect(d.blocks.filter((b) => b.type === "callout").length, name).toBeLessThanOrEqual(2);
      if (d.phase !== "learn") expect(d.blocks.filter((b) => b.type === "problem").length, name).toBe(1);
      for (const b of d.blocks) {
        expect(b.id, name).toMatch(/^[a-z][a-z0-9_]{0,23}$/);
        if (b.type === "quiz") {
          if (b.answer === "choice") expect(b.options?.length, b.id).toBeGreaterThanOrEqual(2);
          if (b.answer === "choice") expect(b.options?.length, b.id).toBeLessThanOrEqual(5);
          else expect(b.options, b.id).toBeUndefined();
        }
        if (b.type === "example") expect(b.steps.length).toBeGreaterThanOrEqual(1);
        if (b.type === "example") expect(b.steps.length).toBeLessThanOrEqual(8);
        if (b.type === "custom") expect(b.height >= 200 && b.height <= 900).toBe(true);
        if (b.type === "image") expect([b.alt, b.credit, b.source_url].every(Boolean), b.id).toBe(true);
        if (b.type === "steps") expect(d.blocks.some((p) => p.type === "problem" && p.id === b.problem_id), b.id).toBe(true);
      }
    }
  });

  it("block ids are unique per doc", () => {
    for (const [name, d] of docs) {
      const ids = d.blocks.map((b) => b.id);
      expect(new Set(ids).size, name).toBe(ids.length);
    }
  });

  it("each block type has a fixture", () => {
    for (const t of TYPES) {
      expect(fixtures[`${t}.json`]?.blocks.some((b) => b.type === t), t).toBe(true);
    }
  });

  it("learn docs end with a quiz", () => {
    for (const [name, d] of docs.filter(([, d]) => d.phase === "learn" && d.blocks.length > 3)) {
      expect(d.blocks.at(-1)?.type, name).toBe("quiz");
    }
  });

  it("no em-dash or en-dash in user-visible strings", () => {
    for (const [name, d] of docs) expect(JSON.stringify(d), name).not.toMatch(/[–—]/);
  });
});
