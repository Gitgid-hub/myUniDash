import { useState, useEffect, useMemo } from "react";
import { Copy, Trash2, X } from "lucide-react";
import { Button, Panel } from "@/components/ui";
import type { Course, CourseMeeting, WeekDay } from "@/lib/types";
import { buildCourseMeeting, type SessionCadence } from "@/lib/course-meeting-builder";
import { createId } from "@/lib/id";
import {
  CALENDAR_WEEK_DAYS as weekDays,
  detectMeetingConflicts,
  formatDateKey,
  getWeekDayFromDate
} from "@/lib/calendar-occurrences";

export interface SessionEditorModalProps {
  courses: Course[];
  selectedCourseId: string | "all";
  selectedDate: Date;
  sessionDraft?: { courseId?: string; meetingId?: string; anchorDate?: Date; start?: string; end?: string };
  onClose: () => void;
  onSave: (courseId: string, meetings: CourseMeeting[], replaceMode: "replace" | "append") => void;
}

export function SessionEditorModal({
  courses,
  selectedCourseId,
  selectedDate,
  sessionDraft,
  onClose,
  onSave
}: SessionEditorModalProps) {
  const editingCourse = sessionDraft?.courseId ? courses.find((course) => course.id === sessionDraft.courseId) : undefined;
  const editingMeeting = editingCourse?.meetings.find((meeting) => meeting.id === sessionDraft?.meetingId);
  const defaultDate = sessionDraft?.anchorDate ?? selectedDate;
  const initialCourseId =
    editingCourse?.id ??
    (selectedCourseId !== "all" && courses.some((course) => course.id === selectedCourseId) ? selectedCourseId : courses[0]?.id ?? "");
  const initialDay = getWeekDayFromDate(defaultDate);
  const [courseId, setCourseId] = useState(initialCourseId);
  const [title, setTitle] = useState(editingMeeting ? (editingMeeting.title?.trim() || editingCourse?.name || "") : "");
  const [start, setStart] = useState(editingMeeting?.start ?? sessionDraft?.start ?? "09:00");
  const [end, setEnd] = useState(editingMeeting?.end ?? sessionDraft?.end ?? "10:30");
  const [location, setLocation] = useState(editingMeeting?.location ?? "");
  const [notes, setNotes] = useState(editingMeeting?.notes ?? "");
  const [type, setType] = useState<CourseMeeting["type"]>(editingMeeting?.type ?? "lecture");
  const [isAllDay, setIsAllDay] = useState(editingMeeting?.isAllDay ?? false);
  const [anchorDate, setAnchorDate] = useState(formatDateKey(new Date(editingMeeting?.anchorDate ?? defaultDate)));
  const [cadence, setCadence] = useState<SessionCadence>(editingMeeting?.recurrence?.cadence ?? "weekly");
  const [interval, setInterval] = useState(editingMeeting?.recurrence?.interval ?? 1);
  const [repeatDays, setRepeatDays] = useState<WeekDay[]>(editingMeeting?.recurrence?.daysOfWeek ?? [editingMeeting?.day ?? initialDay]);
  const [until, setUntil] = useState(editingMeeting?.recurrence?.until?.slice(0, 10) ?? "");
  const [count, setCount] = useState(editingMeeting?.recurrence?.count ? String(editingMeeting.recurrence.count) : "");

  useEffect(() => {
    const nextMeeting = editingCourse?.meetings.find((meeting) => meeting.id === sessionDraft?.meetingId);
    const nextDate = sessionDraft?.anchorDate ?? selectedDate;
    setCourseId(editingCourse?.id ?? initialCourseId);
    setTitle(nextMeeting ? (nextMeeting.title?.trim() || editingCourse?.name || "") : "");
    setStart(nextMeeting?.start ?? sessionDraft?.start ?? "09:00");
    setEnd(nextMeeting?.end ?? sessionDraft?.end ?? "10:30");
    setLocation(nextMeeting?.location ?? "");
    setNotes(nextMeeting?.notes ?? "");
    setType(nextMeeting?.type ?? "lecture");
    setIsAllDay(nextMeeting?.isAllDay ?? false);
    setAnchorDate(formatDateKey(new Date(nextMeeting?.anchorDate ?? nextDate)));
    setCadence(nextMeeting?.recurrence?.cadence ?? "weekly");
    setInterval(nextMeeting?.recurrence?.interval ?? 1);
    setRepeatDays(nextMeeting?.recurrence?.daysOfWeek ?? [nextMeeting?.day ?? getWeekDayFromDate(nextDate)]);
    setUntil(nextMeeting?.recurrence?.until?.slice(0, 10) ?? "");
    setCount(nextMeeting?.recurrence?.count ? String(nextMeeting.recurrence.count) : "");
  }, [editingCourse, sessionDraft, selectedDate, initialCourseId]);

  const conflicts = useMemo(() => {
    if (isAllDay || !courseId) return [];
    const meeting = buildCourseMeeting({
      existing: editingMeeting,
      day: getWeekDayFromDate(new Date(`${anchorDate}T12:00:00`)),
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
      count
    });
    return detectMeetingConflicts(courses, courseId, meeting, editingMeeting?.id);
  }, [courses, courseId, editingMeeting, start, end, anchorDate, title, location, notes, type, isAllDay, cadence, interval, repeatDays, until, count]);

  function saveSession() {
    if (!courseId) return;
    const course = courses.find((item) => item.id === courseId);
    if (!course) return;
    const meeting = buildCourseMeeting({
      existing: editingMeeting,
      day: getWeekDayFromDate(new Date(`${anchorDate}T12:00:00`)),
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
      count
    });
    if (editingMeeting) {
      onSave(
        courseId,
        course.meetings.map((item) => (item.id === editingMeeting.id ? meeting : item)),
        "replace"
      );
    } else {
      onSave(courseId, [meeting], "append");
    }
  }

  function duplicateSession() {
    if (!courseId) return;
    const meeting = buildCourseMeeting({
      day: getWeekDayFromDate(new Date(`${anchorDate}T12:00:00`)),
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
      existing: undefined,
      id: createId("meeting"),
      seriesId: createId("series")
    });
    onSave(courseId, [meeting], "append");
  }

  function deleteSession() {
    if (!editingMeeting || !courseId) return;
    const course = courses.find((item) => item.id === courseId);
    if (!course) return;
    onSave(courseId, course.meetings.filter((item) => item.id !== editingMeeting.id), "replace");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <Panel
        className="flex max-h-[88vh] w-full max-w-[960px] flex-col overflow-hidden bg-white/96 dark:bg-[#101317]/96"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey) return;
          const tag = (event.target as HTMLElement).tagName;
          if (tag === "TEXTAREA" || tag === "BUTTON" || tag === "A" || tag === "SELECT") return;
          event.preventDefault();
          saveSession();
        }}
      >
        <div className="mb-3 flex items-center justify-between border-b border-slate-200/80 pb-3 dark:border-white/10">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">{editingMeeting ? "Edit session" : "Add session"}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Course sessions behave like real calendar events now.</p>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-10 w-10 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto pr-1">
        <div className="grid gap-2.5 md:grid-cols-2">
          <select value={courseId} onChange={(event) => setCourseId(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]">
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Session title (optional)" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
          <select value={type} onChange={(event) => setType(event.target.value as CourseMeeting["type"])} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]">
            <option value="lecture">Lecture</option>
            <option value="lab">Lab</option>
            <option value="tutorial">Tutorial</option>
            <option value="office-hours">Office hours</option>
            <option value="exam">Exam</option>
            <option value="study">Study block</option>
          </select>
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm dark:border-white/10 dark:bg-white/[0.04]">
            <input checked={isAllDay} onChange={(event) => setIsAllDay(event.target.checked)} type="checkbox" />
            Full day
          </label>
          <input value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} type="date" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
            {getWeekDayFromDate(new Date(`${anchorDate}T12:00:00`))}
          </div>
          {!isAllDay && <input value={start} onChange={(event) => setStart(event.target.value)} type="time" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />}
          {!isAllDay && <input value={end} onChange={(event) => setEnd(event.target.value)} type="time" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />}
          <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
          <select value={cadence} onChange={(event) => setCadence(event.target.value as SessionCadence)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]">
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <input value={interval} onChange={(event) => setInterval(Math.max(1, Number(event.target.value) || 1))} type="number" min={1} placeholder="Every" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
          {cadence === "weekly" && (
            <div className="md:col-span-2">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">Repeats on</p>
              <div className="flex flex-wrap gap-1.5">
                {weekDays.map((weekDay) => {
                  const active = repeatDays.includes(weekDay);
                  return (
                    <button
                      key={weekDay}
                      type="button"
                      onClick={() => setRepeatDays((current) => active ? current.filter((item) => item !== weekDay) : [...current, weekDay])}
                      className={`rounded-full px-3 py-1 text-xs ${active ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300"}`}
                    >
                      {weekDay}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <input value={until} onChange={(event) => setUntil(event.target.value)} type="date" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
          <input value={count} onChange={(event) => setCount(event.target.value)} type="number" min={1} placeholder="Occurrences limit" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" className="min-h-[72px] max-h-[112px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none md:col-span-2 dark:border-white/10 dark:bg-white/[0.04]" />
          {conflicts.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 md:col-span-2 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="font-medium">Possible conflicts</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {conflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}
              </ul>
            </div>
          )}
        </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-200/80 pt-3 dark:border-white/10">
          <div className="flex gap-2">
            {editingMeeting && (
              <>
                <Button variant="outline" onClick={duplicateSession}>
                  <Copy className="mr-1 h-4 w-4" />
                  Duplicate
                </Button>
                <Button variant="outline" className="text-rose-500" onClick={deleteSession}>
                  <Trash2 className="mr-1 h-4 w-4" />
                  Delete
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={saveSession}>{editingMeeting ? "Save changes" : "Add to calendar"}</Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
