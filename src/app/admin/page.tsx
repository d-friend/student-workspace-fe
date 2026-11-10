"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { adminGet, clearToken, readToken, saveToken } from "@/lib/admin";
import { CostSection, FeaturesSection, FeedbackSection, GuestsSection, GuestTimeline, HealthSection, LatencySection, SheetsSection, ThesisSection, UsersSection } from "./sections";
import styles from "./admin.module.css";

const DAYS = [
  [1, "Today"],
  [7, "7 days"],
  [30, "30 days"],
  [90, "90 days"],
] as const;

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [savedToken] = useState(() => readToken());
  const [input, setInput] = useState("");
  const [days, setDays] = useState(7);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [openGuest, setOpenGuest] = useState<string | null>(null);

  const validate = async (candidate: string, selectedDays = days) => {
    setChecking(true);
    setError(null);
    try {
      await adminGet(`/health?days=${selectedDays}`, candidate);
      saveToken(candidate);
      setToken(candidate);
      return true;
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 404) {
        clearToken();
        setToken(null);
      }
      setError(reason instanceof ApiError && reason.status === 404 ? "That token is not valid." : "Could not reach the admin service.");
      return false;
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (savedToken) queueMicrotask(() => void validate(savedToken));
    // Validate the stored token only once; days changes are validated below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (input.trim()) void validate(input.trim());
  };

  // The backend takes whole days from 1 to 90; anything else is ignored and the box resets.
  const applyCustom = () => {
    const value = Number(custom);
    if (Number.isInteger(value) && value >= 1 && value <= 90) {
      if (value !== days) changeDays(value);
    } else setCustom(DAYS.some(([preset]) => preset === days) ? "" : String(days));
  };

  const changeDays = (nextDays: number) => {
    setDays(nextDays);
    setCustom(DAYS.some(([value]) => value === nextDays) ? "" : String(nextDays));
    if (token) void validate(token, nextDays);
  };

  const signOut = () => {
    clearToken();
    setToken(null);
    setInput("");
    setError(null);
  };

  if (!token) {
    return (
      <main className={styles.gate}>
        <form className={styles.tokenForm} onSubmit={submit}>
          <p className={styles.eyebrow}>D-Friend</p>
          <h1>Admin access</h1>
          <label htmlFor="admin-token">Admin token</label>
          <input id="admin-token" type="password" value={input} onChange={(event) => setInput(event.target.value)} autoComplete="off" />
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button type="submit" disabled={checking}>{checking ? "Checking…" : "Continue"}</button>
        </form>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>D-Friend</p>
          <h1>Admin dashboard</h1>
        </div>
        <div className={styles.controls}>
          <div className={styles.days} aria-label="Date range">
            {DAYS.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={days === value} onClick={() => changeDays(value)}>{label}</button>
            ))}
            <form onSubmit={(event) => { event.preventDefault(); applyCustom(); }}>
              <input type="number" inputMode="numeric" min={1} max={90} placeholder="Days" aria-label="Custom number of days (1 to 90)" value={custom} data-active={!DAYS.some(([value]) => value === days) || undefined} onChange={(event) => setCustom(event.target.value)} onBlur={applyCustom} />
            </form>
          </div>
          <button type="button" className={styles.signOut} onClick={signOut}>Sign out</button>
        </div>
      </header>
      <div className={styles.content} aria-label="Admin dashboard content">
        <HealthSection token={token} days={days} />
        <CostSection token={token} days={days} />
        <LatencySection token={token} days={days} onGuestOpen={setOpenGuest} />
        <UsersSection token={token} days={days} />
        <FeaturesSection token={token} days={days} />
        <ThesisSection token={token} days={days} />
        <SheetsSection token={token} />
        <FeedbackSection token={token} onGuestOpen={setOpenGuest} />
        {openGuest ? <GuestTimeline key={openGuest} token={token} guestId={openGuest} onGuestOpen={setOpenGuest} onClose={() => setOpenGuest(null)} /> : <GuestsSection token={token} onGuestOpen={setOpenGuest} />}
      </div>
    </main>
  );
}
