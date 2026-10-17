import { expect, test } from "vitest";
import nextConfig from "../../next.config";

test("vendor fonts are served with CORS for the opaque-origin iframe", async () => {
  const rules = await nextConfig.headers!();
  const rule = rules.find((r) => r.source === "/vendor/fonts/:path*");
  expect(rule?.headers).toContainEqual({ key: "Access-Control-Allow-Origin", value: "*" });
});
