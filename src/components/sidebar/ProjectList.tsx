"use client";

import { useState } from "react";
import Link from "next/link";
import { IconFolder } from "@tabler/icons-react";
import type { ProjectSummary } from "@/lib/api";
import { copy } from "@/lib/copy";
import styles from "./Sidebar.module.css";

export const PROJECTS_SHOWN = 5;

// "Môn học": the student's subject projects above the recent chats, most recently active first. One per subject, so the list stays short; past 5 it folds.
export function ProjectList({ projects, activeId, onOpen, due = {}, onReview }: { projects: ProjectSummary[]; activeId?: string; onOpen: (project: ProjectSummary) => void; due?: Record<string, number>; onReview?: (project: ProjectSummary) => void }) {
  const [all, setAll] = useState(false);
  if (!projects.length) return null;
  // The open project always shows, even when it is not among the 5 most recent.
  const shown = all || projects.length <= PROJECTS_SHOWN ? projects
    : projects.filter((project, i) => i < PROJECTS_SHOWN || project.id === activeId);
  return <nav className={styles.projects} aria-label={copy.projectsLabel}>
    <h2 className={styles.group}>{copy.projectsTitle}</h2>
    {shown.map(project => <div key={project.id} className={styles.projectItem} data-current={project.id === activeId ? "" : undefined}>
      <Link href={`/projects/${project.id}`} className={styles.projectRow}
        aria-current={project.id === activeId ? "page" : undefined} onClick={() => onOpen(project)}>
        <IconFolder size={18} aria-hidden="true" />
        <span className={styles.title}>{project.name}</span>
        <span className={styles.srOnly}>{copy.projectSessions(project.sessions)}</span>
      </Link>
      {due[project.id] > 0 && <Link href={`/projects/${project.id}?tab=review&via=sidebar`} className={styles.due}
        aria-label={copy.reviewDueLabel(project.name, due[project.id])} onClick={() => onReview?.(project)}>
        <span aria-hidden="true">{due[project.id]}</span>
      </Link>}
    </div>)}
    {projects.length > PROJECTS_SHOWN && <button type="button" className={styles.more} aria-expanded={all} onClick={() => setAll(v => !v)}>
      {all ? copy.projectsLess : copy.projectsMore}
    </button>}
  </nav>;
}
