import {
  addDays,
  expandMeetingOccurrences,
  formatDateKey,
  getWeekDayFromDate,
  parseTimeValue,
  startOfWeekGrid,
  type SessionOccurrence
} from "@/lib/calendar-occurrences";
import { startOfDay } from "@/lib/date";
import type { Course, CourseMeeting, WeekDay } from "@/lib/types";

/** How far ahead to look for the next lecture/tutorial when setting a recording catch-up due date. */
const RECORDING_CATCH_UP_DEADLINE_HORIZON_DAYS = 370;

/** Sunday 00:00 through Thursday end-of-day in the same week as `anchorDate` (Sunday-based week). */
export function getAcademicWeekSunThu(anchorDate: Date): { start: Date; end: Date } {
  const weekStart = startOfWeekGrid(anchorDate, "sunday");
  const thursday = addDays(weekStart, 4);
  const end = new Date(thursday);
  end.setHours(23, 59, 59, 999);
  return { start: weekStart, end };
}

export function academicWeekKeyFromAnchor(anchorDate: Date): string {
  return formatDateKey(startOfWeekGrid(anchorDate, "sunday"));
}

export function isLectureOrTutorial(meeting: CourseMeeting): boolean {
  const t = meeting.type ?? "lecture";
  return t === "lecture" || t === "tutorial";
}

export function listCatchUpOccurrences(courses: Course[], rangeStart: Date, rangeEnd: Date): SessionOccurrence[] {
  return expandMeetingOccurrences(courses, rangeStart, rangeEnd).filter((occ) => {
    if (!isLectureOrTutorial(occ.meeting)) return false;
    if (occ.meeting.isAllDay) return false;
    return true;
  });
}

function sessionDurationMinutes(occ: SessionOccurrence): number {
  if (occ.meeting.isAllDay) return 0;
  const start = parseTimeValue(occ.meeting.start);
  const end = parseTimeValue(occ.meeting.end);
  return Math.max(0, (end - start) * 60);
}

/** Combine session calendar date with meeting end clock time (local). */
export function sessionEndDateTime(occ: SessionOccurrence): Date {
  const d = startOfDay(occ.date);
  const [h, m] = occ.meeting.end.split(":").map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

/** Combine session calendar date with meeting start clock time (local). */
export function sessionStartDateTime(occ: SessionOccurrence): Date {
  const d = startOfDay(occ.date);
  const [h, m] = occ.meeting.start.split(":").map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

/**
 * Due time for a "watch recording" catch-up task: start of the next lecture/tutorial for the same course
 * after the missed session ends. Returns ISO string, or undefined if none found in the search horizon.
 */
export function findRecordingCatchUpDueAt(courses: Course[], missedOcc: SessionOccurrence): string | undefined {
  const missedEnd = sessionEndDateTime(missedOcc);
  const rangeStart = startOfDay(missedOcc.date);
  const rangeEnd = addDays(rangeStart, RECORDING_CATCH_UP_DEADLINE_HORIZON_DAYS);
  const candidates = expandMeetingOccurrences(courses, rangeStart, rangeEnd).filter(
    (o) =>
      o.course.id === missedOcc.course.id &&
      isLectureOrTutorial(o.meeting) &&
      !o.meeting.isAllDay &&
      o.instanceKey !== missedOcc.instanceKey
  );
  let best: Date | undefined;
  for (const o of candidates) {
    const start = sessionStartDateTime(o);
    if (start.getTime() <= missedEnd.getTime()) continue;
    if (!best || start.getTime() < best.getTime()) best = start;
  }
  return best?.toISOString();
}

/**
 * Latest end time among lecture/tutorial sessions on Thursday of the same week as `occurrences`.
 * If none on Thursday, returns Thursday 23:59:59.999 for that week (from first occurrence's week or anchor).
 */
/** Latest end time of any lecture/tutorial in the Sun–Thu academic week of `anchorDate` (for “week not finished yet” gating). */
export function lastScheduledLectureTutorialEndInSunThuWeek(anchorDate: Date, courses: Course[]): Date {
  const { start, end } = getAcademicWeekSunThu(anchorDate);
  const occ = listCatchUpOccurrences(courses, start, end);
  const weekSunday = startOfWeekGrid(anchorDate, "sunday");
  if (occ.length === 0) {
    return getLastThursdaySessionEndInWeek(occ, weekSunday);
  }
  let maxTs = 0;
  for (const o of occ) {
    const t = sessionEndDateTime(o).getTime();
    if (t > maxTs) maxTs = t;
  }
  return new Date(maxTs);
}

export function getLastThursdaySessionEndInWeek(occurrences: SessionOccurrence[], weekSunday: Date): Date {
  const thursday = addDays(startOfWeekGrid(weekSunday, "sunday"), 4);
  const thuKey = formatDateKey(thursday);
  const thursdayOccs = occurrences.filter((o) => formatDateKey(o.date) === thuKey && isLectureOrTutorial(o.meeting) && !o.meeting.isAllDay);
  if (thursdayOccs.length === 0) {
    const end = new Date(thursday);
    end.setHours(23, 59, 59, 999);
    return end;
  }
  let maxTs = 0;
  for (const occ of thursdayOccs) {
    const t = sessionEndDateTime(occ).getTime();
    if (t > maxTs) maxTs = t;
  }
  return new Date(maxTs);
}

export type WeekProgress = {
  percent: number;
  scheduledMinutes: number;
  elapsedMinutes: number;
};

/** Sun–Thu lecture/tutorial minutes elapsed vs scheduled (0–100). */
export function computeAcademicWeekProgress(occurrences: SessionOccurrence[], now: Date = new Date()): WeekProgress {
  const scheduledMinutes = occurrences.reduce((sum, occ) => sum + sessionDurationMinutes(occ), 0);
  if (scheduledMinutes <= 0) {
    return { percent: 0, scheduledMinutes: 0, elapsedMinutes: 0 };
  }
  const todayStart = startOfDay(now);
  let elapsedMinutes = 0;
  for (const occ of occurrences) {
    const dur = sessionDurationMinutes(occ);
    if (dur <= 0) continue;
    const dayStart = startOfDay(occ.date);
    if (dayStart.getTime() < todayStart.getTime()) {
      elapsedMinutes += dur;
      continue;
    }
    if (formatDateKey(occ.date) !== formatDateKey(now)) {
      continue;
    }
    const endDt = sessionEndDateTime(occ);
    if (endDt.getTime() <= now.getTime()) {
      elapsedMinutes += dur;
    }
  }
  const percent = Math.min(100, Math.round((elapsedMinutes / scheduledMinutes) * 100));
  return { percent, scheduledMinutes, elapsedMinutes };
}

export function sortCatchUpOccurrencesBySchedule(occurrences: SessionOccurrence[]): SessionOccurrence[] {
  return [...occurrences].sort((a, b) => {
    const dk = formatDateKey(a.date).localeCompare(formatDateKey(b.date));
    if (dk !== 0) return dk;
    return parseTimeValue(a.meeting.start) - parseTimeValue(b.meeting.start);
  });
}

export function groupOccurrencesByWeekday(occurrences: SessionOccurrence[]): Record<WeekDay, SessionOccurrence[]> {
  const order: WeekDay[] = ["Sun", "Mon", "Tue", "Wed", "Thu"];
  const init = {} as Record<WeekDay, SessionOccurrence[]>;
  for (const d of order) init[d] = [];
  for (const occ of occurrences) {
    const wd = getWeekDayFromDate(occ.date);
    if (order.includes(wd)) {
      init[wd].push(occ);
    }
  }
  for (const d of order) {
    init[d].sort((a, b) => parseTimeValue(a.meeting.start) - parseTimeValue(b.meeting.start));
  }
  return init;
}
