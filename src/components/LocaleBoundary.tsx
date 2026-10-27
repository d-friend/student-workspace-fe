"use client";

import { Fragment, type ReactNode, useEffect, useSyncExternalStore } from "react";
import { detectLocale, setLocale } from "@/lib/copy";

const subscribe = () => () => {};

// The server cannot see the browser language, so it renders Vietnamese; the client re-renders in the detected one.
export function LocaleBoundary({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, () => detectLocale(navigator.languages), () => "vi" as const);
  setLocale(locale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  // key: a locale change remounts the tree, since children memoised on props would keep the old strings.
  return <Fragment key={locale}>{children}</Fragment>;
}
