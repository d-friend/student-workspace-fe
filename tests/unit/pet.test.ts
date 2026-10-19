import { describe, expect, test } from "vitest";
import { petMood, type PetInputs } from "@/lib/pet";

const none: PetInputs = { celebrating: false, composing: false, talking: false, doubting: false, working: false, typing: false };

describe("petMood", () => {
  test("idle by default", () => expect(petMood(none)).toBe("idle"));
  test.each([
    [{ celebrating: true, composing: true, talking: true, doubting: true, working: true, typing: true }, "happy"],
    [{ composing: true, talking: true, doubting: true, working: true, typing: true }, "thinking"],
    [{ talking: true, doubting: true, working: true, typing: true }, "talking"],
    [{ doubting: true, working: true, typing: true }, "doubt"],
    [{ working: true, typing: true }, "working"],
    [{ typing: true }, "listening"],
  ] as [Partial<PetInputs>, string][])("%j -> %s", (i, mood) => expect(petMood({ ...none, ...i })).toBe(mood));
});
