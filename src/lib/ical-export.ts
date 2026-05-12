import {
  addDays,
  expandMeetingOccurrences,
  formatDateKey,
  formatSessionType,
  type SessionOccurrence
} from "@/lib/calendar-occurrences";
import { startOfDay } from "@/lib/date";
import type { Course } from "@/lib/types";

const DEFAULT_BACK_DAYS = 90;
const DEFAULT_FORWARD_DAYS = 540;

export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Floating local time (no Z) for calendar clients that apply the user’s timezone on import. */
export function formatIcsLocalDateTime(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

export function formatIcsUtcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function occurrenceBounds(occ: SessionOccurrence): { start: Date; end: Date; allDay: boolean } {
  if (occ.meeting.isAllDay) {
    const s = startOfDay(occ.date);
    const e = addDays(s, 1);
    return { start: s, end: e, allDay: true };
  }
  const base = startOfDay(occ.date);
  const [sh, sm] = occ.meeting.start.split(":").map(Number);
  const [eh, em] = occ.meeting.end.split(":").map(Number);
  const start = new Date(base);
  start.setHours(Number.isFinite(sh) ? sh : 0, Number.isFinite(sm) ? sm : 0, 0, 0);
  const end = new Date(base);
  end.setHours(Number.isFinite(eh) ? eh : 0, Number.isFinite(em) ? em : 0, 0, 0);
  if (end.getTime() <= start.getTime()) {
    end.setDate(end.getDate() + 1);
  }
  return { start, end, allDay: false };
}

function foldLine(line: string): string {
  const max = 73;
  if (line.length <= max) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > max) {
    parts.push(rest.slice(0, max));
    rest = ` ${rest.slice(max)}`;
  }
  parts.push(rest);
  return parts.join("\r\n ");
}

/**
 * Build an iCalendar (.ics) document with one VEVENT per scheduled session instance.
 * Uses all non-archived courses in `courses`; range defaults to ~3 months back and ~18 months forward from `anchor`.
 */
export function buildSchoolSessionsIcs(
  courses: Course[],
  anchor: Date = new Date()
): { text: string; eventCount: number } {
  const rangeStart = startOfDay(addDays(anchor, -DEFAULT_BACK_DAYS));
  const rangeEnd = startOfDay(addDays(anchor, DEFAULT_FORWARD_DAYS));
  const active = courses.filter((c) => !c.archived);
  const occs = expandMeetingOccurrences(active, rangeStart, rangeEnd);
  const dtStamp = formatIcsUtcStamp(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MyUniDash//School OS//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:School OS classes",
    "X-PUBLISHED-TTL:PT1H"
  ];

  for (const occ of occs) {
    const { start, end, allDay } = occurrenceBounds(occ);
    const titlePart = occ.meeting.title?.trim() || formatSessionType(occ.meeting.type);
    const summary = escapeIcsText(`${occ.course.code} ${occ.course.name} · ${titlePart}`.slice(0, 240));
    const loc = occ.meeting.location?.trim();
    const descBits = [
      occ.course.name,
      occ.meeting.notes?.trim() ? `Notes: ${occ.meeting.notes.trim()}` : "",
      loc ? `Location: ${loc}` : ""
    ].filter(Boolean);
    const description = escapeIcsText(descBits.join("\\n").slice(0, 3000));
    const uid = `schoolos-${occ.instanceKey.replace(/[^a-zA-Z0-9._-]/g, "_")}@myunidash`;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtStamp}`);
    if (allDay) {
      const d0 = formatDateKey(occ.date).replace(/-/g, "");
      const d1 = formatDateKey(addDays(startOfDay(occ.date), 1)).replace(/-/g, "");
      lines.push(`DTSTART;VALUE=DATE:${d0}`);
      lines.push(`DTEND;VALUE=DATE:${d1}`);
    } else {
      lines.push(`DTSTART:${formatIcsLocalDateTime(start)}`);
      lines.push(`DTEND:${formatIcsLocalDateTime(end)}`);
    }
    lines.push(foldLine(`SUMMARY:${summary}`));
    if (description) lines.push(foldLine(`DESCRIPTION:${description}`));
    if (loc) lines.push(foldLine(`LOCATION:${escapeIcsText(loc)}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return { text: lines.join("\r\n"), eventCount: occs.length };
}
