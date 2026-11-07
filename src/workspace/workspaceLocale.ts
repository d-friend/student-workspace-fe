import { getLocale, type Locale } from "@/lib/copy";
import type { WorkspaceDoc } from "./types";

// shortcut: infer from text and fall back to browser locale for math-only problems.
export function workspaceLocale(doc: WorkspaceDoc): Locale {
  const block = doc.blocks.find((b) => b.type === "problem") ??
    (doc.phase === "learn" ? doc.blocks.find((b) => b.type === "text") : undefined);
  const text = block?.md;
  if (!text?.trim()) return getLocale();
  if (/[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i.test(text.normalize("NFC"))) return "vi";
  const prose = text.replace(/\$\$[\s\S]*?\$\$|\$[^$]*\$/g, " ").replace(/\\[A-Za-z]+/g, " ");
  return /[A-Za-z]{3,}/.test(prose) ? "en" : getLocale();
}
