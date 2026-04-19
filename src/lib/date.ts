export const MS_HOUR = 60 * 60 * 1000;
export const MS_DAY = 24 * MS_HOUR;

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatDue(dateIso?: string): string {
  if (!dateIso) {
    return "No due date";
  }

  const date = new Date(dateIso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const prefix = sameDay
    ? "Today"
    : date.toDateString() === tomorrow.toDateString()
      ? "Tomorrow"
      : date.toLocaleDateString(undefined, { month: "short", day: "numeric", weekday: "short" });

  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${prefix}, ${time}`;
}

export function startOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isOverdue(dateIso?: string): boolean {
  if (!dateIso) {
    return false;
  }
  return new Date(dateIso).getTime() < Date.now();
}

export function isToday(dateIso?: string): boolean {
  if (!dateIso) {
    return false;
  }
  return startOfDay(new Date(dateIso)).getTime() === startOfDay().getTime();
}

export function inNextDays(dateIso: string | undefined, days: number): boolean {
  if (!dateIso) {
    return false;
  }
  const now = Date.now();
  const max = now + days * MS_DAY;
  const due = new Date(dateIso).getTime();
  return due >= now && due <= max;
}

export function dueInHours(dateIso?: string): number {
  if (!dateIso) {
    return Number.POSITIVE_INFINITY;
  }
  return (new Date(dateIso).getTime() - Date.now()) / MS_HOUR;
}

export function getWeekKey(dateIso: string): string {
  const date = new Date(dateIso);
  const day = (date.getDay() + 6) % 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - day);
  return monday.toISOString().slice(0, 10);
}

/** Label for a week bucket (Monday `weekKey` from `getWeekKey`). */
export function formatWeekOfLabel(weekKey: string): string {
  const d = new Date(`${weekKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return weekKey;
  }
  return `Week of ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

/** Local calendar date key YYYY-MM-DD (not UTC midnight shift). */
export function formatDateKeyLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
