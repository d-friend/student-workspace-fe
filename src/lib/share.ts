type ShareTarget = {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
};

export function shareUrl(origin: string, path: string) {
  return `${origin}${path}`;
}

export async function shareWorkspace(origin: string, path: string, title: string, target: ShareTarget) {
  const url = shareUrl(origin, path);
  if (target.share) {
    try {
      await target.share({ url, title });
      return "shared" as const;
    } catch (error) {
      if ((error as { name?: string } | null)?.name === "AbortError") return "cancelled" as const;
      throw error;
    }
  }
  if (!target.clipboard) throw new Error("Clipboard unavailable");
  await target.clipboard.writeText(url);
  return "copied" as const;
}
