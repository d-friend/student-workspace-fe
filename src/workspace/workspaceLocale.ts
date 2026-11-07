import { getLocale, type Locale } from "@/lib/copy";
import type { WorkspaceDoc } from "./types";

// shortcut: diacritics detection; switch to a lang field in the workspace doc if we ever ship a third language.
export function workspaceLocale(doc: WorkspaceDoc): Locale {
  const block = doc.blocks.find((b) => b.type === "problem") ??
    (doc.phase === "learn" ? doc.blocks.find((b) => b.type === "text") : undefined);
  const text = block?.md;
  if (!text?.trim()) return getLocale();
  return /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i.test(text.normalize("NFC")) ? "vi" : "en";
}
