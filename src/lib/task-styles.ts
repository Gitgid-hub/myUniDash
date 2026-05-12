import type { TaskPriority, TaskStatus } from "@/lib/types";

export const statusColor: Record<TaskStatus, string> = {
  backlog: "text-slate-400 dark:text-slate-500",
  next: "text-slate-600 dark:text-slate-300",
  "in-progress": "text-slate-600 dark:text-slate-300",
  done: "text-emerald-600 dark:text-emerald-400"
};

export const priorityColor: Record<TaskPriority, string> = {
  urgent: "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
  high: "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
  medium: "border border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300",
  low: "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
};
