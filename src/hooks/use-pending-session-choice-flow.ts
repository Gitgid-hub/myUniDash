"use client";

import { useCallback, useMemo, useState, type MutableRefObject } from "react";
import { pushSchoolOsToast } from "@/lib/global-app-toasts";
import type { Course, CourseMeeting } from "@/lib/types";
import type { SchoolDispatchAction } from "@/lib/store";

export interface ImportedMeetingChoiceOption {
  optionId: string;
  label: string;
  meetings: CourseMeeting[];
}

export interface ImportedMeetingChoiceSet {
  setId: string;
  label: string;
  options: ImportedMeetingChoiceOption[];
}

export type PendingSessionChoiceFlow = {
  courseId: string;
  courseName: string;
  courseColor: string;
  sets: Array<{
    setId: string;
    label: string;
    options: Array<{
      optionId: string;
      label: string;
      meetings: CourseMeeting[];
    }>;
  }>;
  activeSetIndex: number;
};

export function usePendingSessionChoiceFlow({
  courses,
  dispatch,
  schedulePanoptoFolderPrompt,
  pendingPanoptoAfterSessionChoiceRef
}: {
  courses: Course[];
  dispatch: (action: SchoolDispatchAction) => void;
  schedulePanoptoFolderPrompt: (courseId: string, courseName: string, code: string) => void;
  pendingPanoptoAfterSessionChoiceRef: MutableRefObject<{ courseId: string; courseName: string } | null>;
}) {
  const [pendingSessionChoiceFlow, setPendingSessionChoiceFlow] = useState<PendingSessionChoiceFlow | null>(null);

  const activeChoiceSet = useMemo(() => {
    if (!pendingSessionChoiceFlow) return null;
    return pendingSessionChoiceFlow.sets[pendingSessionChoiceFlow.activeSetIndex] ?? null;
  }, [pendingSessionChoiceFlow]);

  const tentativeCalendarOptions = useMemo(() => {
    if (!pendingSessionChoiceFlow || !activeChoiceSet) return [];
    return activeChoiceSet.options.map((option, index) => ({
      optionId: option.optionId,
      optionIndex: index + 1,
      displayLabel: `Option ${index + 1}`,
      label: option.label,
      courseId: pendingSessionChoiceFlow.courseId,
      courseName: pendingSessionChoiceFlow.courseName,
      courseColor: pendingSessionChoiceFlow.courseColor,
      meetings: option.meetings
    }));
  }, [activeChoiceSet, pendingSessionChoiceFlow]);

  const selectTentativeCalendarOption = useCallback(
    (optionId: string) => {
      if (!pendingSessionChoiceFlow) return;
      const currentSet = pendingSessionChoiceFlow.sets[pendingSessionChoiceFlow.activeSetIndex];
      if (!currentSet) return;
      const picked = currentSet.options.find((option) => option.optionId === optionId);
      if (!picked) return;
      const course = courses.find((item) => item.id === pendingSessionChoiceFlow.courseId);
      if (!course) return;
      const existingKeys = new Set(
        course.meetings.map((meeting) => `${meeting.day}-${meeting.start}-${meeting.end}-${meeting.title ?? ""}-${meeting.location ?? ""}`)
      );
      const nextMeetings = [...course.meetings];
      for (const meeting of picked.meetings) {
        const key = `${meeting.day}-${meeting.start}-${meeting.end}-${meeting.title ?? ""}-${meeting.location ?? ""}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        nextMeetings.push(meeting);
      }
      dispatch({
        type: "update-course",
        payload: {
          id: course.id,
          meetings: nextMeetings
        }
      });
      if (pendingSessionChoiceFlow.activeSetIndex >= pendingSessionChoiceFlow.sets.length - 1) {
        const flow = pendingSessionChoiceFlow;
        const pendingPan = pendingPanoptoAfterSessionChoiceRef.current;
        setPendingSessionChoiceFlow(null);
        if (pendingPan && pendingPan.courseId === flow.courseId) {
          pendingPanoptoAfterSessionChoiceRef.current = null;
          schedulePanoptoFolderPrompt(pendingPan.courseId, pendingPan.courseName, course.code);
        }
        pushSchoolOsToast({
          kind: "success",
          message: "Session choice saved. Other options were removed."
        });
        return;
      }
      setPendingSessionChoiceFlow((current) => (current ? { ...current, activeSetIndex: current.activeSetIndex + 1 } : current));
    },
    [courses, dispatch, pendingPanoptoAfterSessionChoiceRef, pendingSessionChoiceFlow, schedulePanoptoFolderPrompt]
  );

  return {
    pendingSessionChoiceFlow,
    setPendingSessionChoiceFlow,
    activeChoiceSet,
    tentativeCalendarOptions,
    selectTentativeCalendarOption
  };
}
