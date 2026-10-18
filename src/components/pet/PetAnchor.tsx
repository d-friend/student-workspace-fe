"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Registry = {
  claim: (el: HTMLElement) => void;
  release: (el: HTMLElement) => void;
  setScroller: (el: HTMLElement | null) => void;
};
type Anchor = { anchor: HTMLElement | null; scroller: HTMLElement | null };

const Reg = createContext<Registry | null>(null);
const Cur = createContext<Anchor>({ anchor: null, scroller: null });

const visible = (el: HTMLElement) => el.isConnected && el.closest("[hidden]") === null;

// One anchor at a time: the active row of the first unfinished steps block in the visible doc.
export function PetAnchorProvider({ children }: { children: ReactNode }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  // shortcut: first unfinished block only, enough for one steps block per doc; a later block does not take over when the first finishes.
  const claim = useCallback((el: HTMLElement) => setAnchor((cur) => (cur && cur !== el && visible(cur) ? cur : el)), []);
  const release = useCallback((el: HTMLElement) => setAnchor((cur) => (cur === el ? null : cur)), []);
  const reg = useMemo(() => ({ claim, release, setScroller }), [claim, release]);
  const value = useMemo(() => ({ anchor, scroller }), [anchor, scroller]);
  return (
    <Reg.Provider value={reg}>
      <Cur.Provider value={value}>{children}</Cur.Provider>
    </Reg.Provider>
  );
}

export const usePetAnchor = () => useContext(Cur);

// Ref callback for the element the pet stands beside. `active` false (done, or the doc is hidden) releases it.
// Outside a provider (tests, previews) it does nothing.
export function usePetAnchorRef(active: boolean) {
  const reg = useContext(Reg);
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!reg || !el) return;
    if (active && visible(el)) reg.claim(el);
    else reg.release(el);
    return () => reg.release(el);
  }, [reg, el, active]);
  return setEl;
}

// Ref callback for the workspace scroller, so the pet layer can follow its scrolling.
export function usePetScrollerRef() {
  const reg = useContext(Reg);
  return reg?.setScroller;
}
