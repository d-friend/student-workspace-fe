const JPEG_PREFIX = "data:image/jpeg;base64,";
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
