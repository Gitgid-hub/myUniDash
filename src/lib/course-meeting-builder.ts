import type { CourseMeeting, WeekDay } from "@/lib/types";
import { createId } from "@/lib/id";

export type SessionCadence = "none" | "daily" | "weekly" | "monthly";

export function buildCourseMeeting({
  existing,
  day,
  start,
  end,
  anchorDate,
  title,
  location,
  notes,
  type,
  isAllDay,
  cadence,
  interval,
  repeatDays,
  until,
  count,
  id,
  seriesId
}: {
  existing?: CourseMeeting;
  day: WeekDay;
  start: string;
  end: string;
  anchorDate: string;
  title: string;
  location: string;
  notes: string;
  type: CourseMeeting["type"];
  isAllDay: boolean;
  cadence: SessionCadence;
  interval: number;
  repeatDays: WeekDay[];
  until: string;
  count: string;
  id?: string;
  seriesId?: string;
}): CourseMeeting {
  return {
    id: id ?? existing?.id ?? createId("meeting"),
    day,
    start: isAllDay ? "00:00" : start,
    end: isAllDay ? "23:59" : end,
    anchorDate: anchorDate ? new Date(`${anchorDate}T12:00:00`).toISOString() : undefined,
    title: title.trim() || undefined,
    location: location.trim() || undefined,
    notes: notes.trim() || undefined,
    type,
    isAllDay,
    recurrence: {
      cadence,
      interval: Math.max(1, interval),
      daysOfWeek: cadence === "weekly" ? repeatDays : undefined,
      until: until ? new Date(`${until}T23:59:59`).toISOString() : undefined,
      count: count ? Math.max(1, Number(count)) : undefined
    },
    seriesId: seriesId ?? existing?.seriesId ?? createId("series")
  };
}
