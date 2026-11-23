import type { ApiError, Pack, PackBlock } from "./api";
import { copy } from "./copy";

export const MAX_PACK_PHOTOS = 10; // Mirrors backend pack_max_photos.
const EXCERPT_MAX = 600;

export type PackStage = "reading" | "subject" | "merging" | "needs_subject" | "ready" | "partial" | "failed";

// Where a pack is, in the order the sheet shows it: reading photos, finding the subject, updating the tree.
export function packStage(pack: Pick<Pack, "status" | "files">): PackStage {
  if (pack.status === "extracting") return pack.files.some(f => f.status === "pending") ? "reading" : "subject";
  return pack.status === "merging" ? "merging" : pack.status;
}

// The pages that need the student: a blurry photo is retaken, a failed one is retried.
export function badPages(pack: Pick<Pack, "files">): { n: number; status: "unreadable" | "failed" }[] {
  return pack.files.flatMap((f, i) => f.status === "unreadable" || f.status === "failed" ? [{ n: i + 1, status: f.status }] : []);
}

export function retryStage(pack: Pick<Pack, "error">): "extract" | "subject" | "concepts" | "merge" {
  const stage = pack.error?.split(":")[0];
  return stage === "subject" || stage === "concepts" || stage === "merge" ? stage : "extract";
}

export function uploadError(e: unknown): { text: string; unavailable: boolean } {
  const code = (e as ApiError | undefined)?.code;
  if (code === "packs_unavailable") return { text: copy.packUnavailable, unavailable: true };
  if (code === "rate_limited") return { text: copy.packLimitDay, unavailable: false };
  if (code === "too_many_photos") return { text: copy.packTooMany(MAX_PACK_PHOTOS), unavailable: false };
  return { text: copy.packUploadFailed, unavailable: false };
}

// What the student wrote, as the first words of a learn-more message: at most 600 characters, cut at a word.
export function excerpt(blocks: Pick<PackBlock, "text">[], fallback: string): string {
  const text = (blocks.map(b => b.text).join(" ").replace(/\s+/g, " ").trim()) || fallback.trim();
  if (text.length <= EXCERPT_MAX) return text;
  const cut = text.slice(0, EXCERPT_MAX);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), EXCERPT_MAX / 2))}…`;
}

export function learnMoreMessage(name: string, blocks: Pick<PackBlock, "text">[], summary: string): string {
  return copy.packLearnMoreMessage(name, excerpt(blocks, summary));
}
