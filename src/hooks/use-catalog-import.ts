"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { pickDistinctCourseColor } from "@/lib/color-utils";
import type { CatalogDegreeOption, CatalogSearchCourse, CatalogSearchMeeting } from "@/lib/catalog-types";
import {
  dedupeLabelSegments,
  getImportedChoiceSetPriority,
  inferMeetingKindFromCatalogType,
  type ImportedMeetingChoiceSet
} from "@/lib/catalog-import-helpers";
import { createId } from "@/lib/id";
import { pushSchoolOsToast } from "@/lib/global-app-toasts";
import { shouldOfferPanoptoFolderPastePrompt } from "@/lib/panopto-folder-url";
import type { Course, CourseMeeting } from "@/lib/types";
import type { SchoolDispatchAction, CourseInput } from "@/lib/store";
import type { PendingSessionChoiceFlow } from "@/hooks/use-pending-session-choice-flow";
import type { CatalogRoadmapGroup } from "@/components/school-os/catalog-import-modal";

const DEGREE_ROADMAP_CACHE_STORAGE_KEY = "school-os:degree-roadmap-cache:v1";

export function useCatalogImport({
  userId,
  courses,
  dispatch,
  addCourse,
  getAuthHeader,
  schedulePanoptoFolderPrompt,
  pendingPanoptoAfterSessionChoiceRef,
  setPendingSessionChoiceFlow,
  setFreshlyAddedCourseId,
  setVisibleCourseIds,
  setIsCatalogPickerOpen,
  setIsSettingsOpen,
  setIsCourseActionsOpen,
  setCalendarMode,
  catalogDegreeOptions,
  catalogDegree,
  setCatalogDegree,
  setCatalogDegreeSearchQuery,
  setIsCatalogDegreeOptionsOpen,
  setCatalogError,
  isCatalogPickerOpen,
  onboardingActive,
  markDegreeRoadmapStale,
  setOnboardingRoadmapLoaded
}: {
  userId: string | undefined;
  courses: Course[];
  dispatch: (action: SchoolDispatchAction) => void;
  addCourse: (input: CourseInput) => void;
  getAuthHeader: () => Promise<Record<string, string>>;
  schedulePanoptoFolderPrompt: (courseId: string, courseName: string, code: string) => void;
  pendingPanoptoAfterSessionChoiceRef: MutableRefObject<{ courseId: string; courseName: string } | null>;
  setPendingSessionChoiceFlow: Dispatch<SetStateAction<PendingSessionChoiceFlow | null>>;
  setFreshlyAddedCourseId: Dispatch<SetStateAction<string | null>>;
  setVisibleCourseIds: Dispatch<SetStateAction<string[]>>;
  setIsCatalogPickerOpen: (open: boolean) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setIsCourseActionsOpen: (open: boolean) => void;
  setCalendarMode: Dispatch<SetStateAction<"month" | "week" | "day">>;
  catalogDegreeOptions: CatalogDegreeOption[];
  catalogDegree: string;
  setCatalogDegree: (id: string) => void;
  setCatalogDegreeSearchQuery: (q: string) => void;
  setIsCatalogDegreeOptionsOpen: (open: boolean) => void;
  setCatalogError: (msg: string | null) => void;
  isCatalogPickerOpen: boolean;
  onboardingActive: boolean;
  markDegreeRoadmapStale: () => void;
  setOnboardingRoadmapLoaded: Dispatch<SetStateAction<boolean>>;
}) {
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const [catalogResults, setCatalogResults] = useState<CatalogSearchCourse[]>([]);
  const [catalogFreshness, setCatalogFreshness] = useState<{ lastCompletedAt: string | null; fetchedCount: number } | null>(null);
  const [catalogImportingId, setCatalogImportingId] = useState<string | null>(null);
  const [catalogDegreeImporting, setCatalogDegreeImporting] = useState(false);
  const [catalogViewMode, setCatalogViewMode] = useState<"search" | "roadmap">("search");
  const degreeLoadRequestSeqRef = useRef(0);

  const readDegreeRoadmapCache = useCallback(
    (degreeId: string): CatalogSearchCourse[] | null => {
      if (typeof window === "undefined") return null;
      if (!userId) return null;
      try {
        const raw = window.localStorage.getItem(DEGREE_ROADMAP_CACHE_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Record<string, Record<string, { courses?: CatalogSearchCourse[] }>>;
        const userBucket = parsed?.[userId];
        const entry = userBucket?.[degreeId];
        if (!entry?.courses || !Array.isArray(entry.courses) || entry.courses.length === 0) return null;
        return entry.courses;
      } catch {
        return null;
      }
    },
    [userId]
  );

  const writeDegreeRoadmapCache = useCallback(
    (degreeId: string, roadmapCourses: CatalogSearchCourse[]) => {
      if (typeof window === "undefined") return;
      if (!userId) return;
      try {
        const raw = window.localStorage.getItem(DEGREE_ROADMAP_CACHE_STORAGE_KEY);
        const parsed = raw
          ? (JSON.parse(raw) as Record<string, Record<string, { courses: CatalogSearchCourse[]; savedAt: string }>>)
          : {};
        const next = {
          ...parsed,
          [userId]: {
            ...(parsed[userId] ?? {}),
            [degreeId]: {
              courses: roadmapCourses,
              savedAt: new Date().toISOString()
            }
          }
        };
        window.localStorage.setItem(DEGREE_ROADMAP_CACHE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Best effort cache only.
      }
    },
    [userId]
  );

  const runCatalogSearch = useCallback(async (query: string) => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const url = `/api/catalog/search?q=${encodeURIComponent(query)}&limit=20`;
      const res = await fetch(url, { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? "Failed to search catalog");
      }
      setCatalogViewMode("search");
      setCatalogResults(payload.courses ?? []);
      setCatalogFreshness(payload.freshness ?? null);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Failed to search catalog");
      setCatalogResults([]);
    } finally {
      setCatalogLoading(false);
    }
  }, [setCatalogError]);

  useEffect(() => {
    if (!isCatalogPickerOpen) return;
    const trimmed = catalogQuery.trim();
    if (!trimmed) return;
    const handle = window.setTimeout(() => {
      void runCatalogSearch(trimmed);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [catalogQuery, isCatalogPickerOpen, runCatalogSearch]);

  const refreshCatalog = useCallback(async () => {
    setCatalogRefreshing(true);
    setCatalogError(null);
    try {
      const headers = await getAuthHeader();
      const res = await fetch("/api/catalog/refresh", {
        method: "POST",
        headers
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? "Catalog refresh failed");
      }
      const trimmed = catalogQuery.trim();
      if (!(catalogViewMode === "roadmap" && !trimmed)) {
        await runCatalogSearch(trimmed);
      }
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Catalog refresh failed");
    } finally {
      setCatalogRefreshing(false);
    }
  }, [catalogQuery, catalogViewMode, getAuthHeader, runCatalogSearch, setCatalogError]);

  const importCatalogCourse = useCallback(
    async (course: CatalogSearchCourse) => {
      const alreadyLocal = courses.some(
        (item) => item.source === course.source && item.externalCourseId === course.externalId
      );
      if (alreadyLocal) {
        setCatalogError("Course already exists in your courses.");
        return;
      }
      setCatalogImportingId(course.externalId);
      setCatalogError(null);
      try {
        const headers = {
          "Content-Type": "application/json",
          ...(await getAuthHeader())
        };
        const res = await fetch("/api/catalog/import", {
          method: "POST",
          headers,
          body: JSON.stringify({ source: course.source, externalId: course.externalId })
        });
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload.error ?? "Import failed");
        }
        const imported = payload.course as CatalogSearchCourse & { updatedAt?: string };
        const meetings = (payload.meetings ?? []) as CatalogSearchMeeting[];
        const meetingChoices = (payload.meetingChoices ?? []) as ImportedMeetingChoiceSet[];
        const mappedMeetings: CourseMeeting[] = meetings
          .filter((m) => m.weekday && m.start_time && m.end_time)
          .map((m) => ({
            day: m.weekday,
            start: m.start_time,
            end: m.end_time,
            title: m.meeting_type ?? "Lecture",
            location: m.location ?? undefined,
            type: inferMeetingKindFromCatalogType(m.meeting_type),
            recurrence: { cadence: "weekly" as const, interval: 1, daysOfWeek: [m.weekday] }
          }));

        const normalizedImportedTitle = (imported.nameHe || imported.nameEn || imported.courseNumber)
          .replace(/^Syllabus\s*-\s*/i, "")
          .replace(/\s+/g, " ")
          .trim();
        const dedupedImportedTitle = dedupeLabelSegments(normalizedImportedTitle);

        const newCourseId = createId("course");
        const selectedColor = pickDistinctCourseColor(courses.map((item) => item.color));
        addCourse({
          id: newCourseId,
          name: dedupedImportedTitle,
          code: imported.courseNumber,
          source: imported.source,
          externalCourseId: imported.externalId,
          catalogLastSyncedAt: imported.updatedAt ?? new Date().toISOString(),
          color: selectedColor,
          progressMode: "manual",
          meetings: mappedMeetings
        });
        setFreshlyAddedCourseId(newCourseId);
        setVisibleCourseIds((current) => (current.includes(newCourseId) ? current : [...current, newCourseId]));
        let openedSessionPicker = false;
        if (meetingChoices.length > 0) {
          const mappedChoiceSets = meetingChoices
            .filter((set) => (set.options ?? []).length > 1)
            .map((set) => ({
              setId: set.setId,
              label: set.label,
              options: set.options.map((option) => ({
                optionId: option.optionId,
                label: option.label,
                meetings: (option.meetings ?? [])
                  .filter((m) => m.weekday && m.start_time && m.end_time)
                  .map((m) => ({
                    id: createId("meeting"),
                    day: m.weekday,
                    start: m.start_time,
                    end: m.end_time,
                    title: m.meeting_type ?? set.label,
                    location: m.location ?? undefined,
                    type: inferMeetingKindFromCatalogType(m.meeting_type),
                    recurrence: { cadence: "weekly" as const, interval: 1, daysOfWeek: [m.weekday] }
                  }))
              }))
            }))
            .filter((set) => set.options.some((option) => option.meetings.length > 0))
            .sort((a, b) => getImportedChoiceSetPriority(a.label) - getImportedChoiceSetPriority(b.label));
          if (mappedChoiceSets.length > 0) {
            openedSessionPicker = true;
            setPendingSessionChoiceFlow({
              courseId: newCourseId,
              courseName: dedupedImportedTitle,
              courseColor: selectedColor,
              activeSetIndex: 0,
              sets: mappedChoiceSets
            });
            dispatch({ type: "set-view", payload: "calendar" });
            setCalendarMode("week");
            if (
              shouldOfferPanoptoFolderPastePrompt({
                code: imported.courseNumber,
                name: dedupedImportedTitle,
                panoptoFolderUrl: undefined
              })
            ) {
              pendingPanoptoAfterSessionChoiceRef.current = { courseId: newCourseId, courseName: dedupedImportedTitle };
            }
          }
        }
        if (!openedSessionPicker) {
          schedulePanoptoFolderPrompt(newCourseId, dedupedImportedTitle, imported.courseNumber);
        }
        setIsCatalogPickerOpen(false);
        setIsSettingsOpen(false);
        setCatalogQuery("");
        setIsCourseActionsOpen(false);
      } catch (error) {
        setCatalogError(error instanceof Error ? error.message : "Import failed");
      } finally {
        setCatalogImportingId(null);
      }
    },
    [
      addCourse,
      courses,
      dispatch,
      getAuthHeader,
      pendingPanoptoAfterSessionChoiceRef,
      schedulePanoptoFolderPrompt,
      setCatalogError,
      setCalendarMode,
      setFreshlyAddedCourseId,
      setIsCatalogPickerOpen,
      setIsCourseActionsOpen,
      setIsSettingsOpen,
      setPendingSessionChoiceFlow,
      setVisibleCourseIds
    ]
  );

  const loadDegreeRoadmapCourses = useCallback(
    async (degreeId: string, showToast = true, openCatalogPicker = true): Promise<boolean> => {
      const requestSeq = degreeLoadRequestSeqRef.current + 1;
      degreeLoadRequestSeqRef.current = requestSeq;
      setCatalogDegreeImporting(true);
      setCatalogError(null);
      const cachedCourses = !showToast ? readDegreeRoadmapCache(degreeId) : null;
      if (cachedCourses && degreeLoadRequestSeqRef.current === requestSeq) {
        setCatalogViewMode("roadmap");
        setCatalogResults(cachedCourses);
        setCatalogQuery("");
        if (openCatalogPicker) {
          setIsCatalogPickerOpen(true);
        }
        setIsCourseActionsOpen(false);
        setCatalogDegreeImporting(false);
        return true;
      }
      setCatalogResults([]);
      try {
        const headers = {
          "Content-Type": "application/json",
          ...(await getAuthHeader())
        };
        const res = await fetch("/api/catalog/import-degree", {
          method: "POST",
          headers,
          body: JSON.stringify({
            degreeId,
            roadmapCode: catalogDegreeOptions.find((degree) => degree.id === degreeId)?.roadmapCode ?? degreeId
          })
        });
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload.error ?? "Degree import failed");
        }
        if (degreeLoadRequestSeqRef.current !== requestSeq) {
          return false;
        }
        const roadmapCourses = (payload.courses ?? []) as Array<CatalogSearchCourse & { updatedAt?: string }>;
        const roadmapCode = typeof payload.roadmapCode === "string" ? payload.roadmapCode : null;
        writeDegreeRoadmapCache(degreeId, roadmapCourses);
        setCatalogViewMode("roadmap");
        setCatalogResults(roadmapCourses);
        setCatalogQuery("");
        if (openCatalogPicker) {
          setIsCatalogPickerOpen(true);
        }
        setIsCourseActionsOpen(false);
        if (showToast) {
          pushSchoolOsToast({
            kind: "success",
            message:
              roadmapCourses.length > 0
                ? `Loaded ${roadmapCourses.length} roadmap courses${roadmapCode ? ` (${roadmapCode})` : ""}. Use Add course to pick this semester.`
                : "No roadmap courses found for this degree."
          });
        }
        return true;
      } catch (error) {
        if (degreeLoadRequestSeqRef.current !== requestSeq) {
          return false;
        }
        setCatalogError(error instanceof Error ? error.message : "Degree import failed");
        return false;
      } finally {
        if (degreeLoadRequestSeqRef.current === requestSeq) {
          setCatalogDegreeImporting(false);
        }
      }
    },
    [
      catalogDegreeOptions,
      getAuthHeader,
      readDegreeRoadmapCache,
      setCatalogError,
      setIsCatalogPickerOpen,
      setIsCourseActionsOpen,
      writeDegreeRoadmapCache
    ]
  );

  const importFullDegreePlan = useCallback(async () => {
    const loaded = await loadDegreeRoadmapCourses(catalogDegree, true, !onboardingActive);
    if (!loaded) return;
    if (onboardingActive) {
      setOnboardingRoadmapLoaded(true);
      pushSchoolOsToast({
        kind: "success",
        message: "Roadmap loaded. Press the right arrow to continue."
      });
      return;
    }
    dispatch({ type: "set-view", payload: "courses" });
    setIsSettingsOpen(false);
  }, [
    catalogDegree,
    dispatch,
    loadDegreeRoadmapCourses,
    onboardingActive,
    setIsSettingsOpen,
    setOnboardingRoadmapLoaded
  ]);

  const selectCatalogDegreeOption = useCallback(
    (degree: CatalogDegreeOption) => {
      setCatalogDegree(degree.id);
      setCatalogDegreeSearchQuery(degree.label);
      setIsCatalogDegreeOptionsOpen(false);
      setCatalogQuery("");
      if (onboardingActive) {
        markDegreeRoadmapStale();
      }
    },
    [
      markDegreeRoadmapStale,
      onboardingActive,
      setCatalogDegree,
      setCatalogDegreeSearchQuery,
      setIsCatalogDegreeOptionsOpen
    ]
  );

  useEffect(() => {
    if (!isCatalogPickerOpen) return;
    if (catalogQuery.trim().length > 0) return;
    void loadDegreeRoadmapCourses(catalogDegree, false);
  }, [catalogDegree, catalogQuery, isCatalogPickerOpen, loadDegreeRoadmapCourses]);

  const groupedRoadmapCourses = useMemo((): CatalogRoadmapGroup[] => {
    if (catalogViewMode !== "roadmap") return [];
    const groups = new Map<string, CatalogSearchCourse[]>();
    for (const course of catalogResults) {
      const year = (course.roadmapYearLabel ?? "").trim() || "Other roadmap courses";
      const section = (course.roadmapSectionLabel ?? "").trim();
      const key = section ? `${year} · ${section}` : year;
      const list = groups.get(key) ?? [];
      list.push(course);
      groups.set(key, list);
    }
    const ordered = [...groups.entries()]
      .map(([label, grouped]) => ({
        label,
        courses: [...grouped].sort((a, b) => a.courseNumber.localeCompare(b.courseNumber))
      }))
      .sort((a, b) => {
        const aYear = Number((a.label.match(/Year\s+(\d+)/i) ?? [])[1] ?? Number.POSITIVE_INFINITY);
        const bYear = Number((b.label.match(/Year\s+(\d+)/i) ?? [])[1] ?? Number.POSITIVE_INFINITY);
        if (aYear !== bYear) return aYear - bYear;
        return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
      });
    return ordered;
  }, [catalogResults, catalogViewMode]);

  return {
    catalogQuery,
    setCatalogQuery,
    catalogLoading,
    catalogRefreshing,
    catalogResults,
    catalogFreshness,
    catalogImportingId,
    catalogDegreeImporting,
    catalogViewMode,
    setCatalogViewMode,
    runCatalogSearch,
    refreshCatalog,
    importCatalogCourse,
    loadDegreeRoadmapCourses,
    importFullDegreePlan,
    selectCatalogDegreeOption,
    groupedRoadmapCourses
  };
}
