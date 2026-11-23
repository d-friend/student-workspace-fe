import { describe, expect, it } from "vitest";
import { ApiError, type Pack } from "@/lib/api";
import { copy, setLocale } from "@/lib/copy";
import { badPages, excerpt, learnMoreMessage, packStage, retryStage, subjectOf, uploadError } from "@/lib/pack";

const file = (status: Pack["files"][number]["status"]) => ({ id: status, ordinal: 0, status, media_type: "image/jpeg" });

describe("packStage", () => {
  it("reads photos while any is pending, then finds the subject", () => {
    expect(packStage({ status: "extracting", files: [file("ok"), file("pending")] })).toBe("reading");
    expect(packStage({ status: "extracting", files: [file("ok"), file("unreadable")] })).toBe("subject");
  });
  it("passes the other statuses through, merging as merging", () => {
    expect(packStage({ status: "merging", files: [] })).toBe("merging");
    for (const status of ["needs_subject", "ready", "partial", "failed"] as const) expect(packStage({ status, files: [] })).toBe(status);
  });
});

it("lists the photos that need the student, numbered from 1", () => {
  expect(badPages({ files: [file("ok"), file("unreadable"), file("failed"), file("pending")] })).toEqual([
    { n: 2, status: "unreadable" }, { n: 3, status: "failed" },
  ]);
});

it("retries the stage that failed, and the first one for anything unknown", () => {
  expect(retryStage({ error: "concepts:empty" })).toBe("concepts");
  expect(retryStage({ error: "subject:bad_output" })).toBe("subject");
  expect(retryStage({ error: "merge:internal" })).toBe("merge");
  expect(retryStage({ error: "extract:upstream" })).toBe("extract");
  expect(retryStage({ error: null })).toBe("extract");
});

it("tells an upload error from the code", () => {
  setLocale("vi");
  const err = (code: string) => new ApiError(400, code, "x");
  expect(uploadError(err("packs_unavailable"))).toEqual({ text: copy.packUnavailable, unavailable: true });
  expect(uploadError(err("rate_limited")).text).toBe(copy.packLimitDay);
  expect(uploadError(err("too_many_photos")).text).toBe(copy.packTooMany(10));
  expect(uploadError(new Error("network"))).toEqual({ text: copy.packUploadFailed, unavailable: false });
});

describe("the learn-more message", () => {
  setLocale("vi");
  it("quotes the notes, in one line", () => {
    expect(learnMoreMessage("Định luật Ôm", [{ text: "# U = I.R\n\n  ghi  chú" }, { text: "b" }], "tóm tắt"))
      .toBe("Mình muốn hiểu kĩ hơn: Định luật Ôm. Vở của mình ghi: «# U = I.R ghi chú b»");
  });
  it("falls back to the summary when no block is left", () => {
    expect(excerpt([], " tóm tắt ")).toBe("tóm tắt");
  });
  it("cuts at 600 characters on a word", () => {
    const text = excerpt([{ text: "từ ".repeat(400) }], "");
    expect(text.length).toBeLessThanOrEqual(601);
    expect(text.endsWith("…")).toBe(true);
    expect(text.endsWith(" …")).toBe(false);
  });
});

it("finds the subject of a node", () => {
  const nodes = [{ id: "s", parent_id: null }, { id: "t", parent_id: "s" }, { id: "x", parent_id: "t" }];
  expect([subjectOf(nodes, "x"), subjectOf(nodes, "s"), subjectOf(nodes, "zzz")]).toEqual(["s", "s", null]);
});
