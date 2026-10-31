"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { IconUser } from "@tabler/icons-react";
import { ApiError, authMethods, demoSignIn, emailStart, emailVerify, getMe, logout, type AuthMethods, type Me } from "@/lib/api";
import { copy } from "@/lib/copy";
import styles from "./AccountMenu.module.css";

type AuthError = "authInvalidCode" | "authRateLimited" | "authFailed" | "authActionFailed" | "authInvalidCredentials";

export type AccountStatus = { signedIn: boolean; enabled: boolean };

export function AccountMenu({ rail = false, onStatus }: { rail?: boolean; onStatus?: (status: AccountStatus) => void }) {
  const [account, setAccount] = useState<{ methods: AuthMethods; me: Me } | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [demo, setDemo] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [age, setAge] = useState("");
  const [parent, setParent] = useState(false);
  const [read, setRead] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);
  const loginResult = useRef<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const titleId = useId();

  useEffect(() => {
    let active = true;
    const url = new URL(window.location.href);
    const result = url.searchParams.get("login");
    if (result === "ok" || result === "failed") {
      loginResult.current = result;
      url.searchParams.delete("login");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    Promise.all([authMethods(), getMe()]).then(([methods, me]) => {
      if (!active) return;
      setAccount({ methods, me });
      onStatus?.({ signedIn: me.signed_in, enabled: methods.google || methods.email || !!methods.demo });
      if (loginResult.current === "failed") {
        setError("authFailed");
        setOpen(true);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [onStatus]);

  // Only one corner sheet at a time: they share a spot.
  useEffect(() => {
    const other = (event: Event) => { if ((event as CustomEvent).detail !== "account") setOpen(false); };
    window.addEventListener("df-sheet-open", other);
    return () => window.removeEventListener("df-sheet-open", other);
  }, []);

  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent("df-sheet-open", { detail: "account" }));
    sheet.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setError(null);
        trigger.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!sheet.current?.contains(target) && !trigger.current?.contains(target)) {
        setOpen(false);
        setError(null);
      }
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setError(null);
    trigger.current?.focus();
  };

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError && e.code === "invalid_credentials" ? "authInvalidCredentials"
        : e instanceof ApiError && e.code === "invalid_code" ? "authInvalidCode"
        : e instanceof ApiError && e.code === "rate_limited" ? "authRateLimited" : "authActionFailed");
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () => run(async () => {
    await emailStart(email.trim());
    setCode("");
    setStep("code");
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (step === "email") void sendCode();
    else void run(async () => {
      await emailVerify(email.trim(), code);
      window.location.reload();
    });
  };

  if (!account || (!account.me.signed_in && !account.methods.google && !account.methods.email && !account.methods.demo)) return null;
  const { methods, me } = account;
  const years = /^\d+$/.test(age) ? Number(age) : NaN;
  const ageOk = years >= 6 && years <= 99;
  const minor = ageOk && years < 16;
  const googleReady = ageOk && (!minor || (parent && read));
  const startGoogle = () => window.location.assign(`/api/auth/google/start?age=${years}${minor ? "&consent=1" : ""}`);
  const legalLinks = (
    <>
      <a href={`${copy.authLegalBase}/terms`}>{copy.authTerms}</a>{" "}
      {copy.authAnd}{" "}
      <a href={`${copy.authLegalBase}/privacy`}>{copy.authPrivacy}</a>
    </>
  );

  return (
    <>
      <button ref={trigger} type="button" className={styles.open} data-rail={rail || undefined} aria-label={me.signed_in ? copy.authAccount : copy.historyLogin}
        aria-expanded={open} aria-haspopup="dialog" onClick={() => open ? close() : setOpen(true)}>
        <span className={styles.avatar} aria-hidden="true">
          {me.signed_in ? (me.name || me.email || "").trim().slice(0, 1).toLocaleUpperCase() : <IconUser size={16} />}
        </span>
        {!rail && <span className={styles.label}>{me.signed_in ? me.name || me.email : copy.historyLogin}</span>}
      </button>
      {open && (
        <section ref={sheet} className={styles.sheet} role="dialog" aria-labelledby={titleId} tabIndex={-1}>
          <h2 id={titleId}>{me.signed_in ? copy.authAccount : copy.authTitle}</h2>
          {me.signed_in ? (
            <>
              {me.name && <p>{me.name}</p>}
              <p className={styles.email}>{me.email}</p>
            </>
          ) : (
            <>
              <p>{copy.authOptional}</p>
              {methods.google && (
                <label className={styles.age}>
                  {copy.authAge}
                  <input type="number" inputMode="numeric" min={6} max={99} value={age} onChange={(e) => setAge(e.target.value)} />
                </label>
              )}
              {minor ? (
                <div className={styles.legal}>
                  <label>
                    <input type="checkbox" checked={parent} onChange={(e) => setParent(e.target.checked)} />
                    <span>{copy.authParentConsent}</span>
                  </label>
                  <label>
                    <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />
                    <span>{copy.authReadPrefix} {legalLinks}.</span>
                  </label>
                </div>
              ) : (
                <p className={styles.legal}>{copy.authAgreement} {legalLinks}</p>
              )}
              {methods.demo && (
                <button type="button" aria-expanded={demo} onClick={() => setDemo(!demo)}>{copy.authDemo}</button>
              )}
              {methods.demo && demo && (
                <form aria-busy={busy} onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    await demoSignIn(email.trim(), password);
                    window.location.reload();
                  });
                }}>
                  <label className={styles.age}>
                    {copy.authEmail}
                    <input type="email" required autoComplete="username" value={email}
                      onChange={(event) => setEmail(event.target.value)} disabled={busy} />
                  </label>
                  <label className={styles.age}>
                    {copy.authPassword}
                    <input type="password" required autoComplete="current-password" value={password}
                      onChange={(event) => setPassword(event.target.value)} disabled={busy} />
                  </label>
                  <button type="submit" disabled={busy || !email.trim() || !password}>
                    {busy ? copy.authBusy : copy.authVerify}
                  </button>
                </form>
              )}
              {methods.email && !demo && (
                <form onSubmit={submit} aria-busy={busy}>
                  {step === "email" ? (
                    <input type="email" required autoComplete="email" aria-label={copy.authEmail}
                      value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} />
                  ) : (
                    <>
                      <p role="status">{copy.authCodeSent}</p>
                      <p className={styles.email}>{email.trim()}</p>
                      <input type="text" required inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                        pattern="[0-9]{6}" aria-label={copy.authCode} value={code}
                        onChange={(e) => setCode(e.target.value)} disabled={busy} />
                    </>
                  )}
                  <button type="submit" disabled={busy || (step === "email" ? !email.trim() : !/^[0-9]{6}$/.test(code))}>
                    {busy ? copy.authBusy : step === "email" ? copy.authSend : copy.authVerify}
                  </button>
                  {step === "code" && <button type="button" disabled={busy} onClick={() => void sendCode()}>{copy.authResend}</button>}
                </form>
              )}
            </>
          )}
          {error && <p className={styles.error} role="alert">{copy[error]}</p>}
          <div className={styles.actions}>
            {me.signed_in && (
              <button type="button" disabled={busy} onClick={() => void run(async () => {
                await logout();
                window.location.reload();
              })}>{copy.authLogout}</button>
            )}
            <button type="button" className={styles.close} onClick={close}>{copy.drawerClose}</button>
            {!me.signed_in && methods.google && (
              <button type="button" className={styles.google} disabled={!googleReady} onClick={startGoogle}>{copy.authGoogle}</button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
