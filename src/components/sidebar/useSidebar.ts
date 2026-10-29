"use client";

import { useCallback, useEffect, useState } from "react";
import { useDesktop } from "@/hooks/useDesktop";

export function useSidebar() {
  const desktop = useDesktop();
  const [mode, setMode] = useState<"open" | "rail">("rail");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem("df-sidebar"); } catch {}
    const width = window.innerWidth;
    const chat = Math.min(430, Math.max(340, 0.34 * width));
    // Hydrate the browser preference only after the server-safe first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(saved === "open" ? "open" : saved === "closed" ? "rail" : width - 260 - chat < 600 ? "rail" : "open");
  }, []);

  const toggle = useCallback(() => {
    const next = mode === "open" ? "rail" : "open";
    setMode(next);
    try { window.localStorage.setItem("df-sidebar", next === "open" ? "open" : "closed"); } catch {}
  }, [mode]);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return { mode, drawerOpen: !desktop && drawerOpen, toggle, openDrawer, closeDrawer };
}
