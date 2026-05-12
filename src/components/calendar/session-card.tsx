import type { CSSProperties } from "react";
import { PERSONAL_EVENTS_COURSE_ID, formatSessionType, parseTimeValue } from "@/lib/calendar-occurrences";
import type { PositionedOccurrence } from "@/lib/calendar-occurrences";
import { formatHourMinutes, sameCalendarDate, softCourseStyle } from "@/lib/calendar-utils";
import type { Course, CourseMeeting } from "@/lib/types";

export interface SessionDragInfo {
  courseId: string;
  meetingId: string;
  durationMinutes: number;
  grabOffsetRatio: number;
  sourceDate: Date;
}

export interface SelectedSession {
  courseId: string;
  meetingId: string;
  anchorDate: Date;
}

export interface SessionCardProps {
  session: PositionedOccurrence;
  top: number;
  height: number;
  startMinutes: number;
  endMinutes: number;
  minAllowedMinutes: number;
  selectedSession: SelectedSession | null;
  newlyAddedCourseId: string | null;
  /** Pass true to dim the card (week-view tentative-option hover). */
  dimmed?: boolean;
  variant: "week" | "day";
  onSessionClick: (courseId: string, meetingId: string, date: Date) => void;
  onSessionDoubleClick?: (courseId: string, meetingId: string, date: Date) => void;
  onOpenQuickEditor: (course: Course, meeting: CourseMeeting, date: Date, rect: DOMRect) => void;
  onDragStart: (info: SessionDragInfo) => void;
  onDragEnd: () => void;
  onResizeEdge: (edge: "start" | "end", safeStartMinutes: number, endMinutes: number) => void;
}

export function SessionCard({
  session,
  top,
  height,
  startMinutes,
  endMinutes,
  minAllowedMinutes,
  selectedSession,
  newlyAddedCourseId,
  dimmed,
  variant,
  onSessionClick,
  onSessionDoubleClick,
  onOpenQuickEditor,
  onDragStart,
  onDragEnd,
  onResizeEdge
}: SessionCardProps) {
  const isUltraCompact = height < 48;
  const isCompactSession = height < 70;
  const isWeek = variant === "week";

  const isPrivateSession = session.course.id === PERSONAL_EVENTS_COURSE_ID;
  const meetingTitle = session.meeting.title?.trim();
  const sessionPrimaryTitle = isPrivateSession
    ? (meetingTitle || "New session")
    : (meetingTitle || session.course.name);
  const sessionSecondaryTitle = isPrivateSession
    ? "Private"
    : meetingTitle
      ? session.course.name
      : formatSessionType(session.meeting.type);

  const overlapStepPct = session.totalColumns > 1 ? Math.min(10, 100 / (session.totalColumns * 2)) : 0;
  const overlapWidthPct = session.totalColumns > 1 ? 100 - overlapStepPct * (session.totalColumns - 1) : 100;
  const isFreshlyAddedCourse = newlyAddedCourseId === session.course.id;

  const isSelected =
    selectedSession?.courseId === session.course.id &&
    selectedSession?.meetingId === session.meeting.id &&
    sameCalendarDate(selectedSession.anchorDate, session.date);

  const insetPx = isWeek ? 6 : 8;
  const totalInsetPx = isWeek ? 12 : 16;
  const shadowBase = isWeek
    ? "0 10px 24px rgba(15,23,42,0.08)"
    : "0 10px 28px rgba(15,23,42,0.08)";

  const style: CSSProperties = {
    ...softCourseStyle(session.course.color),
    top,
    height,
    borderColor: isSelected ? "rgba(250,204,21,0.72)" : `${session.course.color}50`,
    left: `calc(${session.column * overlapStepPct}% + ${insetPx}px)`,
    width: `calc(${overlapWidthPct}% - ${totalInsetPx}px)`,
    opacity: dimmed ? 0.22 : 1,
    zIndex: 10 + session.column,
    boxShadow: isSelected
      ? `0 0 0 1px rgba(250,204,21,0.55), 0 0 14px rgba(250,204,21,0.20), ${shadowBase}`
      : isFreshlyAddedCourse
        ? `0 0 0 1px rgba(34,197,94,0.45), 0 0 18px rgba(16,185,129,0.26), ${shadowBase}`
        : undefined
  };

  const roundedClass = isWeek ? "rounded-2xl" : "rounded-[22px]";
  const shadowClass = isWeek
    ? "shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
    : "shadow-[0_10px_28px_rgba(15,23,42,0.08)]";
  const resizeHandleInset = isWeek ? "left-2 right-2" : "left-3 right-3";

  const layoutClass = isUltraCompact
    ? "flex-row items-center gap-1 px-2 py-0"
    : isWeek
      ? "flex-col gap-0.5 px-3 py-2"
      : isCompactSession
        ? "flex-col gap-0 px-3 py-1.5"
        : "flex-col gap-0.5 px-4 py-3";

  return (
    <button
      type="button"
      key={session.instanceKey}
      data-calendar-interactive="true"
      draggable
      onMouseDown={(event) => { event.stopPropagation(); }}
      onDragStart={(event) => {
        const durationMinutes = Math.max(
          30,
          Math.round(Math.abs(parseTimeValue(session.meeting.end) - parseTimeValue(session.meeting.start)) * 60)
        );
        const rect = event.currentTarget.getBoundingClientRect();
        const grabOffsetRatio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", session.meeting.id!);
        onDragStart({
          courseId: session.course.id,
          meetingId: session.meeting.id!,
          durationMinutes,
          grabOffsetRatio: Math.max(0, Math.min(1, grabOffsetRatio)),
          sourceDate: session.date
        });
      }}
      onDragEnd={onDragEnd}
      onClick={() => onSessionClick(session.course.id, session.meeting.id!, session.date)}
      onDoubleClick={(event) => {
        onSessionDoubleClick?.(session.course.id, session.meeting.id!, session.date);
        onOpenQuickEditor(session.course, session.meeting, session.date, event.currentTarget.getBoundingClientRect());
      }}
      dir="auto"
      className={`absolute flex min-h-0 min-w-0 overflow-hidden ${roundedClass} border text-start ${shadowClass} transition-opacity ${layoutClass}${isWeek ? " text-xs" : ""}`}
      style={style}
    >
      {isUltraCompact ? (
        <p dir="auto" className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-none text-slate-900 dark:text-white">
          {sessionPrimaryTitle}
        </p>
      ) : (
        <>
          <p className={`min-w-0 max-w-full break-words font-semibold text-slate-900 dark:text-white ${
            isCompactSession
              ? isWeek ? "text-[11px] leading-[13px] line-clamp-1" : "text-[12px] leading-[14px] line-clamp-1"
              : isWeek ? "leading-tight line-clamp-2" : "text-sm leading-tight line-clamp-2"
          }`}>
            {sessionPrimaryTitle}
          </p>
          {!isCompactSession && (
            <p className={`min-w-0 max-w-full break-words leading-tight line-clamp-2 ${
              isWeek ? "text-slate-700 dark:text-white/95" : "text-xs text-slate-700 dark:text-white/95"
            }`}>
              {sessionSecondaryTitle}
            </p>
          )}
          <p
            dir="ltr"
            className={`min-w-0 max-w-full ${
              isCompactSession ? "text-[10px] leading-[12px]" : isWeek ? "text-[11px] leading-tight" : "text-xs leading-tight"
            } ${isWeek ? "mt-0.5 text-slate-600 dark:text-white/90" : "text-slate-700 dark:text-white/90"}`}
          >
            {formatHourMinutes(startMinutes)} - {formatHourMinutes(endMinutes)}
          </p>
          {session.meeting.location && height >= 110 && (
            <p className={`mt-0.5 whitespace-normal break-words text-[11px] leading-snug ${
              isWeek ? "text-slate-600 dark:text-white/90" : "text-xs text-slate-700 line-clamp-2 dark:text-white/90"
            }`}>
              {session.meeting.location}
            </p>
          )}
        </>
      )}

      {/* Top resize handle */}
      <span
        className={`absolute ${resizeHandleInset} top-0.5 cursor-ns-resize rounded-full bg-white/20 opacity-0 transition-opacity hover:opacity-100 ${isCompactSession ? "h-1" : "h-1.5"}`}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const safeStart = Math.max(startMinutes, minAllowedMinutes);
          if (safeStart >= endMinutes - 15) return;
          onResizeEdge("start", safeStart, endMinutes);
        }}
      />

      {/* Bottom resize handle */}
      <span
        className={`absolute ${resizeHandleInset} bottom-0.5 cursor-ns-resize rounded-full bg-white/20 opacity-0 transition-opacity hover:opacity-100 ${isCompactSession ? "h-1" : "h-1.5"}`}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onResizeEdge("end", startMinutes, endMinutes);
        }}
      />
    </button>
  );
}
