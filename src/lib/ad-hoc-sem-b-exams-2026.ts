import type { Course, CourseMeeting, ReminderSettings, Task, WeekDay } from "@/lib/types";

/** Hours-before-due used with tasks whose `dueAt` is the exam start (optional; primary nudges are dedicated tasks). */
export function mergeAdHocReminderOffsets(settings: ReminderSettings): ReminderSettings {
  const base = [...(settings.offsetsHours ?? [])];
  for (const h of [336, 168]) {
    if (!base.some((x) => Math.abs(x - h) < 0.01)) base.push(h);
  }
  return { offsetsHours: Array.from(new Set(base)).sort((a, b) => b - a) };
}

/**
 * Ad-hoc HUJI Semester B 2026 final exams (Moed A / B), keyed by imported course code.
 * - Calendar: `type: "exam"` meetings merged on hydrate when `course.code` matches.
 * - Tasks: two reminders per exam (due 14 days and 7 days before exam start, same clock time).
 * - Reminder offsets: `mergeAdHocReminderOffsets` adds 336h and 168h for `getReminderMatches` on exam-due tasks if you add them later.
 * Remove this file when you no longer need the overlay.
 */
type ExamRow = {
  anchorYmd: string;
  day: WeekDay;
  start: string;
  end: string;
  title: string;
  moed: "A" | "B";
};

const AD_HOC_BLOCKS: Array<{ patterns: string[]; exams: ExamRow[] }> = [
  {
    patterns: ["76632-1-01"],
    exams: [
      { anchorYmd: "2026-07-05", day: "Sun", start: "09:00", end: "11:00", title: "Exam — מועד א' (Moed A)", moed: "A" },
      { anchorYmd: "2026-08-06", day: "Thu", start: "09:00", end: "11:00", title: "Exam — מועד ב' (Moed B)", moed: "B" }
    ]
  },
  {
    patterns: ["72320-1-01"],
    exams: [
      { anchorYmd: "2026-07-13", day: "Mon", start: "09:00", end: "11:00", title: "Exam — מועד א' (Moed A)", moed: "A" },
      { anchorYmd: "2026-08-02", day: "Sun", start: "09:00", end: "11:00", title: "Exam — מועד ב' (Moed B)", moed: "B" }
    ]
  },
  {
    patterns: ["6177-1-01"],
    exams: [
      { anchorYmd: "2026-07-15", day: "Wed", start: "09:00", end: "12:00", title: "Exam — מועד א' (Moed A)", moed: "A" },
      { anchorYmd: "2026-08-06", day: "Thu", start: "09:00", end: "12:00", title: "Exam — מועד ב' (Moed B)", moed: "B" }
    ]
  },
  {
    patterns: ["72368-1-01"],
    exams: [
      { anchorYmd: "2026-07-20", day: "Mon", start: "09:00", end: "12:00", title: "Exam — מועד א' (Moed A)", moed: "A" },
      { anchorYmd: "2026-08-05", day: "Wed", start: "09:00", end: "12:00", title: "Exam — מועד ב' (Moed B)", moed: "B" }
    ]
  },
  {
    patterns: ["6172-1-01"],
    exams: [
      { anchorYmd: "2026-07-21", day: "Tue", start: "14:00", end: "17:00", title: "Exam — מועד א' (Moed A)", moed: "A" },
      { anchorYmd: "2026-08-16", day: "Sun", start: "09:00", end: "12:00", title: "Exam — מועד ב' (Moed B)", moed: "B" }
    ]
  }
];

function normCode(code: string) {
  return code
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normCodeCompact(code: string) {
  return normCode(code).replace(/\s/g, "");
}

function buildStableMeeting(codeKey: string, e: ExamRow): CourseMeeting {
  const safeKey = normCode(codeKey).replace(/[^a-zA-Z0-9._-]/g, "_");
  const id = `adhoc_exam_${safeKey}_${e.anchorYmd}_moed${e.moed}_${e.start.replace(":", "")}`;
  return {
    id,
    day: e.day,
    start: e.start,
    end: e.end,
    anchorDate: new Date(`${e.anchorYmd}T12:00:00`).toISOString(),
    title: e.title,
    notes: "",
    type: "exam",
    isAllDay: false,
    recurrence: { cadence: "none", interval: 1 },
    seriesId: `${id}_series`
  };
}

function adHocExamsForCourse(course: Course): CourseMeeting[] {
  const c = normCode(course.code);
  const compact = normCodeCompact(course.code);
  for (const block of AD_HOC_BLOCKS) {
    if (
      block.patterns.some((p) => normCode(p) === c || normCodeCompact(p) === compact)
    ) {
      return block.exams.map((e) => buildStableMeeting(block.patterns[0], e));
    }
  }
  return [];
}

/** Non-mutating: appends ad-hoc exam meetings when the course code matches. */
export function mergeAdHocExamsIntoCourse(course: Course): Course {
  const extras = adHocExamsForCourse(course);
  if (extras.length === 0) return course;
  const existingIds = new Set(course.meetings.map((m) => m.id).filter(Boolean));
  const toAdd = extras.filter((m) => m.id && !existingIds.has(m.id));
  if (toAdd.length === 0) return course;
  return { ...course, meetings: [...course.meetings, ...toAdd] };
}

function meetingAnchorYmd(meeting: CourseMeeting): string {
  if (meeting.id?.startsWith("adhoc_exam_")) {
    const m = meeting.id.match(/_(\d{4}-\d{2}-\d{2})_moed/);
    if (m?.[1]) return m[1];
  }
  if (!meeting.anchorDate) return "";
  const d = new Date(meeting.anchorDate);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function moedFromMeeting(meeting: CourseMeeting): "A" | "B" {
  const t = meeting.title ?? "";
  return t.includes("מועד ב") || t.includes("Moed B") ? "B" : "A";
}

function reminderDueIso(anchorYmd: string, examStartHHMM: string, daysBeforeExam: number): string {
  const [y, mo, d] = anchorYmd.split("-").map(Number);
  const [h, mi] = examStartHHMM.split(":").map(Number);
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  dt.setDate(dt.getDate() - daysBeforeExam);
  return dt.toISOString();
}

function examStartLabel(anchorYmd: string, start: string): string {
  try {
    const [y, mo, d] = anchorYmd.split("-").map(Number);
    const [h, mi] = start.split(":").map(Number);
    return new Date(y, mo - 1, d, h, mi, 0, 0).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return `${anchorYmd} ${start}`;
  }
}

/**
 * Prepends stable reminder tasks (2 weeks + 1 week before each ad-hoc exam) for matching courses.
 * Skips ids that already exist so persisted state does not duplicate.
 */
export function mergeAdHocExamTasksIntoList(tasks: Task[], courses: Course[], createdAt: string): Task[] {
  const existingIds = new Set(tasks.map((t) => t.id));
  const additions: Task[] = [];

  for (const course of courses) {
    for (const meeting of adHocExamsForCourse(course)) {
      const ymd = meetingAnchorYmd(meeting);
      if (!ymd || !meeting.start) continue;
      const moed = moedFromMeeting(meeting);
      const examLabel = examStartLabel(ymd, meeting.start);
      const baseTitle = meeting.title?.replace(/^Exam — /, "") ?? `Moed ${moed}`;

      for (const weeks of [2, 1] as const) {
        const id = `adhoc_exam_task_${course.id}_${ymd}_moed${moed}_${weeks}wk`;
        if (existingIds.has(id)) continue;
        existingIds.add(id);
        const dueAt = reminderDueIso(ymd, meeting.start, weeks === 2 ? 14 : 7);
        additions.push({
          id,
          title: weeks === 2 ? `Final exam in 2 weeks — ${baseTitle}` : `Final exam in 1 week — ${baseTitle}`,
          description: `${course.code} · ${course.name}\nExam starts: ${examLabel}. (Calendar shows the exam session.)`,
          courseId: course.id,
          status: "next",
          priority: "high",
          effort: 1,
          tags: ["adhoc-exam-reminder", weeks === 2 ? "2wk" : "1wk", `moed-${moed}`],
          attachments: [],
          dueAt,
          createdAt,
          updatedAt: createdAt
        });
      }
    }
  }

  if (additions.length === 0) return tasks;
  return [...additions, ...tasks];
}
