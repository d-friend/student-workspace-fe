import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { frameDoc } from "@/lib/frame";

test("manifest identifies and hashes every versioned vendor file", () => {
  const root = resolve("public/vendor");
  const manifest = readFileSync(`${root}/MANIFEST.md`, "utf8");
  for (const dir of readdirSync(root).filter((name) => name.includes("@"))) {
    for (const file of readdirSync(`${root}/${dir}`, { recursive: true, withFileTypes: true })) {
      if (!file.isFile()) continue;
      const path = resolve(file.parentPath, file.name);
      const relative = path.slice(root.length + 1);
      const bytes = readFileSync(path);
      const row = manifest.split("\n").find((line) => line.includes(`\`${relative}\``));
      expect(row, relative).toBeDefined();
      expect(row).toContain(String(bytes.length));
      expect(row).toContain(createHash("sha256").update(bytes).digest("hex"));
      expect(row).toContain("https://");
    }
  }
});

test("every library load in the planner table resolves to a vendored file", () => {
  const prompt = readFileSync("../backend/app/agent/simulator.md", "utf8");
  const table = prompt.split("\n").filter((line) => line.startsWith("| ") && line.includes("<script"));
  expect(table).toHaveLength(5);
  const origin = "https://dfriend.test";
  const imports = JSON.parse(frameDoc("", origin).match(/<script type="importmap">(.*?)<\/script>/)![1]).imports;
  for (const row of table) {
    const loads = [...row.matchAll(/(?:src=|from )"([^"]+)"/g)].map((match) => match[1]);
    expect(loads.length).toBeGreaterThan(0);
    for (const load of loads) {
      const url = load.startsWith("/vendor/") ? load : imports[load] ?? imports["three/addons/"] + load.slice("three/addons/".length);
      const path = new URL(url, origin).pathname;
      expect(path.startsWith("/vendor/")).toBe(true);
      expect(readFileSync(`public${path}`).length).toBeGreaterThan(0);
    }
  }
});
