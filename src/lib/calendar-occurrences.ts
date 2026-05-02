import { startOfDay } from "@/lib/date";
import type { Course, CourseMeeting, WeekDay } from "@/lib/types";

/** Week column order: Sunday = index 0 from `Date.getDay()`. */
export const CALENDAR_WEEK_DAYS: WeekDay[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type SessionOccurrence = {
  course: Course;
  meeting: CourseMeeting;
  date: Date;
  instanceKey: string;
};

export type PositionedOccurrence = SessionOccurrence & {
  column: number;
  totalColumns: number;
};

export function parseTimeValue(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours + minutes / 60;
}

export function formatDateKey(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function getWeekDayFromDate(date: Date): WeekDay {
  return CALENDAR_WEEK_DAYS[date.getDay()];
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfWeekGrid(date: Date, weekStartsOn: "monday" | "sunday"): Date {
  const next = new Date(date);
  const day = next.getDay();
  const offset = weekStartsOn === "monday" ? (day + 6) % 7 : day;
  next.setDate(next.getDate() - offset);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function groupOccurrencesByDate(occurrences: SessionOccurrence[]): Record<string, SessionOccurrence[]> {
  return occurrences.reduce<Record<string, SessionOccurrence[]>>((acc, occurrence) => {
    const key = formatDateKey(occurrence.date);
    acc[key] = [...(acc[key] ?? []), occurrence];
    return acc;
  }, {});
}

export function meetingOccursOnDate(meeting: CourseMeeting, date: Date): boolean {
  const recurrence = meeting.recurrence ?? { cadence: "weekly", interval: 1, daysOfWeek: [meeting.day] };
  const targetKey = formatDateKey(date);
  const anchor = meeting.anchorDate ? new Date(meeting.anchorDate) : undefined;
  const anchorKey = anchor ? formatDateKey(anchor) : undefined;
  const weekDay = getWeekDayFromDate(date);
  if (recurrence.exceptions?.includes(targetKey)) return false;

  if (recurrence.until && new Date(recurrence.until).getTime() < date.getTime()) return false;

  if (recurrence.cadence === "none") {
    return anchorKey ? anchorKey === targetKey : weekDay === meeting.day;
  }

  if (recurrence.cadence === "daily") {
    if (!anchor) return true;
    const diff = Math.floor((startOfDay(date).getTime() - startOfDay(anchor).getTime()) / (24 * 60 * 60 * 1000));
    return diff >= 0 && diff % Math.max(1, recurrence.interval) === 0;
  }

  if (recurrence.cadence === "weekly") {
    const days = recurrence.daysOfWeek?.length ? recurrence.daysOfWeek : [meeting.day];
    if (!days.includes(weekDay)) return false;
    if (!anchor) return true;
    const anchorWeek = startOfWeekGrid(anchor, "sunday");
    const currentWeek = startOfWeekGrid(date, "sunday");
    const diffWeeks = Math.round((currentWeek.getTime() - anchorWeek.getTime()) / (7 * 24 * 60 * 60 * 1000));
    return diffWeeks >= 0 && diffWeeks % Math.max(1, recurrence.interval) === 0;
  }

  if (!anchor) return false;
  const monthDiff = (date.getFullYear() - anchor.getFullYear()) * 12 + (date.getMonth() - anchor.getMonth());
  return monthDiff >= 0 && monthDiff % Math.max(1, recurrence.interval) === 0 && date.getDate() === anchor.getDate();
}

export function expandMeetingOccurrences(courses: Course[], rangeStart: Date, rangeEnd: Date): SessionOccurrence[] {
  const dates: Date[] = [];
  for (let cursor = startOfDay(rangeStart); cursor.getTime() <= startOfDay(rangeEnd).getTime(); cursor = addDays(cursor, 1)) {
    dates.push(new Date(cursor));
  }
  return courses.flatMap((course) =>
    course.meetings.flatMap((meeting) =>
      dates
        .filter((date) => meetingOccursOnDate(meeting, date))
        .map((date) => ({
          course,
          meeting,
          date,
          instanceKey: `${meeting.id}-${formatDateKey(date)}`
        }))
    )
  );
}

export function layoutOverlappingEvents(occurrences: SessionOccurrence[]): PositionedOccurrence[] {
  const sorted = [...occurrences].sort((a, b) => parseTimeValue(a.meeting.start) - parseTimeValue(b.meeting.start));
  const active: PositionedOccurrence[] = [];
  const result: PositionedOccurrence[] = [];

  sorted.forEach((occurrence) => {
    const start = parseTimeValue(occurrence.meeting.start);
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (parseTimeValue(active[index].meeting.end) <= start) {
        active.splice(index, 1);
      }
    }
    const usedColumns = new Set(active.map((item) => item.column));
    let column = 0;
    while (usedColumns.has(column)) column += 1;
    const positioned: PositionedOccurrence = {
      ...occurrence,
      column,
      totalColumns: Math.max(active.length + 1, column + 1)
    };
    active.push(positioned);
    active.forEach((item) => {
      item.totalColumns = Math.max(item.totalColumns, positioned.totalColumns);
    });
    result.push(positioned);
  });

  return result;
}

export function detectMeetingConflicts(courses: Course[], courseId: string, draftMeeting: CourseMeeting, ignoreMeetingId?: string): string[] {
  const previewCourse = courses.find((course) => course.id === courseId);
  if (!previewCourse) return [];
  const previewOccurrences = expandMeetingOccurrences([{ ...previewCourse, meetings: [draftMeeting] }], new Date(), addDays(new Date(), 60));
  const existingOccurrences = expandMeetingOccurrences(
    courses.map((course) => ({
      ...course,
      meetings: course.meetings.filter((meeting) => meeting.id !== ignoreMeetingId)
    })),
    new Date(),
    addDays(new Date(), 60)
  );
  const conflicts = new Set<string>();
  previewOccurrences.forEach((preview) => {
    existingOccurrences.forEach((existing) => {
      if (formatDateKey(preview.date) !== formatDateKey(existing.date)) return;
      if (preview.meeting.isAllDay || existing.meeting.isAllDay) {
        conflicts.add(`${existing.course.name} on ${existing.date.toLocaleDateString()}`);
        return;
      }
      const previewStart = parseTimeValue(preview.meeting.start);
      const previewEnd = parseTimeValue(preview.meeting.end);
      const existingStart = parseTimeValue(existing.meeting.start);
      const existingEnd = parseTimeValue(existing.meeting.end);
      if (previewStart < existingEnd && existingStart < previewEnd) {
        conflicts.add(`${existing.course.name} on ${existing.date.toLocaleDateString()} at ${existing.meeting.start}`);
      }
    });
  });
  return [...conflicts].slice(0, 5);
}

export function formatSessionType(type?: CourseMeeting["type"]): string {
  switch (type) {
    case "lab":
      return "Lab";
    case "tutorial":
      return "Tirgul";
    case "office-hours":
      return "Office hours";
    case "exam":
      return "Exam";
    case "study":
      return "Study block";
    default:
      return "Lecture";
  }
}
