"use client";

import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { ApiError, getMe, saveProfile, skipProfile } from "@/lib/api";
import { copy } from "@/lib/copy";
import styles from "./ProfileGate.module.css";

type Field = "nickname" | "province" | "grade" | "school";
const fields: Field[] = ["nickname", "province", "grade", "school"];

export function ProfileGate({ children, hold = false }: { children: ReactNode; hold?: boolean }) {
  const [status, setStatus] = useState<"loading" | "needed" | "ready">("loading");
  const [values, setValues] = useState<Record<Field, string>>({ nickname: "", province: "", grade: "", school: "" });
  const [errors, setErrors] = useState<Partial<Record<Field, boolean>>>({});
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const request = useRef<ReturnType<typeof getMe> | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    request.current ??= getMe();
    void request.current.then((me) => { if (active) setStatus(me.profile_needed ? "needed" : "ready"); }, () => { if (active) setStatus("ready"); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (status === "needed") dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [status]);

  const focusFirst = (invalid: Partial<Record<Field, boolean>>) => {
    const first = fields.find((field) => invalid[field]);
    if (first) dialog.current?.querySelector<HTMLElement>(`#profile-${first}`)?.focus();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    const nickname = values.nickname.trim();
    const province = values.province.trim();
    const school = values.school.trim();
    const grade = Number(values.grade);
    const invalid = { nickname: !nickname || Array.from(nickname).length > 40, province: !province || Array.from(province).length > 60, grade: !values.grade || !Number.isInteger(grade) || grade < 1 || grade > 12, school: !school || Array.from(school).length > 120 };
    setErrors(invalid);
    setFailed(false);
    if (Object.values(invalid).some(Boolean)) { focusFirst(invalid); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      await saveProfile({ nickname, province, grade, school });
      setStatus("ready");
    } catch (error) {
      const serverFields = error instanceof ApiError && error.status === 422 && error.code === "invalid_profile" ? error.fields : undefined;
      const serverErrors: Partial<Record<Field, boolean>> = {};
      for (const field of fields) if (serverFields?.includes(field)) serverErrors[field] = true;
      if (Object.keys(serverErrors).length) { setErrors(serverErrors); focusFirst(serverErrors); }
      else setFailed(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const skip = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await skipProfile();
    } catch {
      // A failed skip must not prevent the student from continuing.
    } finally {
      setStatus("ready");
      savingRef.current = false;
      setSaving(false);
    }
  };
  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") { event.preventDefault(); void skip(); return; }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>("input:not(:disabled), select:not(:disabled), button:not(:disabled)") ?? []);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  };
  const labels = { nickname: copy.profileNickname, province: copy.profileProvince, grade: copy.profileGrade, school: copy.profileSchool };
  const messages = { nickname: copy.profileNicknameError, province: copy.profileProvinceError, grade: copy.profileGradeError, school: copy.profileSchoolError };
  return <>
    <div style={{ display: "contents" }} inert={status === "needed" || undefined} aria-hidden={status === "needed" || undefined}>
      {(!hold || status === "ready") && children}
    </div>
    {status === "needed" && <div className={styles.backdrop}>
    <div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="profile-title" aria-describedby="profile-note" onKeyDown={trapFocus}>
      <h1 id="profile-title">{copy.profileTitle}</h1>
      <p id="profile-note">{copy.profileNote}</p>
      <form onSubmit={(event) => void submit(event)} noValidate>
        {fields.map((field) => <div className={styles.field} key={field}>
          <label htmlFor={`profile-${field}`}>{labels[field]}</label>
          {field === "nickname" && <span id="profile-nickname-hint" className={styles.hint}>{copy.profileNicknameHint}</span>}
          {field === "grade" ? <select id="profile-grade" value={values.grade} onChange={(event) => setValues({ ...values, grade: event.target.value })} aria-invalid={errors.grade || undefined} aria-describedby={errors.grade ? "profile-grade-error" : undefined}>
            <option value="">{copy.profileGradePlaceholder}</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select> : <input id={`profile-${field}`} value={values[field]} onChange={(event) => setValues({ ...values, [field]: event.target.value })} aria-invalid={errors[field] || undefined} aria-describedby={[field === "nickname" ? "profile-nickname-hint" : "", errors[field] ? `profile-${field}-error` : ""].filter(Boolean).join(" ") || undefined} />}
          {errors[field] && <span className={styles.error} id={`profile-${field}-error`}>{messages[field]}</span>}
        </div>)}
        {failed && <p className={styles.error} role="alert">{copy.profileFailed}</p>}
        <button type="submit" disabled={saving}>{copy.profileStart}</button>
        <button className={styles.skip} type="button" disabled={saving} onClick={() => void skip()}>{copy.profileSkip}</button>
      </form>
    </div>
  </div>}
  </>;
}
