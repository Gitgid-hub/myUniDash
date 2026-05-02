import { dueInHours, getWeekKey, inNextDays, isOverdue, isToday } from "@/lib/date";
import type { Course, ReminderSettings, SearchResult, Task, TaskPriority, TaskStatus } from "@/lib/types";

export function byStatus(tasks: Task[], status: TaskStatus): Task[] {
  return tasks.filter((task) => task.status === status);
}

export function getTodayTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => task.status !== "done" && isToday(task.dueAt));
}

export function getUpcomingTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => task.status !== "done" && inNextDays(task.dueAt, 7));
}

export function getOverdueTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => task.status !== "done" && isOverdue(task.dueAt));
}

export function getAgenda(tasks: Task[]): Task[] {
  return tasks
    .filter((task) => task.status !== "done" && inNextDays(task.dueAt, 7))
    .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
}

export function getCourseProgress(course: Course, tasks: Task[]): number {
  if (course.progressMode === "manual") {
    return course.manualProgress;
  }

  const related = tasks.filter((task) => task.courseId === course.id);
  if (related.length === 0) {
    return 0;
  }
  const done = related.filter((task) => task.status === "done").length;
  return Math.round((done / related.length) * 100);
}

export function getCourseHealth(course: Course, tasks: Task[]): "good" | "watch" | "risk" {
  const related = tasks.filter((task) => task.courseId === course.id && task.status !== "done");
  const overdue = related.filter((task) => isOverdue(task.dueAt)).length;
  if (overdue >= 2) {
    return "risk";
  }
  if (overdue === 1 || related.length > 5) {
    return "watch";
  }
  return "good";
}

export function getWorkloadThisWeek(tasks: Task[]): number {
  return tasks
    .filter((task) => task.status !== "done" && inNextDays(task.dueAt, 7))
    .reduce((sum, task) => sum + task.effort, 0);
}

export function getReminderMatches(tasks: Task[], settings: ReminderSettings): Task[] {
  return tasks.filter((task) => {
    const dueHours = dueInHours(task.dueAt);
    return task.status !== "done" && settings.offsetsHours.some((offset) => dueHours > offset - 0.5 && dueHours < offset + 0.5);
  });
}

export function searchAll(query: string, tasks: Task[], courses: Course[]): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [];
  }

  const courseResults = courses
    .map((course) => {
      const haystack = `${course.name} ${course.code} ${course.instructor ?? ""} ${course.notes}`.toLowerCase();
      const score = haystack.includes(q) ? 10 + Number(course.name.toLowerCase().includes(q)) : 0;
      return {
        id: course.id,
        kind: "course" as const,
        title: `${course.code} ${course.name}`,
        subtitle: course.instructor ?? "Course",
        score
      };
    })
    .filter((result) => result.score > 0);

  const taskResults = tasks
    .map((task) => {
      const haystack = `${task.title} ${task.description} ${task.tags.join(" ")}`.toLowerCase();
      const score = haystack.includes(q) ? 8 + Number(task.title.toLowerCase().includes(q)) : 0;
      return {
        id: task.id,
        kind: "task" as const,
        title: task.title,
        subtitle: task.description || "Task",
        score
      };
    })
    .filter((result) => result.score > 0);

  return [...courseResults, ...taskResults].sort((a, b) => b.score - a.score).slice(0, 12);
}

export function completedByWeek(tasks: Task[]): Record<string, number> {
  return tasks
    .filter((task) => task.status === "done" && task.completedAt)
    .reduce<Record<string, number>>((acc, task) => {
      const key = getWeekKey(task.completedAt as string);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
}

export function workloadByCourse(
  tasks: Task[],
  courses: Course[]
): Array<{ courseId: string; name: string; total: number; color: string }> {
  return courses
    .map((course) => {
      const total = tasks
        .filter((task) => task.courseId === course.id && task.status !== "done")
        .reduce((acc, task) => acc + task.effort, 0);
      return { courseId: course.id, name: course.name, total, color: course.color };
    })
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function byPriority(tasks: Task[]): Record<TaskPriority, Task[]> {
  return {
    urgent: tasks.filter((task) => task.priority === "urgent"),
    high: tasks.filter((task) => task.priority === "high"),
    medium: tasks.filter((task) => task.priority === "medium"),
    low: tasks.filter((task) => task.priority === "low")
  };
}
