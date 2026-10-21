import { expect, test } from "vitest";
import nextConfig from "../../next.config";

test("vendor fonts are served with CORS for the opaque-origin iframe", async () => {
  const rules = await nextConfig.headers!();
  const rule = rules.find((r) => r.source === "/vendor/:path*");
  expect(rule?.headers).toContainEqual({ key: "Access-Control-Allow-Origin", value: "*" });
});

test("versioned vendor folders are cached forever", async () => {
  const rules = await nextConfig.headers!();
  const rule = rules.find((r) => r.source.startsWith("/vendor/:dir("));
  expect(rule?.headers).toContainEqual({ key: "Cache-Control", value: "public, max-age=31536000, immutable" });
});
