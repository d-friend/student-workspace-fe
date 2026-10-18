"use client";

import { useSyncExternalStore } from "react";
import { IconMoon, IconSun } from "@tabler/icons-react";
import { copy } from "@/lib/copy";
import { currentTheme, setTheme, subscribeTheme } from "@/lib/theme";
import styles from "./ThemeToggle.module.css";

export function ThemeToggle() {
  // null on the server and the first client render: the real theme is only known in the browser.
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => null);
  if (theme === null) return null;
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-label={next === "dark" ? copy.themeDark : copy.themeLight}
      onClick={() => setTheme(next)}
    >
      {theme === "dark" ? <IconSun size={20} aria-hidden="true" /> : <IconMoon size={20} aria-hidden="true" />}
    </button>
  );
}
