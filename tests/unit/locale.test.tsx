import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { LocaleBoundary } from "@/components/LocaleBoundary";
import { copy, detectLocale, setLocale } from "@/lib/copy";

afterEach(() => setLocale("vi"));

test("picks the first supported browser language, else Vietnamese", () => {
  expect(detectLocale(["en-US", "vi"])).toBe("en");
  expect(detectLocale(["fr-FR", "vi-VN"])).toBe("vi");
  expect(detectLocale(["fr-FR"])).toBe("vi");
});

test("LocaleBoundary renders English for an English browser", () => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-GB"]);
  const Send = () => <>{copy.send}</>;
  render(
    <LocaleBoundary>
      <Send />
    </LocaleBoundary>,
  );
  expect(screen.getByText("Send")).toBeTruthy();
  expect(document.documentElement.lang).toBe("en");
});
