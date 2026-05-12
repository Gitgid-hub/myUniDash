"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  academicWeekKeyFromAnchor,
  findRecordingCatchUpDueAt,
  getAcademicWeekSunThu,
  getLastThursdaySessionEndInWeek,
  lastScheduledLectureTutorialEndInSunThuWeek,
  listCatchUpOccurrences,
  sortCatchUpOccurrencesBySchedule
} from "@/lib/academic-week-catchup";
import {
  formatDateKey,
  formatSessionType,
  startOfWeekGrid,
  type SessionOccurrence
} from "@/lib/calendar-occurrences";
import { getDemoWeeklyCatchupVirtualNow } from "@/lib/demo-weekly-catchup";
import { pushSchoolOsToast } from "@/lib/global-app-toasts";
import { createId } from "@/lib/id";
import { resolvePanoptoFolderUrl } from "@/lib/panopto-folder-url";
import type { SchoolDispatchAction } from "@/lib/store";
import type { Course, MainView, Task } from "@/lib/types";

const DEMO_WEEKLY_CATCHUP_TASK_TAG = "demo-weekly-catchup";

export function useWeeklyCatchUp({
  ready,
  activeView,
  catchUpEligibleCourses,
  activeCourses,
  tasks,
  catchUpPromptedWeekKey,
  catchUpSubmittedWeekKeys,
  weeklyCatchUpAutoPrompt,
  dispatch,
  addTask,
  setKanbanTab
}: {
  ready: boolean;
  activeView: MainView;
  catchUpEligibleCourses: Course[];
  activeCourses: Course[];
  tasks: Task[];
  catchUpPromptedWeekKey: string | undefined;
  catchUpSubmittedWeekKeys: string[] | undefined;
  weeklyCatchUpAutoPrompt: boolean;
  dispatch: (action: SchoolDispatchAction) => void;
  addTask: (input: {
    id?: string;
    title: string;
    description?: string;
    courseId?: string | "general";
    status?: Task["status"];
    dueAt?: string;
    priority?: Task["priority"];
    effort?: number;
    tags?: string[];
    attachments?: Task["attachments"];
    recurring?: Task["recurring"];
  }) => void;
  setKanbanTab: (tab: "board" | "completed") => void;
}) {
  const [weeklyCatchUpOpen, setWeeklyCatchUpOpen] = useState(false);
  const [weeklyCatchUpOccurrences, setWeeklyCatchUpOccurrences] = useState<SessionOccurrence[]>([]);
  const [weeklyCatchUpWeekKey, setWeeklyCatchUpWeekKey] = useState("");
  const [weeklyCatchUpWeekLabel, setWeeklyCatchUpWeekLabel] = useState("");
  const [catchUpGlowTaskIds, setCatchUpGlowTaskIds] = useState<string[]>([]);
  const [catchUpWeekNotReadyOpen, setCatchUpWeekNotReadyOpen] = useState(false);
  const [catchUpWeekNotReadyPayload, setCatchUpWeekNotReadyPayload] = useState<{ weekLabel: string; lastEnd: Date } | null>(
    null
  );
  const [weeklyCatchUpDemo, setWeeklyCatchUpDemo] = useState(false);
  const weeklyCatchUpDemoTaskIdsRef = useRef<string[]>([]);

  const openWeeklyCatchUpForAnchor = useCallback(
    (anchorDate: Date) => {
      const { start, end } = getAcademicWeekSunThu(anchorDate);
      const occ = sortCatchUpOccurrencesBySchedule(listCatchUpOccurrences(catchUpEligibleCourses, start, end));
      setWeeklyCatchUpOccurrences(occ);
      setWeeklyCatchUpWeekKey(academicWeekKeyFromAnchor(anchorDate));
      setWeeklyCatchUpWeekLabel(
        `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
      );
      setWeeklyCatchUpOpen(true);
    },
    [catchUpEligibleCourses]
  );

  const openWeeklyCatchUpRef = useRef(openWeeklyCatchUpForAnchor);
  openWeeklyCatchUpRef.current = openWeeklyCatchUpForAnchor;

  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      if (!weeklyCatchUpAutoPrompt) return;
      const now = new Date();
      const weekKey = academicWeekKeyFromAnchor(now);
      if (catchUpPromptedWeekKey === weekKey) return;
      const { start, end } = getAcademicWeekSunThu(now);
      const occ = listCatchUpOccurrences(catchUpEligibleCourses, start, end);
      const weekSunday = startOfWeekGrid(now, "sunday");
      const triggerAt = getLastThursdaySessionEndInWeek(occ, weekSunday);
      const beforeThursday = now.getTime() < triggerAt.getTime();
      if (beforeThursday) return;
      if (weeklyCatchUpDemo) return;
      dispatch({ type: "set-catch-up-prompt-week", payload: weekKey });
      dispatch({ type: "prune-catch-up-submitted-weeks", payload: { beforeWeekKey: weekKey } });
      setWeeklyCatchUpDemo(false);
      openWeeklyCatchUpRef.current(now);
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ready, catchUpEligibleCourses, catchUpPromptedWeekKey, dispatch, weeklyCatchUpDemo, weeklyCatchUpAutoPrompt]);

  const submittedCatchUpWeeks = useMemo(
    () => new Set(catchUpSubmittedWeekKeys ?? []),
    [catchUpSubmittedWeekKeys]
  );
  const isWeekKeySubmitted = useCallback((weekKey: string) => submittedCatchUpWeeks.has(weekKey), [submittedCatchUpWeeks]);

  const purgeWeeklyCatchUpDemoTasks = useCallback(() => {
    const ids = new Set<string>(weeklyCatchUpDemoTaskIdsRef.current);
    for (const t of tasks) {
      if ((t.tags ?? []).includes(DEMO_WEEKLY_CATCHUP_TASK_TAG)) ids.add(t.id);
    }
    weeklyCatchUpDemoTaskIdsRef.current = [];
    setWeeklyCatchUpDemo(false);
    for (const id of ids) {
      dispatch({ type: "delete-task", payload: id });
    }
  }, [dispatch, tasks]);

  const onOpenWeeklyCatchUpFromCalendar = useCallback(
    (weekAnchorDate: Date) => {
      const weekKey = academicWeekKeyFromAnchor(weekAnchorDate);
      if (isWeekKeySubmitted(weekKey)) {
        setWeeklyCatchUpDemo(false);
        openWeeklyCatchUpForAnchor(weekAnchorDate);
        return;
      }
      const lastEnd = lastScheduledLectureTutorialEndInSunThuWeek(weekAnchorDate, catchUpEligibleCourses);
      const now = new Date();
      if (now.getTime() < lastEnd.getTime()) {
        const { start, end } = getAcademicWeekSunThu(weekAnchorDate);
        const weekLabel = `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
        setCatchUpWeekNotReadyPayload({ weekLabel, lastEnd });
        setCatchUpWeekNotReadyOpen(true);
        return;
      }
      setWeeklyCatchUpDemo(false);
      openWeeklyCatchUpForAnchor(weekAnchorDate);
    },
    [catchUpEligibleCourses, isWeekKeySubmitted, openWeeklyCatchUpForAnchor]
  );

  const onDemoWeeklyCatchUp = useCallback(() => {
    purgeWeeklyCatchUpDemoTasks();
    const demoAnchor = getDemoWeeklyCatchupVirtualNow();
    const { start, end } = getAcademicWeekSunThu(demoAnchor);
    const occ = listCatchUpOccurrences(catchUpEligibleCourses, start, end);
    if (occ.length === 0) {
      pushSchoolOsToast({
        kind: "error",
        message:
          "Demo: no sessions in the frozen QA week. Edit `getDemoWeeklyCatchupVirtualNow` in `src/lib/demo-weekly-catchup.ts` to a Sun–Thu block that matches your calendar data."
      });
      return;
    }
    setWeeklyCatchUpDemo(true);
    openWeeklyCatchUpForAnchor(demoAnchor);
  }, [catchUpEligibleCourses, openWeeklyCatchUpForAnchor, purgeWeeklyCatchUpDemoTasks]);

  const handleWeeklyCatchUpGenerate = useCallback(
    (attendedInstanceKeys: Set<string>, mode: "initial" | "edit") => {
      const weekTag = `catchup-week-${weeklyCatchUpWeekKey}`;
      const newTaskIds: string[] = [];
      const isDemo = weeklyCatchUpDemo;
      for (const occ of weeklyCatchUpOccurrences) {
        if (attendedInstanceKeys.has(occ.instanceKey)) continue;
        const dedupeTag = `catchup:${occ.instanceKey}`;
        const dedupeBlocked = tasks.some((t) => {
          if (!(t.tags ?? []).includes(dedupeTag)) return false;
          if (isDemo && (t.tags ?? []).includes(DEMO_WEEKLY_CATCHUP_TASK_TAG)) return false;
          return true;
        });
        if (dedupeBlocked) continue;
        const courseLive = activeCourses.find((c) => c.id === occ.course.id) ?? occ.course;
        const sessionLabel = occ.meeting.title?.trim() || formatSessionType(occ.meeting.type);
        const dateStr = formatDateKey(occ.date);
        const courseName = courseLive.name?.trim();
        const coursePart =
          courseName && courseName !== courseLive.code.trim() ? `${courseName} (${courseLive.code})` : courseLive.code;
        const dueAt = findRecordingCatchUpDueAt(activeCourses, occ);
        const baseDescription = `Catch up for ${coursePart} on ${dateStr} ${occ.meeting.start}–${occ.meeting.end}`;
        const deadlineNote = dueAt
          ? ` Due before your next lecture/tutorial in this course (${new Date(dueAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}).`
          : " No later lecture/tutorial found on your calendar in the next year — add a due date manually if you want one.";
        const panoptoFolder = resolvePanoptoFolderUrl(courseLive);
        const panoptoNote = panoptoFolder ? `\n\nPanopto (course folder): ${panoptoFolder}` : "";
        const taskId = createId("task");
        const tags = isDemo
          ? (["recording-catchup", weekTag, dedupeTag, DEMO_WEEKLY_CATCHUP_TASK_TAG] as string[])
          : (["recording-catchup", weekTag, dedupeTag] as string[]);
        addTask({
          id: taskId,
          title: `Watch recording: ${coursePart} — ${sessionLabel}`,
          description: `${baseDescription}.${deadlineNote}${panoptoNote}`,
          courseId: courseLive.id,
          status: "backlog",
          dueAt,
          tags
        });
        newTaskIds.push(taskId);
      }
      if (isDemo) {
        weeklyCatchUpDemoTaskIdsRef.current = newTaskIds;
      } else {
        weeklyCatchUpDemoTaskIdsRef.current = [];
        dispatch({ type: "set-catch-up-prompt-week", payload: weeklyCatchUpWeekKey });
        dispatch({ type: "add-catch-up-submitted-week", payload: weeklyCatchUpWeekKey });
      }
      if (mode === "edit") {
        pushSchoolOsToast({
          kind: "success",
          message: newTaskIds.length > 0 ? `Updated catch-up — added ${newTaskIds.length} task(s).` : "Catch-up updated. No new tasks added."
        });
      }
      return { created: newTaskIds.length, newTaskIds };
    },
    [weeklyCatchUpOccurrences, weeklyCatchUpWeekKey, tasks, activeCourses, addTask, dispatch, weeklyCatchUpDemo]
  );

  const handleWeeklyCatchUpGoToTasks = useCallback(
    (newTaskIds: string[]) => {
      setCatchUpGlowTaskIds(newTaskIds);
      setKanbanTab("board");
      dispatch({ type: "set-course-filter", payload: "all" });
      dispatch({ type: "set-view", payload: "kanban" });
      setWeeklyCatchUpOpen(false);
    },
    [dispatch, setKanbanTab]
  );

  /**
   * Glow clears when leaving Kanban; demo catch-up tasks are removed then too.
   * Intentionally omit `catchUpGlowTaskIds` from deps: when “Go to tasks” sets glow then switches to Kanban,
   * a commit can still have activeView !== "kanban" while glow ids are already set — this would clear glow
   * and purge demo tasks before you see them.
   */
  useEffect(() => {
    if (activeView !== "kanban") {
      if (catchUpGlowTaskIds.length > 0) {
        setCatchUpGlowTaskIds([]);
      }
      purgeWeeklyCatchUpDemoTasks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps intentionally match prior SchoolOS behavior
  }, [activeView, purgeWeeklyCatchUpDemoTasks]);

  const onWeeklyCatchUpModalClose = useCallback(() => {
    purgeWeeklyCatchUpDemoTasks();
    setWeeklyCatchUpOpen(false);
  }, [purgeWeeklyCatchUpDemoTasks]);

  const onCatchUpWeekNotReadyClose = useCallback(() => {
    setCatchUpWeekNotReadyOpen(false);
    setCatchUpWeekNotReadyPayload(null);
  }, []);

  const overlayProps = useMemo(
    () => ({
      dispatch,
      weeklyCatchUpOpen,
      weeklyCatchUpWeekLabel,
      weeklyCatchUpOccurrences,
      weeklyCatchUpDemo,
      alreadySubmitted: weeklyCatchUpDemo ? false : isWeekKeySubmitted(weeklyCatchUpWeekKey),
      weeklyCatchUpAutoPrompt,
      onWeeklyCatchUpClose: onWeeklyCatchUpModalClose,
      onGenerate: handleWeeklyCatchUpGenerate,
      onGoToTasks: handleWeeklyCatchUpGoToTasks,
      catchUpWeekNotReadyOpen,
      catchUpWeekNotReadyWeekLabel: catchUpWeekNotReadyPayload?.weekLabel ?? "",
      catchUpWeekNotReadyLastEnd: catchUpWeekNotReadyPayload?.lastEnd ?? new Date(),
      onCatchUpWeekNotReadyClose
    }),
    [
      dispatch,
      weeklyCatchUpOpen,
      weeklyCatchUpWeekLabel,
      weeklyCatchUpOccurrences,
      weeklyCatchUpDemo,
      weeklyCatchUpWeekKey,
      weeklyCatchUpAutoPrompt,
      onWeeklyCatchUpModalClose,
      handleWeeklyCatchUpGenerate,
      handleWeeklyCatchUpGoToTasks,
      catchUpWeekNotReadyOpen,
      catchUpWeekNotReadyPayload,
      onCatchUpWeekNotReadyClose,
      isWeekKeySubmitted
    ]
  );

  return {
    catchUpGlowTaskIds,
    onOpenWeeklyCatchUpFromCalendar,
    onDemoWeeklyCatchUp,
    overlayProps
  };
}
