export const JPEG_PREFIX = "data:image/jpeg;base64,";
export const MAX_PHOTOS = 4; // Mirrors backend max_photos_per_message.
const MAX_EDGE = 1568;

export type PhotoResult = { data: string; bytes: number; width: number; height: number; processMs: number };

// Decoded size of a base64 string.
export function base64Bytes(b64: string): number {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return (b64.length * 3) / 4 - padding;
}

// Downscale to a JPEG (long edge at most 1568px). Returns base64 without the data-URL prefix.
export async function readPhoto(file: Blob): Promise<PhotoResult> {
  const started = performance.now();
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  // JPEG has no alpha: a transparent PNG would turn black without the white fill.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  try {
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }
  const url = canvas.toDataURL("image/jpeg", 0.85);
  if (!url.startsWith(JPEG_PREFIX)) throw new Error("not jpeg");
  const data = url.slice(JPEG_PREFIX.length);
  return {
    data,
    bytes: base64Bytes(data),
    width: canvas.width,
    height: canvas.height,
    processMs: Math.round(performance.now() - started),
  };
}

// The subject page sends a problem to home as ?q=, but photos are too big for a URL: they cross the full page load in sessionStorage.
const HANDOFF_PHOTOS = "dfriend.handoff.photos";

// Data URLs as readPhoto's output gives them, with the prefix put back. False when the browser refuses the write (quota, private mode).
export function stashHandoffPhotos(photos: string[]): boolean {
  try {
    sessionStorage.setItem(HANDOFF_PHOTOS, JSON.stringify(photos.map((data) => JPEG_PREFIX + data)));
    return true;
  } catch {
    return false;
  }
}

// The page did not navigate after all: nothing may be left for the next visit to home to send.
export function discardHandoffPhotos(): void {
  try {
    sessionStorage.removeItem(HANDOFF_PHOTOS);
  } catch {
    // Nothing was stored if storage refuses.
  }
}

// Reads and removes the handed-over photos, as base64 without the prefix. Anything that is not a JPEG data URL is dropped.
export function takeHandoffPhotos(): string[] {
  try {
    const raw = sessionStorage.getItem(HANDOFF_PHOTOS);
    sessionStorage.removeItem(HANDOFF_PHOTOS);
    const list: unknown = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((url): url is string => typeof url === "string" && url.startsWith(JPEG_PREFIX) && url.length > JPEG_PREFIX.length)
      .map((url) => url.slice(JPEG_PREFIX.length))
      .slice(0, MAX_PHOTOS);
  } catch {
    return [];
  }
}
