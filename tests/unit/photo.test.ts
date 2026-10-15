import { expect, test } from "vitest";
import { base64Bytes } from "@/lib/photo";

test("base64Bytes counts decoded bytes, padding included", () => {
  expect(base64Bytes("AAAA")).toBe(3);
  expect(base64Bytes("AA==")).toBe(1);
  expect(base64Bytes("AAA=")).toBe(2);
});
