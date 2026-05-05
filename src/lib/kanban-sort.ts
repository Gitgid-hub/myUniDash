import type { Task, TaskPriority } from "@/lib/types";

const priorityRank: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** Board queue: earlier due first; no due last; tie-break priority then title/id. */
export function sortTasksByDueThenPriority(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const dueA = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const dueB = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (dueA !== dueB) return dueA - dueB;
    const pr = priorityRank[a.priority] - priorityRank[b.priority];
    if (pr !== 0) return pr;
    const t = (a.title || "").localeCompare(b.title || "");
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });
}

/** Completed queue: most recently completed first. */
export function sortCompletedTasksByCompletedAtDesc(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    if (tb !== ta) return tb - ta;
    const t = (a.title || "").localeCompare(b.title || "");
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });
}
