import type { CSSProperties } from "react";

export function formatHourMinutes(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function softCourseStyle(color: string): CSSProperties {
  return {
    background: `linear-gradient(135deg, ${color}38, ${color}20)`,
    boxShadow: `0 0 0 1px ${color}42, 0 10px 26px ${color}24, inset 0 1px 0 rgba(255,255,255,0.35)`
  };
}

export function sameCalendarDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
