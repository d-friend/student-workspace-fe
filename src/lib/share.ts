type ShareTarget = {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
};

export async function shareWorkspace(origin: string, workspaceId: string, title: string, target: ShareTarget) {
  const url = `${origin}/s/${encodeURIComponent(workspaceId)}`;
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
