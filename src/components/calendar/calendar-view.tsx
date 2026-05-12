"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { BookOpen, CalendarPlus, Star, X } from "lucide-react";
import type { CalendarHolidayChip } from "@/lib/calendar-holidays";
import {
  hebcalPillClasses,
  indexHolidayChipsByDate,
  readCachedHolidayYear,
  writeCachedHolidayYear
} from "@/lib/calendar-holidays";
import {
  addDays,
  CALENDAR_WEEK_DAYS as weekDays,
  expandMeetingOccurrences,
  expandPersonalEventOccurrences,
  formatDateKey,
  getWeekDayFromDate,
  groupOccurrencesByDate,
  layoutOverlappingEvents,
  parseTimeValue,
  PERSONAL_EVENTS_COURSE_ID,
  startOfWeekGrid,
  type SessionOccurrence
} from "@/lib/calendar-occurrences";
import { formatHourMinutes, sameCalendarDate, softCourseStyle } from "@/lib/calendar-utils";
import { resolveWeekColumnKeyFromPoint, getCurrentTimePosition } from "@/lib/calendar-pointer";
import { buildCourseMeeting, type SessionCadence } from "@/lib/course-meeting-builder";
import { createId } from "@/lib/id";
import { formatDue, isOverdue, nowIso } from "@/lib/date";
import { taskComparator } from "@/lib/task-comparator";
import type { Course, CourseMeeting, PersonalEvent, Task, WeekDay, WorkBlock } from "@/lib/types";
import { buildBookedBlockByTaskId } from "@/lib/work-block-utils";
import { Button, Panel } from "@/components/ui";
import { SessionCard } from "@/components/calendar/session-card";
import type { SessionDragInfo, SelectedSession as CalendarSelectedSession } from "@/components/calendar/session-card";
import { WorkBlockCard } from "@/components/calendar/work-block-card";

type QuickSessionType = "lecture" | "tutorial";

export function CalendarView({
  tasks,
  workBlocks,
  courses,
  personalEvents,
  mode,
  onMode,
  selectedDate,
  onSelectDate,
  visibleCourseIds,
  onSessionClick,
  onSessionDoubleClick,
  onClearSessionSelection,
  selectedSession,
  onUpdateCourse,
  onAddCourse,
  onAddPersonalEvent,
  onUpdatePersonalEvent,
  onSplitPersonalEvent,
  onAddWorkBlock,
  onUpdateWorkBlock,
  onDeleteWorkBlock,
  onOpenTask,
  tentativeOptions,
  tentativeChoiceTitle,
  onPickTentativeOption,
  newlyAddedCourseId,
  onOpenWeeklyCatchUp,
  onAppleCalendarSync,
  onOpenTabGuide,
  catchUpOwnerToolbar
}: {
  tasks: Task[];
  workBlocks: WorkBlock[];
  courses: Course[];
  personalEvents: PersonalEvent[];
  mode: "month" | "week" | "day";
  onMode: (mode: "month" | "week" | "day") => void;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  visibleCourseIds: string[];
  onSessionClick: (courseId: string, meetingId: string, anchorDate?: Date) => void;
  onSessionDoubleClick?: (courseId: string, meetingId: string, anchorDate?: Date) => void;
  onClearSessionSelection?: () => void;
  selectedSession?: { courseId: string; meetingId: string; anchorDate: Date };
  onUpdateCourse: (course: Partial<Course> & { id: string }) => void;
  onAddCourse: (course: {
    id?: string;
    name: string;
    code: string;
    source?: string;
    externalCourseId?: string;
    catalogLastSyncedAt?: string;
    color: string;
    instructor?: string;
    notes?: string;
    meetings?: Course["meetings"];
    progressMode?: "manual" | "computed";
    manualProgress?: number;
  }) => void;
  onAddPersonalEvent: (event: Omit<PersonalEvent, "createdAt" | "updatedAt">) => void;
  onUpdatePersonalEvent: (event: Partial<PersonalEvent> & { id: string }) => void;
  onDeletePersonalEvent: (id: string) => void;
  onSplitPersonalEvent: (original: PersonalEvent, detachedId: string, updatedOriginal: Partial<PersonalEvent> & { id: string }, newEvent: Omit<PersonalEvent, "createdAt" | "updatedAt">) => void;
  onAddWorkBlock: (block: Omit<WorkBlock, "id" | "createdAt">) => void;
  onUpdateWorkBlock: (block: Partial<WorkBlock> & { id: string }) => void;
  onDeleteWorkBlock: (id: string) => void;
  onOpenTask: (taskId: string) => void;
  tentativeOptions?: Array<{
    optionId: string;
    optionIndex: number;
    displayLabel: string;
    label: string;
    courseId: string;
    courseName: string;
    courseColor: string;
    meetings: CourseMeeting[];
  }>;
  tentativeChoiceTitle?: string;
  onPickTentativeOption?: (optionId: string) => void;
  newlyAddedCourseId?: string | null;
  /** Week view: Sun–Thu catch-up + progress; anchor = Sunday-based week to open (e.g. pane’s week during transition). */
  onOpenWeeklyCatchUp?: (weekAnchorDate: Date) => void;
  /** Apple Calendar / .ics: subscription URL when signed in, or one-time download. */
  onAppleCalendarSync?: () => void;
  /** Open the per-tab Guide drawer for Calendar shortcuts. */
  onOpenTabGuide?: () => void;
  /** Optional extra controls next to “Weekly catch-up” (e.g. owner demo / reset). */
  catchUpOwnerToolbar?: ReactNode;
}) {
  const visibleCourses = useMemo(() => courses.filter((course) => visibleCourseIds.includes(course.id)), [courses, visibleCourseIds]);
  const courseMap = useMemo(() => Object.fromEntries(courses.map((course) => [course.id, course])), [courses]);
  const bookedBlockByTaskId = useMemo(() => buildBookedBlockByTaskId(workBlocks), [workBlocks]);
  const tasksByCourseId = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    for (const task of tasks) {
      if (task.status === "done") continue;
      if (task.courseId === "general") continue;
      const arr = grouped.get(task.courseId) ?? [];
      arr.push(task);
      grouped.set(task.courseId, arr);
    }
    for (const [courseId, courseTasks] of grouped) {
      grouped.set(courseId, [...courseTasks].sort(taskComparator));
    }
    return grouped;
  }, [tasks]);
  const timelineHours = Array.from({ length: 24 }, (_, index) => index);
  const dayHourHeight = 64;
  const today = new Date();
  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const monthGridStart = startOfWeekGrid(monthStart, "sunday");
  const monthDays = Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index));
  const weekStart = startOfWeekGrid(selectedDate, "sunday");
  const weekDates = weekDays.map((_, index) => addDays(weekStart, index));
  const rangeStart = mode === "month" ? monthDays[0] : mode === "week" ? weekDates[0] : selectedDate;
  const rangeEnd = mode === "month" ? monthDays[41] : mode === "week" ? weekDates[6] : selectedDate;
  const sessionOccurrences = useMemo(
    () => [
      ...expandMeetingOccurrences(visibleCourses, rangeStart, rangeEnd),
      ...expandPersonalEventOccurrences(personalEvents, rangeStart, rangeEnd)
    ],
    [visibleCourses, personalEvents, rangeStart, rangeEnd]
  );
  const tentativeOccurrences = useMemo(() => {
    if (!tentativeOptions?.length) return [];
    const pseudoCourses: Course[] = tentativeOptions.map((option) => ({
      id: option.optionId,
      name: `${option.displayLabel} (${option.label})`,
      code: option.optionId,
      color: option.courseColor,
      archived: false,
      notes: "",
      meetings: option.meetings,
      grading: [],
      progressMode: "manual",
      manualProgress: 0,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }));
    return expandMeetingOccurrences(pseudoCourses, rangeStart, rangeEnd);
  }, [rangeEnd, rangeStart, tentativeOptions]);
  const tentativeByDate = useMemo(() => groupOccurrencesByDate(tentativeOccurrences), [tentativeOccurrences]);
  const tentativeOptionSummary = useMemo(() => {
    if (!tentativeOptions?.length) return null;
    const counts = tentativeOptions.map((opt) => opt.meetings.length).filter((count) => Number.isFinite(count));
    const minBlocks = counts.length > 0 ? Math.min(...counts) : 0;
    const maxBlocks = counts.length > 0 ? Math.max(...counts) : 0;
    return {
      optionCount: tentativeOptions.length,
      minBlocks,
      maxBlocks
    };
  }, [tentativeOptions]);

  const sessionByDate = groupOccurrencesByDate(sessionOccurrences);
  const taskByDay = useMemo(() => {
    return tasks.reduce<Record<string, Task[]>>((acc, task) => {
      if (!task.dueAt) return acc;
      const key = task.dueAt.slice(0, 10);
      acc[key] = [...(acc[key] ?? []), task];
      return acc;
    }, {});
  }, [tasks]);
  const selectedKey = formatDateKey(selectedDate);
  const scheduledWorkBlocks = useMemo(
    () => workBlocks.filter((block) => block.status === "scheduled"),
    [workBlocks]
  );
  const workBlocksByDate = useMemo(() => {
    return scheduledWorkBlocks.reduce<Record<string, WorkBlock[]>>((acc, block) => {
      const key = formatDateKey(new Date(block.startAt));
      acc[key] = [...(acc[key] ?? []), block];
      return acc;
    }, {});
  }, [scheduledWorkBlocks]);
  const selectedDaySessions = (sessionByDate[selectedKey] ?? []).sort((a, b) => {
    if (a.meeting.isAllDay && !b.meeting.isAllDay) return -1;
    if (!a.meeting.isAllDay && b.meeting.isAllDay) return 1;
    return a.meeting.start.localeCompare(b.meeting.start);
  });
  const selectedDayWorkBlocks = useMemo(() => {
    return (workBlocksByDate[selectedKey] ?? [])
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [workBlocksByDate, selectedKey]);
  const futureScheduledTaskIds = useMemo(() => {
    const nowTs = Date.now();
    return new Set(
      workBlocks
        .filter((block) => block.status === "scheduled" && new Date(block.startAt).getTime() > nowTs)
        .map((block) => block.taskId)
    );
  }, [workBlocks]);
  const weekOccurrencesByDay = weekDates.map((date) => {
    const key = formatDateKey(date);
    return {
      date,
      key,
      sessions: sessionByDate[key] ?? [],
      tasks: taskByDay[key] ?? []
    };
  });
  const WEEK_TIMELINE_ROW_PX = 64;
  const currentTimeTopWeek = getCurrentTimePosition(
    today,
    timelineHours[0],
    timelineHours[timelineHours.length - 1] + 1,
    WEEK_TIMELINE_ROW_PX
  );
  const currentTimeTopDay = getCurrentTimePosition(today, timelineHours[0], timelineHours[timelineHours.length - 1] + 1, dayHourHeight);
  const [draggingSession, setDraggingSession] = useState<{
    courseId: string;
    meetingId: string;
    durationMinutes: number;
    grabOffsetRatio: number;
    sourceDate: Date;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ date: Date; startMinutes: number; endMinutes: number } | null>(null);
  const [resizingSession, setResizingSession] = useState<{
    courseId: string;
    meetingId: string;
    edge: "start" | "end";
    startMinutes: number;
    endMinutes: number;
    dateKey: string;
  } | null>(null);
  const [sessionResizePreview, setSessionResizePreview] = useState<{
    courseId: string;
    meetingId: string;
    startMinutes: number;
    endMinutes: number;
    dateKey: string;
  } | null>(null);
  const [creatingSession, setCreatingSession] = useState<{
    date: Date;
    startMinutes: number;
    endMinutes: number;
    hasDragged: boolean;
    pointerX: number;
    columnLeft: number;
    columnRight: number;
    columnTop: number;
  } | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [taskDropPreview, setTaskDropPreview] = useState<{ startMinutes: number; endMinutes: number } | null>(null);
  const [draggingWorkBlock, setDraggingWorkBlock] = useState<{ id: string; durationMinutes: number } | null>(null);
  const [workBlockDragPreview, setWorkBlockDragPreview] = useState<{
    id: string;
    startMinutes: number;
    endMinutes: number;
    dateKey?: string;
  } | null>(null);
  const [resizingWorkBlock, setResizingWorkBlock] = useState<{
    id: string;
    edge: "start" | "end";
    startMinutes: number;
    endMinutes: number;
    dateKey?: string;
  } | null>(null);
  const [workBlockResizePreview, setWorkBlockResizePreview] = useState<{
    id: string;
    startMinutes: number;
    endMinutes: number;
    dateKey?: string;
  } | null>(null);
  const [activeWorkBlockId, setActiveWorkBlockId] = useState<string | null>(null);
  const [recurrenceMovePrompt, setRecurrenceMovePrompt] = useState<{
    courseId: string;
    meetingId: string;
    sourceDate: Date;
    targetDate: Date;
    startMinutes: number;
  } | null>(null);
  const [hebcalByYear, setHebcalByYear] = useState<Record<number, CalendarHolidayChip[]>>({});
  const [hebcalHolidayFetchBusy, setHebcalHolidayFetchBusy] = useState(false);
  const hebcalItemsByDate = useMemo(
    () => indexHolidayChipsByDate(Object.values(hebcalByYear).flat()),
    [hebcalByYear]
  );
  const [weekTransition, setWeekTransition] = useState<{ direction: "prev" | "next"; fromDate: Date; toDate: Date } | null>(null);
  const [weekTransitionActive, setWeekTransitionActive] = useState(false);
  const weekTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dayTransition, setDayTransition] = useState<{ direction: "prev" | "next"; fromDate: Date; toDate: Date } | null>(null);
  const [dayTransitionActive, setDayTransitionActive] = useState(false);
  const [hoveredTentativeOptionId, setHoveredTentativeOptionId] = useState<string | null>(null);
  const [quickCreateDraft, setQuickCreateDraft] = useState<{
    mode: "create" | "edit";
    date: Date;
    start: string;
    end: string;
    courseId: string;
    meetingId?: string;
    isAllDay: boolean;
    title: string;
    location: string;
    sessionType: QuickSessionType;
    cadence: SessionCadence;
    repeatDays: WeekDay[];
    detailsOpen: boolean;
  } | null>(null);
  const [quickCreateAnchor, setQuickCreateAnchor] = useState<{ left: number; top: number } | null>(null);
  const QUICK_CREATE_POPOVER_WIDTH = 300;
  const QUICK_CREATE_POPOVER_ESTIMATED_HEIGHT = 320;
  const tentativeBlockRef = useRef<HTMLDivElement | null>(null);
  const quickDraftBlockRef = useRef<HTMLDivElement | null>(null);
  const weekGridBodyRef = useRef<HTMLDivElement | null>(null);
  const dayGridBodyRef = useRef<HTMLDivElement | null>(null);
  const dayTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const calendarScrollTopRef = useRef<number | null>(null);
  const syncedCalendarScrollElsRef = useRef<WeakSet<Element>>(new WeakSet());
  /** Week grid hour row height, tuned to show more daytime hours at once. */
  const weekWbInteractionRef = useRef<{
    dragPreview: { id: string; startMinutes: number; endMinutes: number; dateKey?: string } | null;
    resizePreview: { id: string; startMinutes: number; endMinutes: number; dateKey?: string } | null;
  }>({ dragPreview: null, resizePreview: null });

  useEffect(() => {
    if ((tentativeOptions?.length ?? 0) > 0) return;
    setHoveredTentativeOptionId(null);
  }, [tentativeOptions]);

  const syncCalendarScrollEl = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    if (syncedCalendarScrollElsRef.current.has(el)) return;
    let top: number;
    if (mode === "week") {
      top = 8 * WEEK_TIMELINE_ROW_PX;
    } else if (mode === "day") {
      const pos = getCurrentTimePosition(new Date(), 0, 24, dayHourHeight);
      top = pos != null ? Math.max(0, pos - dayHourHeight) : 8 * dayHourHeight;
    } else {
      top = calendarScrollTopRef.current ?? 0;
    }
    el.scrollTop = top;
    calendarScrollTopRef.current = el.scrollTop;
    syncedCalendarScrollElsRef.current.add(el);
  }, [dayHourHeight, mode]);

  useLayoutEffect(() => {
    syncedCalendarScrollElsRef.current = new WeakSet();
  }, [mode]);

  function navigate(direction: "prev" | "next") {
    if (mode === "week" && weekTransition) return;
    const next = new Date(selectedDate);
    if (mode === "month") {
      next.setMonth(selectedDate.getMonth() + (direction === "next" ? 1 : -1));
    } else if (mode === "week") {
      const fromDate = new Date(selectedDate);
      next.setDate(selectedDate.getDate() + (direction === "next" ? 7 : -7));
      setWeekTransition({ direction, fromDate, toDate: new Date(next) });
      setWeekTransitionActive(false);
      requestAnimationFrame(() => setWeekTransitionActive(true));
      if (weekTransitionTimeoutRef.current) clearTimeout(weekTransitionTimeoutRef.current);
      weekTransitionTimeoutRef.current = setTimeout(() => {
        setWeekTransition(null);
        setWeekTransitionActive(false);
        weekTransitionTimeoutRef.current = null;
      }, 430);
    } else if (mode === "day") {
      const fromDate = new Date(selectedDate);
      next.setDate(selectedDate.getDate() + (direction === "next" ? 1 : -1));
      setDayTransition({ direction, fromDate, toDate: new Date(next) });
      setDayTransitionActive(false);
      requestAnimationFrame(() => setDayTransitionActive(true));
      if (dayTransitionTimeoutRef.current) clearTimeout(dayTransitionTimeoutRef.current);
      dayTransitionTimeoutRef.current = setTimeout(() => {
        setDayTransition(null);
        setDayTransitionActive(false);
        dayTransitionTimeoutRef.current = null;
      }, 430);
    } else {
      next.setDate(selectedDate.getDate() + (direction === "next" ? 1 : -1));
    }
    onSelectDate(next);
  }

  function minutesFromPointer(clientY: number, bounds: DOMRect, hourHeight = 80): number {
    const relativeY = Math.max(0, Math.min(bounds.height, clientY - bounds.top));
    const hourStart = timelineHours[0];
    const rawMinutes = hourStart * 60 + (relativeY / hourHeight) * 60;
    return Math.round(rawMinutes / 15) * 15;
  }

  function moveMeetingAtMinutes(courseId: string, meetingId: string, targetDate: Date, startMinutes: number) {
    if (courseId === PERSONAL_EVENTS_COURSE_ID) {
      const evt = personalEvents.find((e) => e.id === meetingId);
      if (!evt || evt.isAllDay) return;
      const duration = Math.max(0.5, parseTimeValue(evt.end) - parseTimeValue(evt.start));
      const nextDay = getWeekDayFromDate(targetDate);
      onUpdatePersonalEvent({
        id: evt.id,
        day: nextDay,
        start: formatHourMinutes(startMinutes),
        end: formatHourMinutes(startMinutes + duration * 60),
        anchorDate: new Date(`${formatDateKey(targetDate)}T12:00:00`).toISOString(),
        recurrence: evt.recurrence?.cadence === "weekly"
          ? { ...evt.recurrence, daysOfWeek: [nextDay] }
          : evt.recurrence
      });
      return;
    }
    const course = courses.find((item) => item.id === courseId);
    const meeting = course?.meetings.find((item) => item.id === meetingId);
    if (!course || !meeting || meeting.isAllDay) return;
    const duration = Math.max(0.5, parseTimeValue(meeting.end) - parseTimeValue(meeting.start));
    const nextStart = formatHourMinutes(startMinutes);
    const nextEnd = formatHourMinutes(startMinutes + duration * 60);
    const nextDay = getWeekDayFromDate(targetDate);

    onUpdateCourse({
      id: course.id,
      meetings: course.meetings.map((item) =>
        item.id === meetingId
          ? {
              ...item,
              day: nextDay,
              start: nextStart,
              end: nextEnd,
              anchorDate: new Date(`${formatDateKey(targetDate)}T12:00:00`).toISOString(),
              recurrence:
                item.recurrence?.cadence === "weekly"
                  ? {
                      ...item.recurrence,
                      daysOfWeek: [nextDay]
                    }
                  : item.recurrence
            }
          : item
      )
    });
  }

  function moveMeetingSingleOccurrenceAtMinutes(
    courseId: string,
    meetingId: string,
    sourceDate: Date,
    targetDate: Date,
    startMinutes: number
  ) {
    if (courseId === PERSONAL_EVENTS_COURSE_ID) {
      const evt = personalEvents.find((e) => e.id === meetingId);
      if (!evt || evt.isAllDay) return;
      const duration = Math.max(0.5, parseTimeValue(evt.end) - parseTimeValue(evt.start));
      const nextDay = getWeekDayFromDate(targetDate);
      const sourceKey = formatDateKey(sourceDate);
      const baseRecurrence = evt.recurrence ?? { cadence: "weekly" as const, interval: 1, daysOfWeek: [evt.day] };
      const nextExceptions = Array.from(new Set([...(baseRecurrence.exceptions ?? []), sourceKey]));
      const detachedId = createId("pevt");
      onSplitPersonalEvent(
        evt,
        detachedId,
        { id: evt.id, recurrence: { ...baseRecurrence, exceptions: nextExceptions } },
        {
          id: detachedId,
          title: evt.title,
          color: evt.color,
          day: nextDay,
          start: formatHourMinutes(startMinutes),
          end: formatHourMinutes(startMinutes + duration * 60),
          anchorDate: new Date(`${formatDateKey(targetDate)}T12:00:00`).toISOString(),
          recurrence: { cadence: "none", interval: 1 }
        }
      );
      return;
    }
    const course = courses.find((item) => item.id === courseId);
    const meeting = course?.meetings.find((item) => item.id === meetingId);
    if (!course || !meeting || meeting.isAllDay) return;
    const duration = Math.max(0.5, parseTimeValue(meeting.end) - parseTimeValue(meeting.start));
    const nextStart = formatHourMinutes(startMinutes);
    const nextEnd = formatHourMinutes(startMinutes + duration * 60);
    const nextDay = getWeekDayFromDate(targetDate);
    const sourceKey = formatDateKey(sourceDate);
    const baseRecurrence = meeting.recurrence ?? { cadence: "weekly", interval: 1, daysOfWeek: [meeting.day] };
    const nextExceptions = Array.from(new Set([...(baseRecurrence.exceptions ?? []), sourceKey]));
    const detachedId = createId("meeting");

    onUpdateCourse({
      id: course.id,
      meetings: [
        ...course.meetings.map((item) =>
          item.id === meetingId
            ? {
                ...item,
                recurrence: {
                  ...baseRecurrence,
                  exceptions: nextExceptions
                }
              }
            : item
        ),
        {
          ...meeting,
          id: detachedId,
          seriesId: meeting.seriesId ?? createId("series"),
          day: nextDay,
          start: nextStart,
          end: nextEnd,
          anchorDate: new Date(`${formatDateKey(targetDate)}T12:00:00`).toISOString(),
          recurrence: { cadence: "none", interval: 1 }
        }
      ]
    });
  }

  function resizeMeetingAtMinutes(courseId: string, meetingId: string, startMinutes: number, endMinutes: number, anchorDate: Date) {
    if (courseId === PERSONAL_EVENTS_COURSE_ID) {
      const evt = personalEvents.find((e) => e.id === meetingId);
      if (!evt || evt.isAllDay) return;
      onUpdatePersonalEvent({
        id: evt.id,
        start: formatHourMinutes(startMinutes),
        end: formatHourMinutes(Math.max(startMinutes + 15, endMinutes)),
        anchorDate: new Date(`${formatDateKey(anchorDate)}T12:00:00`).toISOString()
      });
      return;
    }
    const course = courses.find((item) => item.id === courseId);
    const meeting = course?.meetings.find((item) => item.id === meetingId);
    if (!course || !meeting || meeting.isAllDay) return;
    const nextStart = formatHourMinutes(startMinutes);
    const nextEnd = formatHourMinutes(Math.max(startMinutes + 15, endMinutes));
    onUpdateCourse({
      id: course.id,
      meetings: course.meetings.map((item) =>
        item.id === meetingId
          ? {
              ...item,
              start: nextStart,
              end: nextEnd,
              anchorDate: new Date(`${formatDateKey(anchorDate)}T12:00:00`).toISOString()
            }
          : item
      )
    });
  }

  function calculateDraggedSlot(
    clientY: number,
    bounds: DOMRect,
    durationMinutes: number,
    minMinutesOverride?: number,
    hourHeight = 80,
    pointerOffsetMinutes = 0
  ) {
    const relativeY = Math.max(0, Math.min(bounds.height, clientY - bounds.top));
    const hourStart = timelineHours[0];
    const rawMinutes = hourStart * 60 + (relativeY / hourHeight) * 60;
    const snappedMinutes = Math.round((rawMinutes - pointerOffsetMinutes) / 15) * 15;
    const minMinutes = minMinutesOverride ?? hourStart * 60;
    const maxMinutes = (timelineHours[timelineHours.length - 1] + 1) * 60 - durationMinutes;
    const startMinutes = Math.max(minMinutes, Math.min(maxMinutes, snappedMinutes));
    return {
      startMinutes,
      endMinutes: startMinutes + durationMinutes
    };
  }

  function startCreateSession(date: Date, clientY: number, clientX: number, bounds: DOMRect, hourHeight = 80) {
    const startMinutes = minutesFromPointer(clientY, bounds, hourHeight);
    setCreatingSession({
      date,
      startMinutes,
      endMinutes: startMinutes + 60,
      hasDragged: false,
      pointerX: clientX,
      columnLeft: bounds.left,
      columnRight: bounds.right,
      columnTop: bounds.top
    });
  }

  function updateCreateSession(clientY: number, clientX: number, bounds: DOMRect, hourHeight = 80) {
    setCreatingSession((current) => {
      if (!current) return current;
      const nextMinutes = minutesFromPointer(clientY, bounds, hourHeight);
      // Strict drag-only creation: ignore zero-distance updates from simple clicks.
      if (nextMinutes === current.startMinutes) {
        return current;
      }
      const lower = Math.min(current.startMinutes, nextMinutes);
      const upper = Math.max(current.startMinutes, nextMinutes + 15);
      return {
        ...current,
        startMinutes: lower,
        endMinutes: upper,
        hasDragged: true,
        pointerX: clientX,
        columnLeft: bounds.left,
        columnRight: bounds.right,
        columnTop: bounds.top
      };
    });
  }

  function finishCreateSession() {
    if (!creatingSession) return;
    if (!creatingSession.hasDragged) {
      setCreatingSession(null);
      return;
    }
    const start = formatHourMinutes(creatingSession.startMinutes);
    const end = formatHourMinutes(creatingSession.endMinutes);
    const defaultCourseId = PERSONAL_EVENTS_COURSE_ID;
    setQuickCreateDraft({
      mode: "create",
      date: creatingSession.date,
      start,
      end,
      courseId: defaultCourseId,
      title: "",
      location: "",
      sessionType: "lecture",
      isAllDay: false,
      cadence: "none",
      repeatDays: [getWeekDayFromDate(creatingSession.date)],
      detailsOpen: false
    });
    const topPx = ((creatingSession.startMinutes - timelineHours[0] * 60) / 60) * (mode === "week" ? WEEK_TIMELINE_ROW_PX : dayHourHeight);
    const popoverWidth = QUICK_CREATE_POPOVER_WIDTH;
    const popoverHeight = QUICK_CREATE_POPOVER_ESTIMATED_HEIGHT;
    const blockRect = tentativeBlockRef.current?.getBoundingClientRect() ?? null;
    const clampLeft = (value: number) => Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, value));
    const clampTop = (value: number) => Math.max(12, Math.min(window.innerHeight - popoverHeight - 12, value));
    if (blockRect) {
      const preferredLeft = blockRect.right + 2;
      const fallbackLeft = blockRect.left - popoverWidth - 2;
      const left = preferredLeft + popoverWidth <= window.innerWidth - 12 ? preferredLeft : fallbackLeft;
      setQuickCreateAnchor({
        left: clampLeft(left),
        top: clampTop(blockRect.top)
      });
      setCreatingSession(null);
      return;
    }
    if (mode === "week" && weekGridBodyRef.current) {
      const scrollEl = weekGridBodyRef.current.closest(".calendar-scroll-area") as HTMLElement | null;
      const scrollTop = scrollEl?.scrollTop ?? 0;
      const blockViewportTop = creatingSession.columnTop + topPx - scrollTop;
      const blockLeft = creatingSession.columnLeft + 6;
      const blockRight = creatingSession.columnRight - 6;
      const preferredLeft = blockRight + 2;
      const fallbackLeft = blockLeft - popoverWidth - 2;
      const left = preferredLeft + popoverWidth <= window.innerWidth - 12 ? preferredLeft : fallbackLeft;
      setQuickCreateAnchor({
        left: clampLeft(left),
        top: clampTop(blockViewportTop)
      });
    } else if (mode === "day" && dayGridBodyRef.current) {
      const scrollEl = dayGridBodyRef.current.closest(".calendar-scroll-area") as HTMLElement | null;
      const scrollTop = scrollEl?.scrollTop ?? 0;
      const blockViewportTop = creatingSession.columnTop + topPx - scrollTop;
      const blockLeft = creatingSession.columnLeft + 8;
      const blockRight = creatingSession.columnRight - 8;
      const preferredLeft = blockRight + 2;
      const fallbackLeft = blockLeft - popoverWidth - 2;
      const left = preferredLeft + popoverWidth <= window.innerWidth - 12 ? preferredLeft : fallbackLeft;
      setQuickCreateAnchor({
        left: clampLeft(left),
        top: clampTop(blockViewportTop)
      });
    } else {
      setQuickCreateAnchor({ left: window.innerWidth - 380, top: 140 });
    }
    setCreatingSession(null);
  }

  function openQuickEditorForSession(course: Course, meeting: CourseMeeting, anchorDate: Date, anchorRect?: DOMRect) {
    const recurrence = meeting.recurrence;
    const cadence: SessionCadence = recurrence?.cadence === "weekly" ? "weekly" : "none";
    const startMinutes = parseTimeValue(meeting.start) * 60;
    setQuickCreateDraft({
      mode: "edit",
      date: anchorDate,
      start: meeting.start,
      end: meeting.end,
      courseId: course.id,
      meetingId: meeting.id,
      isAllDay: Boolean(meeting.isAllDay),
      title: meeting.title?.trim() || course.name,
      location: meeting.location ?? "",
      sessionType: meeting.type === "tutorial" ? "tutorial" : "lecture",
      cadence,
      repeatDays: recurrence?.daysOfWeek?.length ? recurrence.daysOfWeek : [meeting.day],
      detailsOpen: false
    });
    const popoverWidth = QUICK_CREATE_POPOVER_WIDTH;
    const popoverHeight = QUICK_CREATE_POPOVER_ESTIMATED_HEIGHT;
    const topPx = ((startMinutes - timelineHours[0] * 60) / 60) * (mode === "week" ? WEEK_TIMELINE_ROW_PX : dayHourHeight);
    const clampLeft = (value: number) => Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, value));
    const clampTop = (value: number) => Math.max(12, Math.min(window.innerHeight - popoverHeight - 12, value));
    if (anchorRect) {
      const preferredLeft = anchorRect.right + 2;
      const fallbackLeft = anchorRect.left - popoverWidth - 2;
      const left = preferredLeft + popoverWidth <= window.innerWidth - 12 ? preferredLeft : fallbackLeft;
      setQuickCreateAnchor({
        left: clampLeft(left),
        top: clampTop(anchorRect.top)
      });
      return;
    }
    if (mode === "week" && weekGridBodyRef.current) {
      const dayIndex = weekDates.findIndex((d) => sameCalendarDate(d, anchorDate));
      const weekColumns = Array.from(weekGridBodyRef.current.querySelectorAll("[data-week-column]")) as HTMLElement[];
      const columnEl = dayIndex >= 0 ? weekColumns[dayIndex] ?? null : null;
      const rect = (columnEl ?? weekGridBodyRef.current).getBoundingClientRect();
      const scrollEl = weekGridBodyRef.current.closest(".calendar-scroll-area") as HTMLElement | null;
      const scrollTop = scrollEl?.scrollTop ?? 0;
      const blockViewportTop = rect.top + topPx - scrollTop;
      const blockLeft = rect.left + 6;
      const blockRight = rect.right - 6;
      const preferredLeft = blockRight + 2;
      const fallbackLeft = blockLeft - popoverWidth - 2;
      const left = preferredLeft + popoverWidth <= window.innerWidth - 12 ? preferredLeft : fallbackLeft;
      setQuickCreateAnchor({
        left: clampLeft(left),
        top: clampTop(blockViewportTop)
      });
    } else if (mode === "day" && dayGridBodyRef.current) {
      const dayColumnEl = dayGridBodyRef.current.children.item(1) as HTMLElement | null;
      const rect = (dayColumnEl ?? dayGridBodyRef.current).getBoundingClientRect();
      const scrollEl = dayGridBodyRef.current.closest(".calendar-scroll-area") as HTMLElement | null;
      const scrollTop = scrollEl?.scrollTop ?? 0;
      const blockViewportTop = rect.top + topPx - scrollTop;
      const blockLeft = rect.left + 8;
      const blockRight = rect.right - 8;
      const preferredLeft = blockRight + 2;
      const fallbackLeft = blockLeft - popoverWidth - 2;
      const left = preferredLeft + popoverWidth <= window.innerWidth - 12 ? preferredLeft : fallbackLeft;
      setQuickCreateAnchor({
        left: clampLeft(left),
        top: clampTop(blockViewportTop)
      });
    } else {
      setQuickCreateAnchor({ left: window.innerWidth - 360, top: 140 });
    }
  }

  const clampQuickCreatePopoverToViewport = useCallback(() => {
    if (!quickCreateDraft || !quickCreateAnchor) return;
    const popover = document.getElementById("quick-create-popover");
    if (!popover) return;
    const rect = popover.getBoundingClientRect();
    const nextLeft = Math.max(12, Math.min(window.innerWidth - rect.width - 12, quickCreateAnchor.left));
    const nextTop = Math.max(12, Math.min(window.innerHeight - rect.height - 12, quickCreateAnchor.top));
    if (Math.abs(nextLeft - quickCreateAnchor.left) > 1 || Math.abs(nextTop - quickCreateAnchor.top) > 1) {
      setQuickCreateAnchor({ left: nextLeft, top: nextTop });
    }
  }, [quickCreateAnchor, quickCreateDraft]);

  useLayoutEffect(() => {
    clampQuickCreatePopoverToViewport();
  }, [clampQuickCreatePopoverToViewport]);

  useEffect(() => {
    if (!quickCreateDraft || !quickCreateAnchor) return;
    const popover = document.getElementById("quick-create-popover");
    if (!popover || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      clampQuickCreatePopoverToViewport();
    });
    observer.observe(popover);
    return () => observer.disconnect();
  }, [clampQuickCreatePopoverToViewport, quickCreateAnchor, quickCreateDraft]);

  const commitQuickCreateSession = useCallback(() => {
    const draft = quickCreateDraft;
    if (!draft) return;
    const meeting = buildCourseMeeting({
      day: getWeekDayFromDate(draft.date),
      start: draft.start,
      end: draft.end,
      anchorDate: formatDateKey(draft.date),
      title: draft.title,
      location: draft.location,
      notes: "",
      type: draft.sessionType,
      isAllDay: draft.isAllDay,
      cadence: draft.cadence,
      interval: 1,
      repeatDays: draft.repeatDays,
      until: "",
      count: ""
    });
    if (draft.courseId === PERSONAL_EVENTS_COURSE_ID) {
      const anchorIso = new Date(`${formatDateKey(draft.date)}T12:00:00`).toISOString();
      const recurrence: PersonalEvent["recurrence"] = draft.cadence === "weekly"
        ? { cadence: "weekly", interval: 1, daysOfWeek: draft.repeatDays }
        : { cadence: "none", interval: 1 };
      if (draft.mode === "edit" && draft.meetingId) {
        onUpdatePersonalEvent({
          id: draft.meetingId,
          title: draft.title.trim() || "Personal event",
          day: getWeekDayFromDate(draft.date),
          start: draft.isAllDay ? "00:00" : draft.start,
          end: draft.isAllDay ? "23:59" : draft.end,
          anchorDate: anchorIso,
          location: draft.location.trim() || undefined,
          isAllDay: draft.isAllDay,
          recurrence
        });
      } else {
        onAddPersonalEvent({
          id: meeting.id ?? createId("pevt"),
          title: draft.title.trim() || "Personal event",
          color: "#64748b",
          day: getWeekDayFromDate(draft.date),
          start: draft.isAllDay ? "00:00" : draft.start,
          end: draft.isAllDay ? "23:59" : draft.end,
          anchorDate: anchorIso,
          location: draft.location.trim() || undefined,
          isAllDay: draft.isAllDay,
          recurrence
        });
      }
      setQuickCreateDraft(null);
      setQuickCreateAnchor(null);
      return;
    }
    const course = courses.find((c) => c.id === draft.courseId);
    if (!course) return;
    if (draft.mode === "edit" && draft.meetingId) {
      onUpdateCourse({
        id: course.id,
        meetings: course.meetings.map((m) =>
          m.id === draft.meetingId
            ? {
                ...m,
                day: getWeekDayFromDate(draft.date),
                start: draft.isAllDay ? "00:00" : draft.start,
                end: draft.isAllDay ? "23:59" : draft.end,
                anchorDate: new Date(`${formatDateKey(draft.date)}T12:00:00`).toISOString(),
                title: draft.title.trim() || undefined,
                location: draft.location.trim() || undefined,
                type: draft.sessionType,
                isAllDay: draft.isAllDay,
                recurrence:
                  draft.cadence === "weekly"
                    ? {
                        ...(m.recurrence ?? {}),
                        cadence: "weekly",
                        interval: m.recurrence?.interval ?? 1,
                        daysOfWeek: draft.repeatDays
                      }
                    : { cadence: "none", interval: 1 }
              }
            : m
        )
      });
    } else {
      onUpdateCourse({ id: course.id, meetings: [...course.meetings, meeting] });
    }
    setQuickCreateDraft(null);
    setQuickCreateAnchor(null);
  }, [quickCreateDraft, courses, onAddCourse, onAddPersonalEvent, onUpdateCourse, onUpdatePersonalEvent]);

  const onQuickCreateFieldEnter = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      commitQuickCreateSession();
    },
    [commitQuickCreateSession]
  );

  function minutesFromIso(iso: string): number {
    const date = new Date(iso);
    return date.getHours() * 60 + date.getMinutes();
  }

  function buildIsoAtMinutes(anchor: Date, minutes: number): string {
    const base = new Date(anchor);
    base.setHours(0, 0, 0, 0);
    base.setMinutes(minutes);
    return base.toISOString();
  }

  function getMinimumAllowedMinutesForDate(date: Date): number {
    const hourStartMinutes = timelineHours[0] * 60;
    const dateKey = formatDateKey(date);
    const todayKey = formatDateKey(new Date());
    if (dateKey < todayKey) {
      return (timelineHours[timelineHours.length - 1] + 1) * 60;
    }
    if (dateKey > todayKey) {
      return hourStartMinutes;
    }
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return Math.ceil(nowMinutes / 15) * 15;
  }

  function workBlockDurationMinutesForTask(task: Task | undefined): number {
    void task;
    return 60;
  }

  useEffect(() => () => {
    if (weekTransitionTimeoutRef.current) clearTimeout(weekTransitionTimeoutRef.current);
    if (dayTransitionTimeoutRef.current) clearTimeout(dayTransitionTimeoutRef.current);
  }, []);

  useLayoutEffect(() => {
    weekWbInteractionRef.current = {
      dragPreview: workBlockDragPreview,
      resizePreview: workBlockResizePreview
    };
  }, [workBlockDragPreview, workBlockResizePreview]);

  useEffect(() => {
    setDraggingWorkBlock(null);
    setWorkBlockDragPreview(null);
    setResizingWorkBlock(null);
    setWorkBlockResizePreview(null);
    setResizingSession(null);
    setSessionResizePreview(null);
  }, [mode]);

  useEffect(() => {
    if (mode !== "week") return;
    if (!draggingWorkBlock && !resizingWorkBlock) return;
    const hourHeight = WEEK_TIMELINE_ROW_PX;

    function columnEl(dateKey: string): HTMLElement | null {
      return document.querySelector(`[data-week-column="${dateKey}"]`);
    }

    function onMove(e: MouseEvent) {
      if (draggingWorkBlock) {
        const dateKey = resolveWeekColumnKeyFromPoint(e.clientX, e.clientY);
        if (!dateKey) return;
        const col = columnEl(dateKey);
        if (!col) return;
        const bounds = col.getBoundingClientRect();
        const targetDate = new Date(`${dateKey}T12:00:00`);
        const minAllowedMinutes = getMinimumAllowedMinutesForDate(targetDate);
        const slot = calculateDraggedSlot(
          e.clientY,
          bounds,
          draggingWorkBlock.durationMinutes,
          minAllowedMinutes,
          hourHeight
        );
        if (slot.startMinutes >= minAllowedMinutes) {
          const next = { id: draggingWorkBlock.id, ...slot, dateKey };
          weekWbInteractionRef.current.dragPreview = next;
          setWorkBlockDragPreview(next);
        }
        return;
      }
      if (resizingWorkBlock) {
        const dateKey = resizingWorkBlock.dateKey;
        if (!dateKey) return;
        const col = columnEl(dateKey);
        if (!col) return;
        const bounds = col.getBoundingClientRect();
        const pointerMinutes = minutesFromPointer(e.clientY, bounds, hourHeight);
        const minAllowedMinutes = getMinimumAllowedMinutesForDate(new Date(`${dateKey}T12:00:00`));
        const dayEndMinutes = (timelineHours[timelineHours.length - 1] + 1) * 60;
        if (resizingWorkBlock.edge === "start") {
          const clampedStart = Math.max(minAllowedMinutes, Math.min(pointerMinutes, resizingWorkBlock.endMinutes - 15));
          const next = {
            id: resizingWorkBlock.id,
            startMinutes: clampedStart,
            endMinutes: resizingWorkBlock.endMinutes,
            dateKey
          };
          weekWbInteractionRef.current.resizePreview = next;
          setWorkBlockResizePreview(next);
        } else {
          const clampedEnd = Math.min(dayEndMinutes, Math.max(pointerMinutes, resizingWorkBlock.startMinutes + 15));
          const next = {
            id: resizingWorkBlock.id,
            startMinutes: resizingWorkBlock.startMinutes,
            endMinutes: clampedEnd,
            dateKey
          };
          weekWbInteractionRef.current.resizePreview = next;
          setWorkBlockResizePreview(next);
        }
      }
    }

    function onUp() {
      if (draggingWorkBlock) {
        const p = weekWbInteractionRef.current.dragPreview;
        if (p && p.id === draggingWorkBlock.id && p.dateKey) {
          const anchor = new Date(`${p.dateKey}T12:00:00`);
          onUpdateWorkBlock({
            id: p.id,
            startAt: buildIsoAtMinutes(anchor, p.startMinutes),
            endAt: buildIsoAtMinutes(anchor, p.endMinutes)
          });
        }
        setDraggingWorkBlock(null);
        setWorkBlockDragPreview(null);
        weekWbInteractionRef.current.dragPreview = null;
        return;
      }
      if (resizingWorkBlock) {
        const p = weekWbInteractionRef.current.resizePreview;
        if (p && p.id === resizingWorkBlock.id && p.dateKey) {
          const anchor = new Date(`${p.dateKey}T12:00:00`);
          onUpdateWorkBlock({
            id: p.id,
            startAt: buildIsoAtMinutes(anchor, p.startMinutes),
            endAt: buildIsoAtMinutes(anchor, p.endMinutes)
          });
        }
        setResizingWorkBlock(null);
        setWorkBlockResizePreview(null);
        weekWbInteractionRef.current.resizePreview = null;
      }
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { capture: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp, { capture: true });
    };
  }, [mode, draggingWorkBlock, resizingWorkBlock, onUpdateWorkBlock]);

  useEffect(() => {
    if (!resizingSession) return;
    const activeResize = resizingSession;
    const hourHeight = mode === "week" ? WEEK_TIMELINE_ROW_PX : dayHourHeight;
    const dayEndMinutes = (timelineHours[timelineHours.length - 1] + 1) * 60;

    function resolveBounds(): DOMRect | null {
      if (mode === "week") {
        const col = document.querySelector(`[data-week-column="${activeResize.dateKey}"]`);
        if (!(col instanceof HTMLElement)) return null;
        return col.getBoundingClientRect();
      }
      if (mode === "day") {
        const grid = dayGridBodyRef.current;
        if (!grid) return null;
        const dayColumnEl = grid.children.item(1) as HTMLElement | null;
        const source = dayColumnEl ?? grid;
        return source.getBoundingClientRect();
      }
      return null;
    }

    function onMove(e: MouseEvent) {
      const bounds = resolveBounds();
      if (!bounds) return;
      const pointerMinutes = minutesFromPointer(e.clientY, bounds, hourHeight);
      const minAllowedMinutes = getMinimumAllowedMinutesForDate(new Date(`${activeResize.dateKey}T12:00:00`));
      if (activeResize.edge === "start") {
        const clampedStart = Math.max(minAllowedMinutes, Math.min(pointerMinutes, activeResize.endMinutes - 15));
        setSessionResizePreview({
          courseId: activeResize.courseId,
          meetingId: activeResize.meetingId,
          startMinutes: clampedStart,
          endMinutes: activeResize.endMinutes,
          dateKey: activeResize.dateKey
        });
      } else {
        const clampedEnd = Math.min(dayEndMinutes, Math.max(pointerMinutes, activeResize.startMinutes + 15));
        setSessionResizePreview({
          courseId: activeResize.courseId,
          meetingId: activeResize.meetingId,
          startMinutes: activeResize.startMinutes,
          endMinutes: clampedEnd,
          dateKey: activeResize.dateKey
        });
      }
    }

    function onUp() {
      const preview = sessionResizePreview;
      if (preview && preview.courseId === activeResize.courseId && preview.meetingId === activeResize.meetingId) {
        resizeMeetingAtMinutes(
          preview.courseId,
          preview.meetingId,
          preview.startMinutes,
          preview.endMinutes,
          new Date(`${preview.dateKey}T12:00:00`)
        );
      }
      setResizingSession(null);
      setSessionResizePreview(null);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { capture: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp, { capture: true });
    };
  }, [WEEK_TIMELINE_ROW_PX, dayHourHeight, mode, resizingSession, resizeMeetingAtMinutes, sessionResizePreview, timelineHours]);

  useEffect(() => {
    const years = new Set<number>();
    if (mode === "month") {
      const monthStartGrid = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      const gridStart = startOfWeekGrid(monthStartGrid, "sunday");
      for (let i = 0; i < 42; i += 1) {
        years.add(addDays(gridStart, i).getFullYear());
      }
    } else if (mode === "week") {
      const ws = startOfWeekGrid(selectedDate, "sunday");
      for (let i = 0; i < 7; i += 1) {
        years.add(addDays(ws, i).getFullYear());
      }
    } else {
      years.add(selectedDate.getFullYear());
    }

    setHebcalByYear((prev) => {
      const next = { ...prev };
      for (const y of years) {
        const cached = readCachedHolidayYear(y);
        if (cached) next[y] = cached;
      }
      return next;
    });

    const missing = [...years].filter((y) => readCachedHolidayYear(y) === undefined).sort();
    if (missing.length === 0) return;

    let cancelled = false;
    setHebcalHolidayFetchBusy(true);
    void (async () => {
      await Promise.all(
        missing.map(async (y) => {
          try {
            const res = await fetch(`/api/calendar/holidays?year=${y}`);
            if (!res.ok) {
              console.warn("[holidays] API HTTP", res.status, y);
              return;
            }
            const data = (await res.json()) as { items?: CalendarHolidayChip[]; error?: string };
            if (data.error) {
              console.warn("[holidays] API body error", data.error);
              return;
            }
            const items = data.items ?? [];
            writeCachedHolidayYear(y, items);
            if (!cancelled) {
              setHebcalByYear((prev) => ({ ...prev, [y]: items }));
            }
          } catch (e) {
            console.warn("[holidays] fetch failed", y, e);
          }
        })
      );
      if (!cancelled) setHebcalHolidayFetchBusy(false);
    })();

    return () => {
      cancelled = true;
      setHebcalHolidayFetchBusy(false);
    };
  }, [mode, selectedDate]);

  function buildWeekOccurrencesByDay(anchorDate: Date) {
    const anchorWeekStart = startOfWeekGrid(anchorDate, "sunday");
    const anchorWeekDates = weekDays.map((_, index) => addDays(anchorWeekStart, index));
    const anchorOccurrences = expandMeetingOccurrences(visibleCourses, anchorWeekDates[0], anchorWeekDates[6]);
    const anchorByDate = groupOccurrencesByDate(anchorOccurrences);
    return anchorWeekDates.map((date) => {
      const key = formatDateKey(date);
      return {
        date,
        key,
        sessions: anchorByDate[key] ?? [],
        tasks: taskByDay[key] ?? []
      };
    });
  }

  const weekTransitionData = useMemo(() => {
    if (!weekTransition) return null;
    return {
      from: buildWeekOccurrencesByDay(weekTransition.fromDate),
      to: buildWeekOccurrencesByDay(weekTransition.toDate)
    };
  }, [taskByDay, visibleCourses, weekTransition]);

  function renderWeekGrid(
    weekData: Array<{ date: Date; key: string; sessions: SessionOccurrence[]; tasks: Task[] }>,
    selectedDayForHeader: Date,
    catchUpAnchorDate: Date
  ) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-slate-200/80 dark:border-white/10">
        <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-slate-200/80 bg-slate-50/70 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="px-3 pt-2.5 pb-2">
            <p className="whitespace-nowrap text-[21px] leading-none tracking-[-0.02em] text-slate-900 dark:text-slate-100">
              <span className="font-semibold">{selectedDayForHeader.toLocaleDateString(undefined, { month: "long" })}</span>{" "}
              <span className="font-normal text-slate-500 dark:text-slate-400">{selectedDayForHeader.toLocaleDateString(undefined, { year: "numeric" })}</span>
            </p>
            {hebcalHolidayFetchBusy ? (
              <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">Loading Jewish holidays…</p>
            ) : null}
          </div>
          <div className="col-span-7 flex items-start justify-end px-2 py-1.5">
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-white/[0.03]">
                <Button
                  variant="ghost"
                  onClick={() => navigate("prev")}
                  className="h-7 min-w-7 rounded-full px-1 text-[14px] font-semibold leading-none text-slate-700 hover:bg-slate-200/70 dark:text-slate-100 dark:hover:bg-white/[0.08]"
                  aria-label="Previous period"
                >
                  <span aria-hidden>‹</span>
                </Button>
                <Button variant="ghost" onClick={() => onSelectDate(new Date())} className="h-7 rounded-full px-2.5 text-xs">Today</Button>
                <Button
                  variant="ghost"
                  onClick={() => navigate("next")}
                  className="h-7 min-w-7 rounded-full px-1 text-[14px] font-semibold leading-none text-slate-700 hover:bg-slate-200/70 dark:text-slate-100 dark:hover:bg-white/[0.08]"
                  aria-label="Next period"
                >
                  <span aria-hidden>›</span>
                </Button>
              </div>
              <input
                type="date"
                value={formatDateKey(selectedDate)}
                onChange={(event) => onSelectDate(new Date(`${event.target.value}T12:00:00`))}
                className="h-8 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs outline-none dark:border-white/10 dark:bg-white/[0.04]"
              />
              <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-white/[0.03]">
                <Button variant={mode === "month" ? "primary" : "ghost"} onClick={() => onMode("month")} className="h-7 rounded-full px-2.5 text-xs">Month</Button>
                <Button variant={mode === "week" ? "primary" : "ghost"} onClick={() => onMode("week")} className="h-7 rounded-full px-2.5 text-xs">Week</Button>
                <Button
                  variant={mode === "day" ? "primary" : "ghost"}
                  onClick={() => onMode("day")}
                  data-onboarding="calendar-day-button"
                  className="h-7 rounded-full px-2.5 text-xs"
                >
                  Day
                </Button>
              </div>
              {onOpenWeeklyCatchUp ? (
                <>
                  {catchUpOwnerToolbar}
                  <Button
                    variant="outline"
                    className="h-8 shrink-0 text-xs"
                    type="button"
                    title="Sun–Thu attendance → recording catch-up tasks"
                    onClick={() => {
                      onOpenWeeklyCatchUp(catchUpAnchorDate);
                    }}
                  >
                    Weekly catch-up
                  </Button>
                </>
              ) : null}
              {onAppleCalendarSync ? (
                <Button
                  variant="outline"
                  className="h-8 shrink-0 text-xs"
                  type="button"
                  title="Subscribe in Apple Calendar (live URL when signed in) or download a one-time .ics file"
                  onClick={onAppleCalendarSync}
                >
                  <CalendarPlus className="mr-1 h-3.5 w-3.5" />
                  Sync
                </Button>
              ) : null}
              {onOpenTabGuide ? (
                <Button
                  variant="outline"
                  className="h-8 shrink-0 text-xs"
                  type="button"
                  onClick={onOpenTabGuide}
                  data-onboarding="guide-button"
                >
                  <BookOpen className="mr-1 h-3.5 w-3.5" />
                  Guide
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-slate-200/80 bg-slate-50/80 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="px-3 py-3 text-xs text-slate-400">Time</div>
          {weekData.map(({ date, key }) => (
            <button
              type="button"
              key={key}
              onClick={() => {
                onSelectDate(date);
                onMode("day");
              }}
              className={`px-3 py-3 text-left transition ${
                sameCalendarDate(date, selectedDayForHeader) ? "bg-slate-100/80 dark:bg-white/[0.05]" : ""
              }`}
            >
              <p className="text-sm font-medium">
                {date.toLocaleDateString(undefined, { weekday: "short" })}
              </p>
              <p
                className={`text-xs ${
                  sameCalendarDate(date, today)
                    ? "text-sky-600 dark:text-sky-300 drop-shadow-[0_0_10px_rgba(56,189,248,0.45)]"
                    : "text-slate-400"
                }`}
              >
                {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </p>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-slate-200/80 bg-slate-50/70 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="min-h-[22px] border-r border-slate-200/70 dark:border-white/10" aria-hidden />
          {weekData.map(({ key, sessions }) => (
            <div key={`pinned-all-day-${key}`} className="space-y-0.5 border-r border-slate-200/70 px-1.5 py-0.5 dark:border-white/10">
              {sessions
                .filter((item) => item.meeting.isAllDay)
                .map((session) => (
                  <button
                    key={session.instanceKey}
                    type="button"
                    onClick={() => onSessionClick(session.course.id, session.meeting.id!, session.date)}
                    dir="auto"
                    className="w-full rounded-lg px-2 py-px text-start text-[10px] font-medium leading-tight text-slate-900 shadow-[0_4px_10px_rgba(15,23,42,0.08)] dark:shadow-[0_4px_10px_rgba(0,0,0,0.24)]"
                    style={softCourseStyle(session.course.color)}
                  >
                    {session.meeting.title?.trim() || session.course.name}
                  </button>
                ))}
              {(hebcalItemsByDate[key] ?? []).map((h) => (
                <div
                  key={h.id}
                  dir="auto"
                  title={h.label}
                  className={`flex w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight ${hebcalPillClasses(h.subcat)}`}
                >
                  <Star className="h-3 w-3 shrink-0 fill-current opacity-90" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{h.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div
          ref={syncCalendarScrollEl}
          onScroll={(event) => {
            const el = event.currentTarget;
            calendarScrollTopRef.current = el.scrollTop;
          }}
          className="calendar-scroll-area min-h-0 flex-1 overflow-auto calendar-scroll-area-active"
        >
          <div
            ref={weekGridBodyRef}
            className="relative grid grid-cols-[64px_repeat(7,minmax(0,1fr))] pb-24"
            style={{ minHeight: timelineHours.length * WEEK_TIMELINE_ROW_PX }}
          >
            <div className="border-r border-slate-200/80 dark:border-white/10">
              {timelineHours.map((hour) => (
                <div key={hour} className="border-b border-slate-200/70 px-3 py-2 text-xs text-slate-400 dark:border-white/10" style={{ height: `${WEEK_TIMELINE_ROW_PX}px` }}>
                  {String(hour).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {weekData.map(({ date, key, sessions }) => {
              const timed = layoutOverlappingEvents(sessions.filter((item) => !item.meeting.isAllDay));
              const tentativeTimed = layoutOverlappingEvents((tentativeByDate[key] ?? []).filter((item) => !item.meeting.isAllDay));
              const dayWorkBlocks = (workBlocksByDate[key] ?? []).sort((a, b) => a.startAt.localeCompare(b.startAt));
              return (
                <div
                  key={key}
                  data-week-column={key}
                  className={`relative border-r border-slate-200/70 dark:border-white/10 ${
                    draggingSession || resizingSession || draggingWorkBlock || resizingWorkBlock ? "bg-slate-50/40 dark:bg-white/[0.02]" : ""
                  }`}
                  onMouseDown={(event) => {
                    if (event.button !== 0 || draggingSession || resizingSession || draggingWorkBlock || resizingWorkBlock) return;
                    const rawTarget = event.target;
                    const target = rawTarget instanceof Element ? rawTarget : null;
                    const blocked = Boolean(target?.closest("[data-calendar-interactive='true'],button,input,textarea,select,a,[role='button']"));
                    if (blocked) return;
                    onClearSessionSelection?.();
                    startCreateSession(date, event.clientY, event.clientX, event.currentTarget.getBoundingClientRect(), WEEK_TIMELINE_ROW_PX);
                  }}
                  onMouseMove={(event) => {
                    if (draggingWorkBlock || resizingWorkBlock || resizingSession) return;
                    if (!creatingSession || !sameCalendarDate(creatingSession.date, date)) return;
                    updateCreateSession(event.clientY, event.clientX, event.currentTarget.getBoundingClientRect(), WEEK_TIMELINE_ROW_PX);
                  }}
                  onMouseUp={() => {
                    if (draggingWorkBlock || resizingWorkBlock || resizingSession) return;
                    if (!creatingSession || !sameCalendarDate(creatingSession.date, date)) return;
                    finishCreateSession();
                  }}
                  onMouseLeave={() => {
                    if (draggingWorkBlock || resizingWorkBlock || resizingSession) return;
                    if (!creatingSession || !sameCalendarDate(creatingSession.date, date)) return;
                    finishCreateSession();
                  }}
                  onDragOver={(event) => {
                    if (!draggingSession) return;
                    event.preventDefault();
                    const pointerOffsetMinutes = Math.round(
                      draggingSession.durationMinutes * Math.max(0, Math.min(1, draggingSession.grabOffsetRatio))
                    );
                    const slot = calculateDraggedSlot(
                      event.clientY,
                      event.currentTarget.getBoundingClientRect(),
                      draggingSession.durationMinutes,
                      undefined,
                      WEEK_TIMELINE_ROW_PX,
                      pointerOffsetMinutes
                    );
                    setDragPreview({ date, ...slot });
                  }}
                  onDrop={(event) => {
                    if (!draggingSession) return;
                    event.preventDefault();
                    const pointerOffsetMinutes = Math.round(
                      draggingSession.durationMinutes * Math.max(0, Math.min(1, draggingSession.grabOffsetRatio))
                    );
                    const slot = calculateDraggedSlot(
                      event.clientY,
                      event.currentTarget.getBoundingClientRect(),
                      draggingSession.durationMinutes,
                      undefined,
                      WEEK_TIMELINE_ROW_PX,
                      pointerOffsetMinutes
                    );
                    const isPersonalDrag = draggingSession.courseId === PERSONAL_EVENTS_COURSE_ID;
                    const course = isPersonalDrag ? undefined : courses.find((item) => item.id === draggingSession.courseId);
                    const meeting = isPersonalDrag
                      ? personalEvents.find((e) => e.id === draggingSession.meetingId)
                      : course?.meetings.find((item) => item.id === draggingSession.meetingId);
                    const recurrenceCadence = meeting?.recurrence?.cadence ?? "weekly";
                    if (meeting && recurrenceCadence !== "none") {
                      setRecurrenceMovePrompt({
                        courseId: draggingSession.courseId,
                        meetingId: draggingSession.meetingId,
                        sourceDate: draggingSession.sourceDate,
                        targetDate: date,
                        startMinutes: slot.startMinutes
                      });
                    } else {
                      moveMeetingAtMinutes(
                        draggingSession.courseId,
                        draggingSession.meetingId,
                        date,
                        slot.startMinutes
                      );
                    }
                    setDragPreview(null);
                    setDraggingSession(null);
                  }}
                >
                  {timelineHours.map((hour) => (
                    <div key={`${key}-${hour}`} className="border-b border-slate-200/70 dark:border-white/10" style={{ height: `${WEEK_TIMELINE_ROW_PX}px` }} />
                  ))}
                  {creatingSession && creatingSession.hasDragged && sameCalendarDate(creatingSession.date, date) && (
                    <div
                      ref={tentativeBlockRef}
                      className="pointer-events-none absolute left-[6px] right-[6px] rounded-2xl border-2 border-dashed border-sky-400/70 bg-sky-100/45"
                      style={{
                        top: ((creatingSession.startMinutes - timelineHours[0] * 60) / 60) * WEEK_TIMELINE_ROW_PX,
                        height: Math.max(28, ((creatingSession.endMinutes - creatingSession.startMinutes) / 60) * WEEK_TIMELINE_ROW_PX)
                      }}
                    />
                  )}
                  {quickCreateDraft && quickCreateDraft.mode === "create" && sameCalendarDate(quickCreateDraft.date, date) && (
                    <div
                      ref={quickDraftBlockRef}
                      className="pointer-events-none absolute left-[6px] right-[6px] rounded-2xl border border-sky-400/60 bg-sky-100/50"
                      style={{
                        top: ((parseTimeValue(quickCreateDraft.start) - timelineHours[0]) * WEEK_TIMELINE_ROW_PX),
                        height: Math.max(28, (parseTimeValue(quickCreateDraft.end) - parseTimeValue(quickCreateDraft.start)) * WEEK_TIMELINE_ROW_PX)
                      }}
                    >
                      <div className="px-2 py-1 text-[11px] font-medium text-sky-900/80 dark:text-sky-100/80">
                        {quickCreateDraft.title.trim() || "New Session"}
                      </div>
                    </div>
                  )}
                  {dragPreview && sameCalendarDate(dragPreview.date, date) && (
                    <div
                      className="pointer-events-none absolute left-[6px] right-[6px] z-20 rounded-2xl border-2 border-dashed border-violet-500/60 bg-violet-100/40"
                      style={{
                        top: ((dragPreview.startMinutes - timelineHours[0] * 60) / 60) * WEEK_TIMELINE_ROW_PX,
                        height: Math.max(28, ((dragPreview.endMinutes - dragPreview.startMinutes) / 60) * WEEK_TIMELINE_ROW_PX)
                      }}
                    >
                      <div className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-medium text-violet-700 shadow-sm">
                        {formatHourMinutes(dragPreview.startMinutes)} - {formatHourMinutes(dragPreview.endMinutes)}
                      </div>
                    </div>
                  )}
                  {timed.map((session) => {
                    const sessionDateKey = formatDateKey(session.date);
                    const resizePreview =
                      sessionResizePreview &&
                      sessionResizePreview.courseId === session.course.id &&
                      sessionResizePreview.meetingId === session.meeting.id &&
                      sessionResizePreview.dateKey === sessionDateKey
                        ? sessionResizePreview
                        : null;
                    const rawStart = resizePreview ? resizePreview.startMinutes : Math.round(parseTimeValue(session.meeting.start) * 60);
                    const rawEnd = resizePreview ? resizePreview.endMinutes : Math.round(parseTimeValue(session.meeting.end) * 60);
                    const startMinutes = Math.min(rawStart, rawEnd);
                    const endMinutes = Math.max(rawStart, rawEnd);
                    const top = Math.max(0, ((startMinutes - timelineHours[0] * 60) / 60) * WEEK_TIMELINE_ROW_PX);
                    const height = Math.max(28, ((endMinutes - startMinutes) / 60) * WEEK_TIMELINE_ROW_PX);
                    return (
                      <SessionCard
                        key={session.instanceKey}
                        session={session}
                        variant="week"
                        top={top}
                        height={height}
                        startMinutes={startMinutes}
                        endMinutes={endMinutes}
                        minAllowedMinutes={getMinimumAllowedMinutesForDate(session.date)}
                        selectedSession={selectedSession as CalendarSelectedSession | null}
                        newlyAddedCourseId={newlyAddedCourseId ?? null}
                        dimmed={!!hoveredTentativeOptionId}
                        onSessionClick={onSessionClick}
                        onSessionDoubleClick={onSessionDoubleClick}
                        onOpenQuickEditor={openQuickEditorForSession}
                        onDragStart={(info: SessionDragInfo) => setDraggingSession(info)}
                        onDragEnd={() => { setDraggingSession(null); setDragPreview(null); }}
                        onResizeEdge={(edge, safeStart, end) => {
                          setResizingSession({ courseId: session.course.id, meetingId: session.meeting.id!, edge, startMinutes: safeStart, endMinutes: end, dateKey: sessionDateKey });
                          setSessionResizePreview({ courseId: session.course.id, meetingId: session.meeting.id!, startMinutes: safeStart, endMinutes: end, dateKey: sessionDateKey });
                        }}
                      />
                    );
                  })}
                  {tentativeTimed.map((session) => {
                      const startHour = parseTimeValue(session.meeting.start);
                      const endHour = parseTimeValue(session.meeting.end);
                      const top = Math.max(0, (startHour - timelineHours[0]) * WEEK_TIMELINE_ROW_PX);
                      const height = Math.max(28, (endHour - startHour) * WEEK_TIMELINE_ROW_PX);
                      const overlapStepPct = session.totalColumns > 1 ? Math.min(10, 100 / (session.totalColumns * 2)) : 0;
                      const overlapWidthPct = session.totalColumns > 1 ? 100 - overlapStepPct * (session.totalColumns - 1) : 100;
                      return (
                        <button
                          key={`tentative-${session.instanceKey}`}
                          type="button"
                          onClick={() => onPickTentativeOption?.(session.course.id)}
                          onMouseEnter={() => setHoveredTentativeOptionId(session.course.id)}
                          onMouseLeave={() => setHoveredTentativeOptionId((current) => (current === session.course.id ? null : current))}
                          className="absolute z-[14] overflow-hidden rounded-2xl border-2 border-amber-400/80 bg-amber-100/35 px-3 py-2 text-start text-xs shadow-[0_0_0_1px_rgba(251,191,36,0.45),0_0_26px_rgba(251,191,36,0.45)] transition-all dark:bg-amber-400/15"
                          style={{
                            top,
                            height,
                            left: `calc(${session.column * overlapStepPct}% + 10px)`,
                            width: `calc(${overlapWidthPct}% - 20px)`,
                            zIndex: 14 + session.column,
                            opacity: hoveredTentativeOptionId && hoveredTentativeOptionId !== session.course.id ? 0.3 : 1,
                            transform: hoveredTentativeOptionId === session.course.id ? "scale(1.015)" : "scale(1)"
                          }}
                        >
                          <p className="truncate font-semibold text-amber-900 dark:text-amber-100">Tentative: {session.course.name}</p>
                          <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-200">{session.meeting.start} - {session.meeting.end}</p>
                          {session.meeting.location && (
                            <p className="mt-0.5 whitespace-normal break-words text-[11px] leading-snug text-amber-800 dark:text-amber-200">
                              {session.meeting.location}
                            </p>
                          )}
                          {hoveredTentativeOptionId === session.course.id && (
                            <div className="mt-2 rounded-lg bg-white/75 p-2 text-[11px] text-amber-950 dark:bg-black/30 dark:text-amber-100">
                              <p className="font-semibold">{session.meeting.title || "Session option"}</p>
                              <p className="mt-1">{session.meeting.day} {session.meeting.start} - {session.meeting.end}</p>
                              {session.meeting.location && <p className="mt-1">{session.meeting.location}</p>}
                              <p className="mt-1 opacity-80">Click to choose this option</p>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  {dayWorkBlocks.map((block) => {
                    const sourceKey = formatDateKey(new Date(block.startAt));
                    if (sourceKey !== key) return null;
                    const dragP = workBlockDragPreview?.id === block.id ? workBlockDragPreview : null;
                    if (dragP?.dateKey && dragP.dateKey !== key) return null;
                    const resizeP = workBlockResizePreview?.id === block.id ? workBlockResizePreview : null;
                    const blockStartMinutes = minutesFromIso(block.startAt);
                    const blockEndMinutes = minutesFromIso(block.endAt);
                    const rawStartM = resizeP ? resizeP.startMinutes : dragP ? dragP.startMinutes : blockStartMinutes;
                    const rawEndM = resizeP ? resizeP.endMinutes : dragP ? dragP.endMinutes : blockEndMinutes;
                    const startM = Math.min(rawStartM, rawEndM);
                    const endM = Math.max(rawStartM, rawEndM);
                    const top = Math.max(0, ((startM - timelineHours[0] * 60) / 60) * WEEK_TIMELINE_ROW_PX);
                    const height = Math.max(28, ((endM - startM) / 60) * WEEK_TIMELINE_ROW_PX);
                    const course = courseMap[block.courseId as string];
                    const linkedTask = tasks.find((task) => task.id === block.taskId);
                    const color = block.colorSnapshot ?? course?.color ?? "#10b981";
                    const minAllowedMinutes = getMinimumAllowedMinutesForDate(date);
                    const timelineMaxMinutes = (timelineHours[timelineHours.length - 1] + 1) * 60;
                    return (
                      <WorkBlockCard
                        key={`wb-${block.id}`}
                        block={block}
                        variant="week"
                        top={top}
                        height={height}
                        startMinutes={startM}
                        endMinutes={endM}
                        color={color}
                        linkedTaskTitle={linkedTask?.title}
                        minAllowedMinutes={minAllowedMinutes}
                        timelineMaxMinutes={timelineMaxMinutes}
                        dateKey={key}
                        onDragStart={(info) => {
                          setDraggingWorkBlock({ id: info.id, durationMinutes: info.durationMinutes });
                          setWorkBlockDragPreview({ id: info.id, startMinutes: info.startMinutes, endMinutes: info.endMinutes, dateKey: info.dateKey });
                        }}
                        onDoubleClick={setActiveWorkBlockId}
                        onResizeEdge={(edge, start, end) => {
                          setResizingWorkBlock({ id: block.id, edge, startMinutes: start, endMinutes: end, dateKey: key });
                          setWorkBlockResizePreview({ id: block.id, startMinutes: edge === "start" ? Math.max(start, minAllowedMinutes) : start, endMinutes: end, dateKey: key });
                        }}
                      />
                    );
                  })}
                  {(() => {
                    const p = workBlockDragPreview;
                    if (!p?.dateKey || p.dateKey !== key) return null;
                    const block = scheduledWorkBlocks.find((b) => b.id === p.id);
                    if (!block) return null;
                    const srcKey = formatDateKey(new Date(block.startAt));
                    if (srcKey === key) return null;
                    const top = Math.max(0, ((p.startMinutes - timelineHours[0] * 60) / 60) * WEEK_TIMELINE_ROW_PX);
                    const height = Math.max(28, ((p.endMinutes - p.startMinutes) / 60) * WEEK_TIMELINE_ROW_PX);
                    const course = courseMap[block.courseId as string];
                    const linkedTask = tasks.find((task) => task.id === block.taskId);
                    const color = block.colorSnapshot ?? course?.color ?? "#10b981";
                    return (
                      <div
                        key={`wb-ghost-${block.id}`}
                        className="pointer-events-none absolute left-[8px] right-[8px] z-[12] overflow-hidden rounded-2xl border border-dashed border-white/40 px-3 py-2 text-start text-xs opacity-90 shadow-[0_10px_24px_rgba(15,23,42,0.12)]"
                        style={{
                          ...softCourseStyle(color),
                          top,
                          height,
                          borderColor: `${color}88`
                        }}
                      >
                        <p className="truncate font-semibold text-slate-900 dark:text-white">{linkedTask?.title ?? block.titleSnapshot ?? "Work block"}</p>
                        <p className="mt-1 truncate text-[11px] text-slate-600 dark:text-white/90">
                          {formatHourMinutes(p.startMinutes)} – {formatHourMinutes(p.endMinutes)}
                        </p>
                      </div>
                    );
                  })()}
                  {sameCalendarDate(date, today) && currentTimeTopWeek !== null && (
                    <div className="pointer-events-none absolute left-0 right-0 z-20" style={{ top: currentTimeTopWeek }}>
                      <div className="h-px bg-rose-400/80 shadow-[0_0_8px_rgba(251,113,133,0.6)]" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Panel data-onboarding="calendar-week-grid" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white/90 dark:bg-[#101317]/90">
      {mode !== "week" && (
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          {mode === "day" ? (
            <div className="px-1 pt-0.5">
              <p className="whitespace-nowrap text-[21px] leading-none tracking-[-0.02em] text-slate-900 dark:text-slate-100">
                <span className="font-semibold">{selectedDate.toLocaleDateString(undefined, { month: "long" })}</span>{" "}
                <span className="font-normal text-slate-500 dark:text-slate-400">{selectedDate.toLocaleDateString(undefined, { year: "numeric" })}</span>
              </p>
            </div>
          ) : (
            <div />
          )}
          <div className="flex flex-wrap items-center justify-end gap-1.5">
          <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-white/[0.03]">
            <Button
              variant="ghost"
              onClick={() => navigate("prev")}
              className="h-7 min-w-7 rounded-full px-1 text-[14px] font-semibold leading-none text-slate-700 hover:bg-slate-200/70 dark:text-slate-100 dark:hover:bg-white/[0.08]"
              aria-label="Previous period"
            >
              <span aria-hidden>‹</span>
            </Button>
            <Button variant="ghost" onClick={() => onSelectDate(new Date())} className="h-7 rounded-full px-2.5 text-xs">Today</Button>
            <Button
              variant="ghost"
              onClick={() => navigate("next")}
              className="h-7 min-w-7 rounded-full px-1 text-[14px] font-semibold leading-none text-slate-700 hover:bg-slate-200/70 dark:text-slate-100 dark:hover:bg-white/[0.08]"
              aria-label="Next period"
            >
              <span aria-hidden>›</span>
            </Button>
          </div>
          <input
            type="date"
            value={formatDateKey(selectedDate)}
            onChange={(event) => onSelectDate(new Date(`${event.target.value}T12:00:00`))}
            className="h-8 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs outline-none dark:border-white/10 dark:bg-white/[0.04]"
          />
          <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-white/[0.03]">
            <Button variant={mode === "month" ? "primary" : "ghost"} onClick={() => onMode("month")} className="h-7 rounded-full px-2.5 text-xs">Month</Button>
            <Button variant="ghost" onClick={() => onMode("week")} className="h-7 rounded-full px-2.5 text-xs">Week</Button>
            <Button
              variant={mode === "day" ? "primary" : "ghost"}
              onClick={() => onMode("day")}
              data-onboarding="calendar-day-button"
              className="h-7 rounded-full px-2.5 text-xs"
            >
              Day
            </Button>
          </div>
          {onOpenWeeklyCatchUp ? (
            <>
              {catchUpOwnerToolbar}
              <Button
                variant="outline"
                className="h-8 shrink-0 text-xs"
                type="button"
                title="Sun–Thu attendance → recording catch-up tasks"
                onClick={() => {
                  onOpenWeeklyCatchUp(selectedDate);
                }}
              >
                Weekly catch-up
              </Button>
            </>
          ) : null}
          {onAppleCalendarSync ? (
            <Button
              variant="outline"
              className="h-8 shrink-0 text-xs"
              type="button"
              title="Subscribe in Apple Calendar (live URL when signed in) or download a one-time .ics file"
              onClick={onAppleCalendarSync}
            >
              <CalendarPlus className="mr-1 h-3.5 w-3.5" />
              Sync
            </Button>
          ) : null}
          {onOpenTabGuide ? (
            <Button
              variant="outline"
              className="h-8 shrink-0 text-xs"
              type="button"
              onClick={onOpenTabGuide}
              data-onboarding="guide-button"
            >
              <BookOpen className="mr-1 h-3.5 w-3.5" />
              Guide
            </Button>
          ) : null}
          </div>
        </div>
      )}
      {tentativeOptions && tentativeOptions.length > 0 && (
        <p data-onboarding="tentative-choices-banner" className="mb-2 truncate text-[11px] text-amber-600/95 dark:text-amber-200/95">
          Choose 1 of {tentativeOptionSummary?.optionCount ?? tentativeOptions.length} for {tentativeChoiceTitle ?? "session group"}
          {tentativeOptionSummary
            ? ` · ${tentativeOptionSummary.minBlocks === tentativeOptionSummary.maxBlocks
              ? `${tentativeOptionSummary.minBlocks} weekly block${tentativeOptionSummary.minBlocks === 1 ? "" : "s"} each`
              : "multiple weekly blocks"}`
            : ""}
        </p>
      )}
      <div className="min-h-0 flex-1">
      {mode === "month" ? (
        <>
          <div className="grid grid-cols-7 gap-2 text-xs text-slate-500">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="px-2 py-1">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {monthDays.map((day) => {
              const key = formatDateKey(day);
              const dayTasks = (taskByDay[key] ?? []).sort(taskComparator);
              const daySessions = (sessionByDate[key] ?? []).slice(0, 2);
              const inMonth = day.getMonth() === selectedDate.getMonth();
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => {
                    onSelectDate(day);
                    onMode("day");
                  }}
                  className={`min-h-[132px] rounded-2xl border p-2 text-left transition ${inMonth ? "border-slate-200 dark:border-white/10" : "border-transparent opacity-45"} ${sameCalendarDate(day, selectedDate) ? "ring-2 ring-slate-900/10 dark:ring-white/20" : ""}`}
                >
                  <p className="mb-1 flex items-center gap-1.5 text-xs">
                    <span>{day.getDate()}</span>
                    {(hebcalItemsByDate[key]?.length ?? 0) > 0 ? (
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.7)]"
                        title="Jewish holiday or special day"
                        aria-label="Jewish holiday or special day"
                      />
                    ) : null}
                  </p>
                  <div className="space-y-1">
                    {daySessions.map((session) => (
                      <div key={session.instanceKey} className="rounded-xl px-2 py-1 text-[11px] font-medium text-slate-900 dark:text-slate-100" style={softCourseStyle(session.course.color)}>
                        {session.meeting.title?.trim() || session.course.name}
                      </div>
                    ))}
                    {dayTasks.slice(0, 2).map((task) => (
                      <div key={task.id} className="rounded-xl border border-slate-200/80 px-2 py-1 text-[11px] font-medium text-slate-700 dark:border-white/10 dark:text-slate-200" style={softCourseStyle(courseMap[task.courseId as string]?.color ?? "#94a3b8")}>
                        {task.title}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      ) : mode === "week" ? (
        weekTransition ? (
          <div className="h-full min-h-0 overflow-hidden rounded-[28px] border border-slate-200/80 dark:border-white/10">
            <div
              className="flex h-full min-h-0"
              style={{
                transition: weekTransitionActive
                  ? "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)"
                  : "none",
                transform:
                  weekTransition.direction === "next"
                    ? `translateX(${weekTransitionActive ? "-100%" : "0%"})`
                    : `translateX(${weekTransitionActive ? "0%" : "-100%"})`
              }}
            >
              {weekTransition.direction === "next" ? (
                <>
                  <div className="h-full w-full shrink-0 min-h-0">
                    {renderWeekGrid(
                      weekTransitionData?.from ?? buildWeekOccurrencesByDay(weekTransition.fromDate),
                      weekTransition.fromDate,
                      weekTransition.fromDate
                    )}
                  </div>
                  <div className="h-full w-full shrink-0 min-h-0">
                    {renderWeekGrid(
                      weekTransitionData?.to ?? buildWeekOccurrencesByDay(weekTransition.toDate),
                      weekTransition.toDate,
                      weekTransition.toDate
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="h-full w-full shrink-0 min-h-0">
                    {renderWeekGrid(
                      weekTransitionData?.to ?? buildWeekOccurrencesByDay(weekTransition.toDate),
                      weekTransition.toDate,
                      weekTransition.toDate
                    )}
                  </div>
                  <div className="h-full w-full shrink-0 min-h-0">
                    {renderWeekGrid(
                      weekTransitionData?.from ?? buildWeekOccurrencesByDay(weekTransition.fromDate),
                      weekTransition.fromDate,
                      weekTransition.fromDate
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          renderWeekGrid(weekOccurrencesByDay, selectedDate, selectedDate)
        )
      ) : (
        <div data-onboarding="calendar-day-planner" className="grid h-full min-h-0 gap-4 xl:grid-cols-[1.25fr_0.9fr]">
          <div
            className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/60 dark:border-white/10 dark:bg-white/[0.02]"
            style={
              dayTransition
                ? {
                    transition: dayTransitionActive ? "transform 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 320ms ease" : "none",
                    transform:
                      dayTransition.direction === "next"
                        ? `translateX(${dayTransitionActive ? "0%" : "14%"})`
                        : `translateX(${dayTransitionActive ? "0%" : "-14%"})`,
                    opacity: dayTransitionActive ? 1 : 0.96
                  }
                : undefined
            }
          >
            <div className="border-b border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
              <h4 className="font-semibold">{selectedDate.toLocaleDateString(undefined, { weekday: "long" })}</h4>
              <p className="text-sm text-slate-500 dark:text-slate-400">{selectedDate.toLocaleDateString(undefined, { month: "long", day: "numeric" })}</p>
            </div>
            <div className="border-b border-slate-200/80 bg-slate-50/60 px-4 py-2.5 dark:border-white/10 dark:bg-white/[0.02]">
              {hebcalHolidayFetchBusy ? (
                <p className="mb-2 text-[10px] text-slate-400 dark:text-slate-500">Loading holidays…</p>
              ) : null}
              <div className="flex min-h-[22px] flex-col gap-0.5">
                {selectedDaySessions.filter((item) => item.meeting.isAllDay).map((session) => (
                  <button
                    key={session.instanceKey}
                    type="button"
                    onClick={() => onSessionClick(session.course.id, session.meeting.id!, session.date)}
                    dir="auto"
                    className="w-full rounded-lg px-2 py-0.5 text-start text-[10px] font-medium leading-tight text-slate-900"
                    style={softCourseStyle(session.course.color)}
                  >
                    {session.meeting.title?.trim() || session.course.name}
                  </button>
                ))}
                {(hebcalItemsByDate[selectedKey] ?? []).map((h) => (
                  <div
                    key={h.id}
                    dir="auto"
                    title={h.label}
                    className={`flex w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight ${hebcalPillClasses(h.subcat)}`}
                  >
                    <Star className="h-3 w-3 shrink-0 fill-current opacity-90" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{h.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div
              ref={syncCalendarScrollEl}
              onScroll={(event) => {
                const el = event.currentTarget;
                calendarScrollTopRef.current = el.scrollTop;
              }}
              className="calendar-scroll-area min-h-0 flex-1 overflow-auto calendar-scroll-area-active"
            >
              <div
                ref={dayGridBodyRef}
                className="relative grid grid-cols-[72px_minmax(0,1fr)] pb-24"
                style={{ minHeight: timelineHours.length * dayHourHeight }}
              >
                <div className="border-r border-slate-200/80 dark:border-white/10">
                  {timelineHours.map((hour) => (
                    <div key={hour} className="border-b border-slate-200/70 px-3 py-2 text-xs text-slate-400 dark:border-white/10" style={{ height: `${dayHourHeight}px` }}>
                      {String(hour).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>
                <div
                  className={`relative ${draggingSession || resizingSession || draggingTaskId || draggingWorkBlock ? "bg-slate-50/40 dark:bg-white/[0.02]" : ""}`}
                  onMouseDown={(event) => {
                    if (event.button !== 0 || draggingSession || resizingSession) return;
                    const rawTarget = event.target;
                    const target = rawTarget instanceof Element ? rawTarget : null;
                    const blocked = Boolean(target?.closest("[data-calendar-interactive='true'],button,input,textarea,select,a,[role='button']"));
                    if (blocked) return;
                    onClearSessionSelection?.();
                    startCreateSession(selectedDate, event.clientY, event.clientX, event.currentTarget.getBoundingClientRect(), dayHourHeight);
                  }}
                  onMouseMove={(event) => {
                    if (resizingWorkBlock) {
                      const bounds = event.currentTarget.getBoundingClientRect();
                      const pointerMinutes = minutesFromPointer(event.clientY, bounds, dayHourHeight);
                      const minAllowedMinutes = getMinimumAllowedMinutesForDate(selectedDate);
                      const dk = formatDateKey(selectedDate);
                      if (resizingWorkBlock.edge === "start") {
                        const clampedStart = Math.max(minAllowedMinutes, Math.min(pointerMinutes, resizingWorkBlock.endMinutes - 15));
                        setWorkBlockResizePreview({
                          id: resizingWorkBlock.id,
                          startMinutes: clampedStart,
                          endMinutes: resizingWorkBlock.endMinutes,
                          dateKey: dk
                        });
                      } else {
                        const dayEndMinutes = (timelineHours[timelineHours.length - 1] + 1) * 60;
                        const clampedEnd = Math.min(dayEndMinutes, Math.max(pointerMinutes, resizingWorkBlock.startMinutes + 15));
                        setWorkBlockResizePreview({
                          id: resizingWorkBlock.id,
                          startMinutes: resizingWorkBlock.startMinutes,
                          endMinutes: clampedEnd,
                          dateKey: dk
                        });
                      }
                      return;
                    }
                    if (draggingWorkBlock) {
                      const minAllowedMinutes = getMinimumAllowedMinutesForDate(selectedDate);
                      const slot = calculateDraggedSlot(
                        event.clientY,
                        event.currentTarget.getBoundingClientRect(),
                        draggingWorkBlock.durationMinutes,
                        minAllowedMinutes,
                        dayHourHeight
                      );
                      if (slot.startMinutes >= minAllowedMinutes) {
                        setWorkBlockDragPreview({ id: draggingWorkBlock.id, ...slot, dateKey: formatDateKey(selectedDate) });
                      }
                      return;
                    }
                    if (!creatingSession || !sameCalendarDate(creatingSession.date, selectedDate)) return;
                    updateCreateSession(event.clientY, event.clientX, event.currentTarget.getBoundingClientRect(), dayHourHeight);
                  }}
                  onMouseUp={() => {
                    if (resizingWorkBlock) {
                      if (workBlockResizePreview && workBlockResizePreview.id === resizingWorkBlock.id) {
                        const rk = workBlockResizePreview.dateKey ?? formatDateKey(selectedDate);
                        const anchor = new Date(`${rk}T12:00:00`);
                        onUpdateWorkBlock({
                          id: resizingWorkBlock.id,
                          startAt: buildIsoAtMinutes(anchor, workBlockResizePreview.startMinutes),
                          endAt: buildIsoAtMinutes(anchor, workBlockResizePreview.endMinutes)
                        });
                      }
                      setResizingWorkBlock(null);
                      setWorkBlockResizePreview(null);
                      return;
                    }
                    if (draggingWorkBlock) {
                      if (workBlockDragPreview && workBlockDragPreview.id === draggingWorkBlock.id) {
                        const dk = workBlockDragPreview.dateKey ?? formatDateKey(selectedDate);
                        const anchor = new Date(`${dk}T12:00:00`);
                        onUpdateWorkBlock({
                          id: draggingWorkBlock.id,
                          startAt: buildIsoAtMinutes(anchor, workBlockDragPreview.startMinutes),
                          endAt: buildIsoAtMinutes(anchor, workBlockDragPreview.endMinutes)
                        });
                      }
                      setDraggingWorkBlock(null);
                      setWorkBlockDragPreview(null);
                      return;
                    }
                    if (!creatingSession || !sameCalendarDate(creatingSession.date, selectedDate)) return;
                    finishCreateSession();
                  }}
                  onMouseLeave={() => {
                    if (resizingWorkBlock) return;
                    if (draggingWorkBlock) return;
                    if (!creatingSession || !sameCalendarDate(creatingSession.date, selectedDate)) return;
                    finishCreateSession();
                  }}
                  onDragOver={(event) => {
                    if (draggingSession) {
                      event.preventDefault();
                      const pointerOffsetMinutes = Math.round(
                        draggingSession.durationMinutes * Math.max(0, Math.min(1, draggingSession.grabOffsetRatio))
                      );
                      const slot = calculateDraggedSlot(
                        event.clientY,
                        event.currentTarget.getBoundingClientRect(),
                        draggingSession.durationMinutes,
                        undefined,
                        dayHourHeight,
                        pointerOffsetMinutes
                      );
                      setDragPreview({ date: selectedDate, ...slot });
                      return;
                    }

                    const taskId = draggingTaskId ?? event.dataTransfer.getData("application/x-task-id");
                    if (!taskId) return;
                    event.preventDefault();
                    const task = tasks.find((t) => t.id === taskId);
                    const durationMinutes = workBlockDurationMinutesForTask(task);
                    const minAllowedMinutes = timelineHours[0] * 60;
                    const slot = calculateDraggedSlot(
                      event.clientY,
                      event.currentTarget.getBoundingClientRect(),
                      durationMinutes,
                      minAllowedMinutes,
                      dayHourHeight
                    );
                    if (slot.startMinutes < minAllowedMinutes) return;
                    setTaskDropPreview(slot);
                  }}
                  onDrop={(event) => {
                    if (draggingSession) {
                      event.preventDefault();
                      const pointerOffsetMinutes = Math.round(
                        draggingSession.durationMinutes * Math.max(0, Math.min(1, draggingSession.grabOffsetRatio))
                      );
                      const slot = calculateDraggedSlot(
                        event.clientY,
                        event.currentTarget.getBoundingClientRect(),
                        draggingSession.durationMinutes,
                        undefined,
                        dayHourHeight,
                        pointerOffsetMinutes
                      );
                      const isPersonalDrag2 = draggingSession.courseId === PERSONAL_EVENTS_COURSE_ID;
                      const course = isPersonalDrag2 ? undefined : courses.find((item) => item.id === draggingSession.courseId);
                      const meeting = isPersonalDrag2
                        ? personalEvents.find((e) => e.id === draggingSession.meetingId)
                        : course?.meetings.find((item) => item.id === draggingSession.meetingId);
                      const recurrenceCadence = meeting?.recurrence?.cadence ?? "weekly";
                      if (meeting && recurrenceCadence !== "none") {
                        setRecurrenceMovePrompt({
                          courseId: draggingSession.courseId,
                          meetingId: draggingSession.meetingId,
                          sourceDate: draggingSession.sourceDate,
                          targetDate: selectedDate,
                          startMinutes: slot.startMinutes
                        });
                      } else {
                        moveMeetingAtMinutes(
                          draggingSession.courseId,
                          draggingSession.meetingId,
                          selectedDate,
                          slot.startMinutes
                        );
                      }
                      setDragPreview(null);
                      setDraggingSession(null);
                      return;
                    }

                    const taskId = draggingTaskId ?? event.dataTransfer.getData("application/x-task-id");
                    if (!taskId) return;
                    event.preventDefault();
                    const task = tasks.find((t) => t.id === taskId);
                    if (!task) return;
                    const durationMinutes = workBlockDurationMinutesForTask(task);
                    const minAllowedMinutes = timelineHours[0] * 60;
                    const slot = calculateDraggedSlot(event.clientY, event.currentTarget.getBoundingClientRect(), durationMinutes, minAllowedMinutes, dayHourHeight);
                    if (slot.startMinutes < minAllowedMinutes) return;
                    const startAt = buildIsoAtMinutes(selectedDate, slot.startMinutes);
                    const endAt = buildIsoAtMinutes(selectedDate, slot.endMinutes);
                    const course = courseMap[task.courseId as string];
                    onAddWorkBlock({
                      taskId: task.id,
                      courseId: task.courseId,
                      startAt,
                      endAt,
                      status: "scheduled",
                      titleSnapshot: task.title,
                      colorSnapshot: course?.color
                    });
                    setTaskDropPreview(null);
                    setDraggingTaskId(null);
                  }}
                >
                  {timelineHours.map((hour) => (
                    <div key={hour} className="border-b border-slate-200/70 dark:border-white/10" style={{ height: `${dayHourHeight}px` }} />
                  ))}
                  {creatingSession && creatingSession.hasDragged && sameCalendarDate(creatingSession.date, selectedDate) && (
                    <div
                      ref={tentativeBlockRef}
                      className="pointer-events-none absolute left-[8px] right-[8px] rounded-[18px] border-2 border-dashed border-sky-400/70 bg-sky-100/45"
                      style={{
                        top: ((creatingSession.startMinutes - timelineHours[0] * 60) / 60) * dayHourHeight,
                        height: Math.max(28, ((creatingSession.endMinutes - creatingSession.startMinutes) / 60) * dayHourHeight)
                      }}
                    />
                  )}
                  {quickCreateDraft && quickCreateDraft.mode === "create" && sameCalendarDate(quickCreateDraft.date, selectedDate) && (
                    <div
                      ref={quickDraftBlockRef}
                      className="pointer-events-none absolute left-[8px] right-[8px] rounded-[18px] border border-sky-400/60 bg-sky-100/50"
                      style={{
                        top: ((parseTimeValue(quickCreateDraft.start) - timelineHours[0]) * dayHourHeight),
                        height: Math.max(28, (parseTimeValue(quickCreateDraft.end) - parseTimeValue(quickCreateDraft.start)) * dayHourHeight)
                      }}
                    >
                      <div className="px-2 py-1 text-[11px] font-medium text-sky-900/80 dark:text-sky-100/80">
                        {quickCreateDraft.title.trim() || "New Session"}
                      </div>
                    </div>
                  )}
                  {dragPreview && sameCalendarDate(dragPreview.date, selectedDate) && (
                    <div
                      className="pointer-events-none absolute left-[8px] right-[8px] z-20 rounded-[18px] border-2 border-dashed border-violet-500/60 bg-violet-100/40"
                      style={{
                        top: ((dragPreview.startMinutes - timelineHours[0] * 60) / 60) * dayHourHeight,
                        height: Math.max(28, ((dragPreview.endMinutes - dragPreview.startMinutes) / 60) * dayHourHeight)
                      }}
                    >
                      <div className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-medium text-violet-700 shadow-sm">
                        {formatHourMinutes(dragPreview.startMinutes)} - {formatHourMinutes(dragPreview.endMinutes)}
                      </div>
                    </div>
                  )}
                  {taskDropPreview && (
                    <div
                      className="pointer-events-none absolute left-[8px] right-[8px] z-20 rounded-[18px] border-2 border-dashed border-emerald-400/70 bg-emerald-100/30"
                      style={{
                        top: ((taskDropPreview.startMinutes - timelineHours[0] * 60) / 60) * dayHourHeight,
                        height: Math.max(28, ((taskDropPreview.endMinutes - taskDropPreview.startMinutes) / 60) * dayHourHeight)
                      }}
                    >
                      <div className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-medium text-emerald-700 shadow-sm">
                        {formatHourMinutes(taskDropPreview.startMinutes)} - {formatHourMinutes(taskDropPreview.endMinutes)}
                      </div>
                    </div>
                  )}
                  {layoutOverlappingEvents(selectedDaySessions.filter((item) => !item.meeting.isAllDay)).map((session) => {
                    const sessionDateKey = formatDateKey(session.date);
                    const resizePreview =
                      sessionResizePreview &&
                      sessionResizePreview.courseId === session.course.id &&
                      sessionResizePreview.meetingId === session.meeting.id &&
                      sessionResizePreview.dateKey === sessionDateKey
                        ? sessionResizePreview
                        : null;
                    const rawStart = resizePreview ? resizePreview.startMinutes : Math.round(parseTimeValue(session.meeting.start) * 60);
                    const rawEnd = resizePreview ? resizePreview.endMinutes : Math.round(parseTimeValue(session.meeting.end) * 60);
                    const startMinutes = Math.min(rawStart, rawEnd);
                    const endMinutes = Math.max(rawStart, rawEnd);
                    const top = Math.max(0, ((startMinutes - timelineHours[0] * 60) / 60) * dayHourHeight);
                    const height = Math.max(28, ((endMinutes - startMinutes) / 60) * dayHourHeight);
                    return (
                      <SessionCard
                        key={session.instanceKey}
                        session={session}
                        variant="day"
                        top={top}
                        height={height}
                        startMinutes={startMinutes}
                        endMinutes={endMinutes}
                        minAllowedMinutes={getMinimumAllowedMinutesForDate(selectedDate)}
                        selectedSession={selectedSession as CalendarSelectedSession | null}
                        newlyAddedCourseId={newlyAddedCourseId ?? null}
                        onSessionClick={onSessionClick}
                        onSessionDoubleClick={onSessionDoubleClick}
                        onOpenQuickEditor={openQuickEditorForSession}
                        onDragStart={(info: SessionDragInfo) => setDraggingSession(info)}
                        onDragEnd={() => { setDraggingSession(null); setDragPreview(null); }}
                        onResizeEdge={(edge, safeStart, end) => {
                          setResizingSession({ courseId: session.course.id, meetingId: session.meeting.id!, edge, startMinutes: safeStart, endMinutes: end, dateKey: sessionDateKey });
                          setSessionResizePreview({ courseId: session.course.id, meetingId: session.meeting.id!, startMinutes: safeStart, endMinutes: end, dateKey: sessionDateKey });
                        }}
                      />
                    );
                  })}
                  {selectedDayWorkBlocks.map((block) => {
                    const blockStartMinutes = minutesFromIso(block.startAt);
                    const blockEndMinutes = minutesFromIso(block.endAt);
                    const resizePreview = workBlockResizePreview && workBlockResizePreview.id === block.id ? workBlockResizePreview : null;
                    const preview = workBlockDragPreview && workBlockDragPreview.id === block.id ? workBlockDragPreview : null;
                    const rawStartB = resizePreview ? resizePreview.startMinutes : preview ? preview.startMinutes : blockStartMinutes;
                    const rawEndB = resizePreview ? resizePreview.endMinutes : preview ? preview.endMinutes : blockEndMinutes;
                    const startMinutes = Math.min(rawStartB, rawEndB);
                    const endMinutes = Math.max(rawStartB, rawEndB);
                    const top = Math.max(0, ((startMinutes - timelineHours[0] * 60) / 60) * dayHourHeight);
                    const height = Math.max(28, ((endMinutes - startMinutes) / 60) * dayHourHeight);
                    const course = courseMap[block.courseId as string];
                    const linkedTask = tasks.find((task) => task.id === block.taskId);
                    const color = block.colorSnapshot ?? course?.color ?? "#10b981";
                    const minAllowedMinutes = getMinimumAllowedMinutesForDate(selectedDate);
                    const timelineMaxMinutes = (timelineHours[timelineHours.length - 1] + 1) * 60;
                    const dayDateKey = formatDateKey(selectedDate);
                    return (
                      <WorkBlockCard
                        key={block.id}
                        block={block}
                        variant="day"
                        top={top}
                        height={height}
                        startMinutes={startMinutes}
                        endMinutes={endMinutes}
                        color={color}
                        linkedTaskTitle={linkedTask?.title}
                        minAllowedMinutes={minAllowedMinutes}
                        timelineMaxMinutes={timelineMaxMinutes}
                        dateKey={dayDateKey}
                        onDragStart={(info) => {
                          setDraggingWorkBlock({ id: info.id, durationMinutes: info.durationMinutes });
                          setWorkBlockDragPreview({ id: info.id, startMinutes: info.startMinutes, endMinutes: info.endMinutes, dateKey: info.dateKey });
                        }}
                        onDoubleClick={setActiveWorkBlockId}
                        onResizeEdge={(edge, start, end) => {
                          setResizingWorkBlock({ id: block.id, edge, startMinutes: start, endMinutes: end, dateKey: dayDateKey });
                          setWorkBlockResizePreview({ id: block.id, startMinutes: edge === "start" ? Math.max(start, minAllowedMinutes) : start, endMinutes: end, dateKey: dayDateKey });
                        }}
                      />
                    );
                  })}
                  {sameCalendarDate(selectedDate, today) && currentTimeTopDay !== null && (
                    <div className="pointer-events-none absolute left-0 right-0 z-10" style={{ top: currentTimeTopDay }}>
                      <div className="h-px bg-rose-400/70" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Panel className="flex h-full min-h-0 flex-col overflow-hidden bg-white/90 dark:bg-[#101317]/90">
            <div className="mb-2 shrink-0 px-4 pt-2.5">
              <div>
                <h3 className="text-base font-semibold">Tasks</h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Drag into the schedule to time-block.</p>
              </div>
            </div>
            <div className="calendar-scroll-area min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-2 pb-3 pt-1">
              {courses
                .filter((course) => !course.archived)
                .map((course) => {
                  const courseTasks = tasksByCourseId.get(course.id) ?? [];
                  if (courseTasks.length === 0) return null;
                  return (
                    <div key={course.id} className="mb-3 rounded-2xl border border-slate-200/80 dark:border-white/10">
                      <div className="flex items-center justify-between bg-slate-50/70 px-3 py-2 dark:bg-white/[0.03]">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: course.color }} />
                          <p className="text-sm font-semibold">{course.code}</p>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{courseTasks.length}</p>
                      </div>
                      <div className="divide-y divide-slate-200/70 dark:divide-white/10">
                        {courseTasks.map((task) => (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={(event) => {
                              setDraggingTaskId(task.id);
                              event.dataTransfer.effectAllowed = "copy";
                              event.dataTransfer.setData("application/x-task-id", task.id);
                            }}
                            onDragEnd={() => {
                              setDraggingTaskId(null);
                              setTaskDropPreview(null);
                            }}
                            className="group flex cursor-grab items-center justify-between gap-3 px-3 py-2.5 active:cursor-grabbing"
                          >
                            <button
                              type="button"
                              onClick={() => onOpenTask(task.id)}
                              className="flex min-w-0 flex-1 flex-col items-stretch text-start"
                            >
                              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{task.title}</p>
                              <p
                                className={`mt-0.5 break-words text-xs leading-snug ${
                                  task.dueAt && isOverdue(task.dueAt) && task.status !== "done"
                                    ? "font-medium text-rose-600 dark:text-rose-400"
                                    : "text-slate-500 dark:text-slate-400"
                                }`}
                              >
                                Due: {formatDue(task.dueAt)}
                                {" · "}
                                {task.status}
                                {" · "}
                                {(() => {
                                  const bookedBlock = bookedBlockByTaskId.get(task.id);
                                  return bookedBlock
                                    ? `Booked ${new Date(bookedBlock.startAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${new Date(bookedBlock.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                                    : "Still not booked";
                                })()}
                              </p>
                            </button>
                            {futureScheduledTaskIds.has(task.id) && (
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.8)]" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          </Panel>

          {activeWorkBlockId && (() => {
            const block = workBlocks.find((b) => b.id === activeWorkBlockId);
            const task = block ? tasks.find((t) => t.id === block.taskId) : undefined;
            if (!block) return null;
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                <Panel className="w-full max-w-md bg-white/95 p-5 dark:bg-[#101317]/95">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">Work block</h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{block.titleSnapshot ?? task?.title ?? "Task"}</p>
                    </div>
                    <Button variant="ghost" onClick={() => setActiveWorkBlockId(null)} className="h-10 w-10 p-0">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mb-4 text-sm text-slate-600 dark:text-slate-300">
                    {new Date(block.startAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })} –{" "}
                    {new Date(block.endAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="grid gap-2">
                    <Button
                      onClick={() => {
                        onUpdateWorkBlock({ id: block.id, status: "completed" });
                        setActiveWorkBlockId(null);
                      }}
                    >
                      Mark block complete
                    </Button>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          const start = new Date(block.startAt);
                          const end = new Date(block.endAt);
                          start.setMinutes(start.getMinutes() + 30);
                          end.setMinutes(end.getMinutes() + 30);
                          onUpdateWorkBlock({ id: block.id, startAt: start.toISOString(), endAt: end.toISOString() });
                          setActiveWorkBlockId(null);
                        }}
                      >
                        +30m
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const start = new Date(block.startAt);
                          const end = new Date(block.endAt);
                          start.setMinutes(start.getMinutes() + 60);
                          end.setMinutes(end.getMinutes() + 60);
                          onUpdateWorkBlock({ id: block.id, startAt: start.toISOString(), endAt: end.toISOString() });
                          setActiveWorkBlockId(null);
                        }}
                      >
                        +60m
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const start = new Date(block.startAt);
                          const end = new Date(block.endAt);
                          start.setDate(start.getDate() + 1);
                          end.setDate(end.getDate() + 1);
                          onUpdateWorkBlock({ id: block.id, startAt: start.toISOString(), endAt: end.toISOString() });
                          setActiveWorkBlockId(null);
                        }}
                      >
                        Tomorrow
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        onOpenTask(block.taskId);
                        setActiveWorkBlockId(null);
                      }}
                    >
                      Open task
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        onDeleteWorkBlock(block.id);
                        setActiveWorkBlockId(null);
                      }}
                      className="border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
                    >
                      Delete block
                    </Button>
                  </div>
                </Panel>
              </div>
            );
          })()}
        </div>
      )}
      </div>
      {quickCreateDraft && quickCreateAnchor && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[45]">
          <button type="button" className="absolute inset-0" onClick={() => { setQuickCreateDraft(null); setQuickCreateAnchor(null); }} aria-label="Close quick session creator" />
          <Panel
            id="quick-create-popover"
            className="absolute w-[300px] max-w-[calc(100vw-1.5rem)] overflow-y-auto animate-fadeSlide bg-white/95 p-2.5 shadow-[0_14px_32px_rgba(15,23,42,0.24)] dark:bg-[#11151d]/95"
            style={{ left: `${quickCreateAnchor.left}px`, top: `${quickCreateAnchor.top}px`, maxHeight: "calc(100vh - 24px)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <input
              value={quickCreateDraft.title}
              onChange={(event) => setQuickCreateDraft((curr) => curr ? { ...curr, title: event.target.value } : curr)}
              onKeyDown={onQuickCreateFieldEnter}
              placeholder={quickCreateDraft.mode === "edit" ? "Session title" : "New Event"}
              className="w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-base font-semibold outline-none placeholder:text-slate-400"
            />
            <input
              value={quickCreateDraft.location}
              onChange={(event) => setQuickCreateDraft((curr) => curr ? { ...curr, location: event.target.value } : curr)}
              onKeyDown={onQuickCreateFieldEnter}
              placeholder="Add Location or Video Call"
              className="mt-0.5 w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-xs outline-none placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => setQuickCreateDraft((curr) => curr ? { ...curr, detailsOpen: !curr.detailsOpen } : curr)}
              className="mt-1.5 w-full rounded-lg border border-slate-200/80 bg-slate-50/70 px-2 py-1.5 text-left text-xs transition hover:bg-slate-100/80 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
            >
              {quickCreateDraft.date.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" })}{" "}
              {quickCreateDraft.isAllDay ? "All-day" : `${quickCreateDraft.start} to ${quickCreateDraft.end}`}
            </button>
            <div className={`grid overflow-hidden transition-all duration-200 ease-out ${quickCreateDraft.detailsOpen ? "mt-2 max-h-80 opacity-100" : "max-h-0 opacity-0"}`}>
              <div className="grid gap-2 rounded-lg border border-slate-200/80 bg-slate-50/60 p-2 dark:border-white/10 dark:bg-white/[0.03]">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={quickCreateDraft.isAllDay}
                    onChange={(event) => setQuickCreateDraft((curr) => (curr ? { ...curr, isAllDay: event.target.checked } : curr))}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  all-day
                </label>
                <select
                  value={quickCreateDraft.courseId}
                  disabled={quickCreateDraft.mode === "edit"}
                  onChange={(event) => setQuickCreateDraft((curr) => curr ? { ...curr, courseId: event.target.value } : curr)}
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.05]"
                >
                  <option value={PERSONAL_EVENTS_COURSE_ID}>Unrelated (private session)</option>
                  {courses
                    .filter((course) => course.id !== PERSONAL_EVENTS_COURSE_ID)
                    .map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                </select>
                <select
                  value={quickCreateDraft.sessionType}
                  onChange={(event) => setQuickCreateDraft((curr) => curr ? { ...curr, sessionType: event.target.value as QuickSessionType } : curr)}
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-white/10 dark:bg-white/[0.05]"
                >
                  <option value="lecture">Lecture</option>
                  <option value="tutorial">Tirgul</option>
                </select>
                {!quickCreateDraft.isAllDay && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="time"
                      value={quickCreateDraft.start}
                      onChange={(event) => setQuickCreateDraft((curr) => curr ? { ...curr, start: event.target.value } : curr)}
                      onKeyDown={onQuickCreateFieldEnter}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-white/10 dark:bg-white/[0.05]"
                    />
                    <input
                      type="time"
                      value={quickCreateDraft.end}
                      onChange={(event) => setQuickCreateDraft((curr) => curr ? { ...curr, end: event.target.value } : curr)}
                      onKeyDown={onQuickCreateFieldEnter}
                      className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-white/10 dark:bg-white/[0.05]"
                    />
                  </div>
                )}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <input
                    type="date"
                    value={formatDateKey(quickCreateDraft.date)}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (!next) return;
                      setQuickCreateDraft((curr) => (curr ? { ...curr, date: new Date(`${next}T12:00:00`) } : curr));
                    }}
                    onKeyDown={onQuickCreateFieldEnter}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-white/10 dark:bg-white/[0.05]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() =>
                      setQuickCreateDraft((curr) => {
                        if (!curr) return curr;
                        const next = new Date(curr.date);
                        next.setDate(next.getDate() + 7);
                        return { ...curr, date: next };
                      })
                    }
                  >
                    +1 week
                  </Button>
                </div>
                <select value={quickCreateDraft.cadence} onChange={(event) => setQuickCreateDraft((curr) => curr ? { ...curr, cadence: event.target.value as SessionCadence } : curr)} className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-white/10 dark:bg-white/[0.05]">
                  <option value="none">Does not repeat</option>
                  <option value="weekly">Repeats weekly</option>
                </select>
                {quickCreateDraft.cadence === "weekly" && (
                  <div className="flex flex-wrap gap-1">
                    {weekDays.map((day) => {
                      const active = quickCreateDraft.repeatDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setQuickCreateDraft((curr) => {
                            if (!curr) return curr;
                            const next = active ? curr.repeatDays.filter((d) => d !== day) : [...curr.repeatDays, day];
                            return { ...curr, repeatDays: next.length > 0 ? next : [day] };
                          })}
                          className={`rounded-full px-2 py-1 text-[11px] ${active ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-slate-200/70 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300"}`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => { setQuickCreateDraft(null); setQuickCreateAnchor(null); }}>Cancel</Button>
              <Button onClick={commitQuickCreateSession}>
                {quickCreateDraft.mode === "edit" ? "Save" : "Add session"}
              </Button>
            </div>
          </Panel>
        </div>,
        document.body
      )}
      {recurrenceMovePrompt && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 px-4">
          <Panel className="w-full max-w-md bg-white/95 p-5 dark:bg-[#101317]/95">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Recurring class change</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Apply this move to only this class instance or to the series from now on.
                </p>
              </div>
              <Button variant="ghost" onClick={() => setRecurrenceMovePrompt(null)} className="h-10 w-10 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  moveMeetingSingleOccurrenceAtMinutes(
                    recurrenceMovePrompt.courseId,
                    recurrenceMovePrompt.meetingId,
                    recurrenceMovePrompt.sourceDate,
                    recurrenceMovePrompt.targetDate,
                    recurrenceMovePrompt.startMinutes
                  );
                  setRecurrenceMovePrompt(null);
                }}
              >
                Only this session
              </Button>
              <Button
                onClick={() => {
                  moveMeetingAtMinutes(
                    recurrenceMovePrompt.courseId,
                    recurrenceMovePrompt.meetingId,
                    recurrenceMovePrompt.targetDate,
                    recurrenceMovePrompt.startMinutes
                  );
                  setRecurrenceMovePrompt(null);
                }}
              >
                This and future sessions
              </Button>
            </div>
          </Panel>
        </div>
      )}
    </Panel>
  );
}
