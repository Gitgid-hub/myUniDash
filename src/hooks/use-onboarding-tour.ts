"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { createId } from "@/lib/id";
import { nowIso } from "@/lib/date";
import { MINIMAL_CORE_ONBOARDING_STEPS } from "@/lib/onboarding-steps";
import { pushSchoolOsToast } from "@/lib/global-app-toasts";
import type { Course, MainView, Task } from "@/lib/types";
import type { SchoolDispatchAction } from "@/lib/store";
import type { PendingSessionChoiceFlow } from "@/hooks/use-pending-session-choice-flow";

export function useOnboardingTour({
  ready,
  courses,
  tasks,
  onboardingCompletedAt,
  activeView,
  showTaskComposer,
  dispatch,
  isCatalogPickerOpen,
  isUtilityOpen,
  isSettingsOpen,
  pendingSessionChoiceFlow,
  setPendingSessionChoiceFlow,
  setCalendarMode,
  setIsUtilityOpen,
  setTabGuideFor,
  setIsSettingsOpen,
  setIsCatalogPickerOpen,
  setIsCourseActionsOpen,
  resetCatalogForAddCourseRetreat
}: {
  ready: boolean;
  courses: Course[];
  tasks: Task[];
  onboardingCompletedAt: string | null;
  activeView: MainView;
  showTaskComposer: boolean;
  dispatch: (action: SchoolDispatchAction) => void;
  isCatalogPickerOpen: boolean;
  isUtilityOpen: boolean;
  isSettingsOpen: boolean;
  pendingSessionChoiceFlow: PendingSessionChoiceFlow | null;
  setPendingSessionChoiceFlow: Dispatch<SetStateAction<PendingSessionChoiceFlow | null>>;
  setCalendarMode: Dispatch<SetStateAction<"month" | "week" | "day">>;
  setIsUtilityOpen: (open: boolean) => void;
  setTabGuideFor: Dispatch<SetStateAction<MainView>>;
  setIsSettingsOpen: (open: boolean) => void;
  setIsCatalogPickerOpen: (open: boolean) => void;
  setIsCourseActionsOpen: (open: boolean) => void;
  /** Reset catalog search/roadmap UI when onboarding steps back to “add course”. */
  resetCatalogForAddCourseRetreat?: () => void;
}) {
  const [onboardingActive, setOnboardingActive] = useState(false);
  const [onboardingStepIndex, setOnboardingStepIndex] = useState(0);
  const [onboardingTargetElement, setOnboardingTargetElement] = useState<HTMLElement | null>(null);
  const [onboardingActiveCourseCountAtStart, setOnboardingActiveCourseCountAtStart] = useState(0);
  const [onboardingDemoTaskId, setOnboardingDemoTaskId] = useState<string | null>(null);
  const [freshlyAddedCourseId, setFreshlyAddedCourseId] = useState<string | null>(null);
  const [onboardingRoadmapLoaded, setOnboardingRoadmapLoaded] = useState(false);

  const activeCourses = useMemo(() => courses.filter((course) => !course.archived), [courses]);
  const onboardingStep = onboardingActive ? MINIMAL_CORE_ONBOARDING_STEPS[onboardingStepIndex] ?? null : null;
  const onboardingAddedCourseCount = useMemo(
    () => Math.max(0, activeCourses.length - onboardingActiveCourseCountAtStart),
    [activeCourses.length, onboardingActiveCourseCountAtStart]
  );
  const onboardingCommittedCourseId = useMemo(() => {
    if (pendingSessionChoiceFlow) return null;
    if (onboardingAddedCourseCount <= 0) return null;
    return activeCourses.find((course) => course.meetings.length > 0)?.id ?? null;
  }, [activeCourses, onboardingAddedCourseCount, pendingSessionChoiceFlow]);
  const onboardingStepForTour = useMemo(() => {
    if (!onboardingStep) return null;
    if (onboardingStep.id !== "add-course") return onboardingStep;
    if (!onboardingCommittedCourseId) return onboardingStep;
    return {
      ...onboardingStep,
      body: "1 course selected. You can continue adding courses after onboarding is complete."
    };
  }, [onboardingCommittedCourseId, onboardingStep]);
  const onboardingCatalogLocked =
    onboardingActive && onboardingStep?.id === "add-course" && Boolean(onboardingCommittedCourseId);
  const onboardingCourseGlowId =
    onboardingActive && onboardingStep?.id === "calendar-hours" ? freshlyAddedCourseId : null;

  const resolveOnboardingTarget = useCallback((): HTMLElement | null => {
    if (!onboardingStep?.targetSelector) return null;
    if (onboardingStep.id === "add-course" && isCatalogPickerOpen) {
      const catalogPanel = document.querySelector("[data-onboarding='catalog-import-panel']");
      if (catalogPanel instanceof HTMLElement) return catalogPanel;
    }
    const target = document.querySelector(onboardingStep.targetSelector);
    return target instanceof HTMLElement ? target : null;
  }, [isCatalogPickerOpen, onboardingStep]);

  const beginOnboarding = useCallback(() => {
    const activeCourseCount = courses.filter((course) => !course.archived).length;
    setOnboardingActiveCourseCountAtStart(activeCourseCount);
    setOnboardingStepIndex(0);
    setOnboardingTargetElement(null);
    setFreshlyAddedCourseId(null);
    setOnboardingRoadmapLoaded(false);
    setPendingSessionChoiceFlow(null);
    setOnboardingActive(true);
  }, [courses, setPendingSessionChoiceFlow]);

  const finishOnboarding = useCallback(
    (markComplete = true) => {
      setOnboardingActive(false);
      setOnboardingTargetElement(null);
      if (markComplete) {
        dispatch({ type: "set-onboarding-complete", payload: nowIso() });
      }
    },
    [dispatch]
  );

  const advanceOnboarding = useCallback(() => {
    if (!onboardingActive) return;
    const step = MINIMAL_CORE_ONBOARDING_STEPS[onboardingStepIndex];
    const hasAddedCourseDuringOnboarding =
      courses.filter((course) => !course.archived).length > onboardingActiveCourseCountAtStart;
    const hasAtLeastOneScheduledMeeting = courses.some((course) => !course.archived && course.meetings.length > 0);
    if (step?.id === "add-course" && !hasAddedCourseDuringOnboarding) {
      pushSchoolOsToast({
        kind: "error",
        message: "Add one course from the roadmap list to continue onboarding."
      });
      return;
    }
    if (step?.id === "degree" && !onboardingRoadmapLoaded) {
      pushSchoolOsToast({
        kind: "error",
        message: "Load your roadmap first, then press the right arrow to continue."
      });
      return;
    }
    if (step?.id === "calendar-hours" && !hasAtLeastOneScheduledMeeting) {
      pushSchoolOsToast({
        kind: "error",
        message: "Choose class hours in Calendar to continue onboarding."
      });
      return;
    }
    if (step?.id === "calendar-hours" && pendingSessionChoiceFlow) {
      pushSchoolOsToast({
        kind: "error",
        message: "Pick one Tirgul option in Calendar to continue onboarding."
      });
      return;
    }
    const lastIdx = MINIMAL_CORE_ONBOARDING_STEPS.length - 1;
    if (onboardingStepIndex >= lastIdx) {
      finishOnboarding(true);
      return;
    }
    setOnboardingStepIndex((n) => Math.min(lastIdx, n + 1));
  }, [
    courses,
    finishOnboarding,
    onboardingActive,
    onboardingActiveCourseCountAtStart,
    onboardingRoadmapLoaded,
    onboardingStepIndex,
    pendingSessionChoiceFlow
  ]);

  const retreatOnboarding = useCallback(() => {
    if (!onboardingActive) return;
    const targetIndex = Math.max(0, onboardingStepIndex - 1);
    const targetStep = MINIMAL_CORE_ONBOARDING_STEPS[targetIndex];
    const shouldReturnToCatalog = targetStep?.id === "add-course";
    if (shouldReturnToCatalog) {
      const revertCourseId = pendingSessionChoiceFlow?.courseId ?? freshlyAddedCourseId;
      const hasCommittedFirstCourse = Boolean(onboardingCommittedCourseId);
      if (revertCourseId && !hasCommittedFirstCourse) {
        dispatch({ type: "delete-course", payload: revertCourseId });
        setPendingSessionChoiceFlow(null);
        setFreshlyAddedCourseId(null);
      }
      dispatch({ type: "set-view", payload: "courses" });
      setIsSettingsOpen(false);
      setIsCatalogPickerOpen(true);
      setIsCourseActionsOpen(false);
      resetCatalogForAddCourseRetreat?.();
    }
    setOnboardingStepIndex(targetIndex);
  }, [
    dispatch,
    freshlyAddedCourseId,
    onboardingActive,
    onboardingCommittedCourseId,
    onboardingStepIndex,
    pendingSessionChoiceFlow,
    setIsCatalogPickerOpen,
    setIsCourseActionsOpen,
    setIsSettingsOpen,
    setPendingSessionChoiceFlow,
    resetCatalogForAddCourseRetreat
  ]);

  useEffect(() => {
    if (!onboardingActive || onboardingStep?.id !== "add-course") return;
    if (onboardingAddedCourseCount <= 0 || onboardingCommittedCourseId) return;
    const chooseHoursStepIndex = MINIMAL_CORE_ONBOARDING_STEPS.findIndex((step) => step.id === "calendar-hours");
    setCalendarMode("week");
    dispatch({ type: "set-view", payload: "calendar" });
    if (chooseHoursStepIndex >= 0) {
      setOnboardingStepIndex(chooseHoursStepIndex);
    }
  }, [dispatch, onboardingActive, onboardingAddedCourseCount, onboardingCommittedCourseId, onboardingStep?.id, setCalendarMode]);

  useEffect(() => {
    if (!onboardingActive) return;

    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        advanceOnboarding();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        retreatOnboarding();
      }
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [advanceOnboarding, onboardingActive, retreatOnboarding]);

  const skipOnboarding = useCallback(() => {
    const hasAtLeastOneActiveCourse = courses.some((course) => !course.archived);
    const hasAtLeastOneScheduledMeeting = courses.some((course) => !course.archived && course.meetings.length > 0);
    if (!hasAtLeastOneActiveCourse) {
      const coursesStepIndex = MINIMAL_CORE_ONBOARDING_STEPS.findIndex((step) => step.id === "add-course");
      setOnboardingStepIndex(coursesStepIndex >= 0 ? coursesStepIndex : 0);
      pushSchoolOsToast({
        kind: "error",
        message: "Add your first course before finishing onboarding."
      });
      return;
    }
    if (!hasAtLeastOneScheduledMeeting) {
      const chooseHoursStepIndex = MINIMAL_CORE_ONBOARDING_STEPS.findIndex((step) => step.id === "calendar-hours");
      setOnboardingStepIndex(chooseHoursStepIndex >= 0 ? chooseHoursStepIndex : 0);
      pushSchoolOsToast({
        kind: "error",
        message: "Confirm at least one class hour in Calendar before finishing onboarding."
      });
      return;
    }
    if (pendingSessionChoiceFlow) {
      const chooseHoursStepIndex = MINIMAL_CORE_ONBOARDING_STEPS.findIndex((step) => step.id === "calendar-hours");
      setOnboardingStepIndex(chooseHoursStepIndex >= 0 ? chooseHoursStepIndex : 0);
      pushSchoolOsToast({
        kind: "error",
        message: "Choose a Tirgul option in Calendar before finishing onboarding."
      });
      return;
    }
    finishOnboarding(true);
  }, [courses, finishOnboarding, pendingSessionChoiceFlow]);

  useEffect(() => {
    if (!onboardingActive || onboardingStep?.id !== "calendar-day") return;
    setCalendarMode("day");
    const primaryCourse = activeCourses[0];
    if (!primaryCourse) return;
    const hasBookableTaskForCourse = tasks.some(
      (task) => task.courseId === primaryCourse.id && task.status !== "done"
    );
    if (hasBookableTaskForCourse) return;
    const demoTaskId = onboardingDemoTaskId ?? createId("task");
    if (!tasks.some((task) => task.id === demoTaskId)) {
      dispatch({
        type: "add-task",
        payload: {
          id: demoTaskId,
          title: "Drag me into your day plan",
          description: "Drop this task into a time slot to create a booked work block.",
          courseId: primaryCourse.id,
          status: "next",
          priority: "medium",
          effort: 1
        }
      });
    }
    setOnboardingDemoTaskId(demoTaskId);
  }, [
    activeCourses,
    dispatch,
    onboardingActive,
    onboardingDemoTaskId,
    onboardingStep?.id,
    setCalendarMode,
    tasks
  ]);

  useEffect(() => {
    if (!ready || onboardingActive) return;
    if (onboardingCompletedAt) return;
    if (courses.length > 0) return;
    beginOnboarding();
  }, [beginOnboarding, courses.length, onboardingActive, onboardingCompletedAt, ready]);

  useEffect(() => {
    if (!onboardingActive || !onboardingStep) return;
    if (onboardingStep.ensureView && activeView !== onboardingStep.ensureView) {
      dispatch({ type: "set-view", payload: onboardingStep.ensureView });
    }
    if (typeof onboardingStep.ensureUtilityOpen === "boolean") {
      setIsUtilityOpen(onboardingStep.ensureUtilityOpen);
      if (onboardingStep.ensureUtilityOpen) {
        setTabGuideFor(activeView);
      }
    }
    setIsSettingsOpen(onboardingStep.ensureSettingsOpen === true);
    setIsCatalogPickerOpen(onboardingStep.ensureCatalogPickerOpen === true);
  }, [
    activeView,
    dispatch,
    onboardingActive,
    onboardingStep,
    setIsCatalogPickerOpen,
    setIsSettingsOpen,
    setIsUtilityOpen,
    setTabGuideFor
  ]);

  useEffect(() => {
    if (!onboardingActive || onboardingStep?.id !== "class-notes" || !showTaskComposer) return;
    dispatch({ type: "set-composer", payload: false });
  }, [dispatch, onboardingActive, onboardingStep?.id, showTaskComposer]);

  useEffect(() => {
    if (!onboardingActive) {
      setOnboardingTargetElement(null);
      return;
    }
    const refresh = () => setOnboardingTargetElement(resolveOnboardingTarget());
    refresh();
    const id = window.setInterval(refresh, 250);
    return () => window.clearInterval(id);
  }, [
    onboardingActive,
    onboardingStepIndex,
    resolveOnboardingTarget,
    activeView,
    isUtilityOpen,
    isSettingsOpen,
    isCatalogPickerOpen
  ]);

  const markDegreeRoadmapStale = useCallback(() => {
    setOnboardingRoadmapLoaded(false);
  }, []);

  return {
    onboardingActive,
    onboardingStepIndex,
    onboardingTargetElement,
    onboardingStepForTour,
    onboardingCatalogLocked,
    onboardingCourseGlowId,
    freshlyAddedCourseId,
    setFreshlyAddedCourseId,
    onboardingRoadmapLoaded,
    setOnboardingRoadmapLoaded,
    beginOnboarding,
    finishOnboarding,
    advanceOnboarding,
    retreatOnboarding,
    skipOnboarding,
    markDegreeRoadmapStale
  };
}
