import type { Task } from "@/lib/types";

/** Sort tasks by due date string (missing due sorts last). */
export function taskComparator(a: Task, b: Task): number {
  return (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999");
}
