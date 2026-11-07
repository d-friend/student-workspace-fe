import { expect, test, vi } from "vitest";
import { shareUrl, shareWorkspace } from "@/lib/share";

test("shares the workspace URL and title with native sharing", async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  const writeText = vi.fn();
  expect(await shareWorkspace("https://app.example", "/s/w1", "Bài học", { share, clipboard: { writeText } })).toBe("shared");
  expect(share).toHaveBeenCalledWith({ url: "https://app.example/s/w1", title: "Bài học" });
  expect(writeText).not.toHaveBeenCalled();
});

test("copies an encoded workspace link when native sharing is unavailable", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  expect(await shareWorkspace("https://app.example", "/s/a%2Fb", "Bài học", { clipboard: { writeText } })).toBe("copied");
  expect(writeText).toHaveBeenCalledWith("https://app.example/s/a%2Fb");
});

test("ignores cancellation without copying a link", async () => {
  const writeText = vi.fn();
  const share = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"));
  expect(await shareWorkspace("https://app.example", "/s/w1", "Bài học", { share, clipboard: { writeText } })).toBe("cancelled");
  expect(writeText).not.toHaveBeenCalled();
});

test("lets the caller show sharing and clipboard failures", async () => {
  const error = new Error("Unavailable");
  await expect(shareWorkspace("https://app.example", "/s/w1", "Bài học", { share: vi.fn().mockRejectedValue(error) })).rejects.toBe(error);
  await expect(shareWorkspace("https://app.example", "/s/w1", "Bài học", { clipboard: { writeText: vi.fn().mockRejectedValue(error) } })).rejects.toBe(error);
});

test("builds workspace and session URLs from paths", () => {
  expect(shareUrl("https://app.example", "/s/w1")).toBe("https://app.example/s/w1");
  expect(shareUrl("https://app.example", "/s/session/s1")).toBe("https://app.example/s/session/s1");
});
