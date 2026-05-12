"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { pickDistinctCourseColor } from "@/lib/color-utils";
import type {
  CatalogDegreeOption,
  CatalogSearchCourse,
  CatalogSearchMeeting,
  SavedDegreeRoadmap
} from "@/lib/catalog-types";
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
const CATALOG_BOOKING_QUEUE_STORAGE_KEY = "school-os:catalog-booking-queue:v1";

function catalogBookingQueueStorageKey(userId: string | undefined): string {
  return `${CATALOG_BOOKING_QUEUE_STORAGE_KEY}:${userId ?? "__anon__"}`;
}

function parseStoredBookingQueue(raw: string | null): CatalogSearchCourse[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: CatalogSearchCourse[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const source = typeof o.source === "string" ? o.source : "";
      const externalId = typeof o.externalId === "string" ? o.externalId : "";
      const courseNumber = typeof o.courseNumber === "string" ? o.courseNumber : "";
      if (!source || !externalId || !courseNumber) continue;
      const meetingsRaw = Array.isArray(o.meetings) ? o.meetings : [];
      const meetings: CatalogSearchCourse["meetings"] = [];
      for (const m of meetingsRaw) {
        if (!m || typeof m !== "object") continue;
        const mo = m as Record<string, unknown>;
        const weekday = mo.weekday;
        const start_time = typeof mo.start_time === "string" ? mo.start_time : "";
        const end_time = typeof mo.end_time === "string" ? mo.end_time : "";
        if (typeof weekday !== "string" || !start_time || !end_time) continue;
        meetings.push({
          weekday: weekday as CatalogSearchCourse["meetings"][number]["weekday"],
          start_time,
          end_time,
          meeting_type: typeof mo.meeting_type === "string" ? mo.meeting_type : null,
          location: typeof mo.location === "string" ? mo.location : null,
          semester: typeof mo.semester === "string" ? mo.semester : null
        });
      }
      out.push({
        source,
        externalId,
        courseNumber,
        title: typeof o.title === "string" ? o.title : undefined,
        nameHe: o.nameHe === null ? null : typeof o.nameHe === "string" ? o.nameHe : undefined,
        nameEn: o.nameEn === null ? null : typeof o.nameEn === "string" ? o.nameEn : undefined,
        faculty: o.faculty === null ? null : typeof o.faculty === "string" ? o.faculty : undefined,
        department: o.department === null ? null : typeof o.department === "string" ? o.department : undefined,
        credits: typeof o.credits === "number" && Number.isFinite(o.credits) ? o.credits : null,
        lastSeenAt: typeof o.lastSeenAt === "string" ? o.lastSeenAt : undefined,
        roadmapYearLabel: typeof o.roadmapYearLabel === "string" ? o.roadmapYearLabel : undefined,
        roadmapSectionLabel: typeof o.roadmapSectionLabel === "string" ? o.roadmapSectionLabel : undefined,
        meetings
      });
    }
    return out;
  } catch {
    return [];
  }
}

function catalogPickKey(course: Pick<CatalogSearchCourse, "source" | "externalId">): string {
  return `${course.source}:${course.externalId}`;
}

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
  isCatalogPickerOpen,
  onboardingActive,
  markDegreeRoadmapStale,
  setOnboardingRoadmapLoaded,
  savedDegreeRoadmaps
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
  isCatalogPickerOpen: boolean;
  onboardingActive: boolean;
  markDegreeRoadmapStale: () => void;
  setOnboardingRoadmapLoaded: Dispatch<SetStateAction<boolean>>;
  savedDegreeRoadmaps: SavedDegreeRoadmap[];
}) {
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogResults, setCatalogResults] = useState<CatalogSearchCourse[]>([]);
  const [catalogFreshness, setCatalogFreshness] = useState<{ lastCompletedAt: string | null; fetchedCount: number } | null>(null);
  const [catalogImportingId, setCatalogImportingId] = useState<string | null>(null);
  const [catalogDegreeImporting, setCatalogDegreeImporting] = useState(false);
  const [catalogViewMode, setCatalogViewMode] = useState<"search" | "roadmap">("search");
  const [catalogBookingQueue, setCatalogBookingQueue] = useState<CatalogSearchCourse[]>([]);
  const [catalogBookingFlowOpen, setCatalogBookingFlowOpen] = useState(false);
  const [catalogBookingSessionBooked, setCatalogBookingSessionBooked] = useState<CatalogSearchCourse[]>([]);
  const [catalogBookingBusyId, setCatalogBookingBusyId] = useState<string | null>(null);
  const degreeLoadRequestSeqRef = useRef(0);
  const skipBookingQueuePersistRef = useRef(true);

  useLayoutEffect(() => {
    skipBookingQueuePersistRef.current = true;
    if (typeof window === "undefined") return;
    const key = catalogBookingQueueStorageKey(userId);
    let next = parseStoredBookingQueue(window.localStorage.getItem(key));
    if (next.length === 0 && userId) {
      const anonKey = catalogBookingQueueStorageKey(undefined);
      const fromAnon = parseStoredBookingQueue(window.localStorage.getItem(anonKey));
      if (fromAnon.length > 0) {
        next = fromAnon;
        try {
          window.localStorage.removeItem(anonKey);
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
    }
    setCatalogBookingQueue(next);
  }, [userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = catalogBookingQueueStorageKey(userId);
    if (skipBookingQueuePersistRef.current) {
      skipBookingQueuePersistRef.current = false;
      return;
    }
    try {
      if (catalogBookingQueue.length === 0) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, JSON.stringify(catalogBookingQueue));
      }
    } catch {
      // ignore quota / private mode
    }
  }, [userId, catalogBookingQueue]);

  const persistRoadmapSnapshot = useCallback(
    (degreeId: string, courses: CatalogSearchCourse[], roadmapCodeFromApi: string | null) => {
      const opt = catalogDegreeOptions.find((d) => d.id === degreeId);
      const roadmapCode = roadmapCodeFromApi ?? opt?.roadmapCode ?? degreeId;
      const label = opt?.label ?? degreeId;
      dispatch({
        type: "upsert-saved-degree-roadmap",
        payload: {
          degreeId,
          roadmapCode,
          label,
          loadedAt: new Date().toISOString(),
          courses
        }
      });
    },
    [catalogDegreeOptions, dispatch]
  );

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

  const clearDegreeRoadmapCache = useCallback(
    (degreeId: string) => {
      if (typeof window === "undefined") return;
      if (!userId) return;
      try {
        const raw = window.localStorage.getItem(DEGREE_ROADMAP_CACHE_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
        const userBucket = { ...(parsed[userId] ?? {}) };
        delete userBucket[degreeId];
        const next = { ...parsed, [userId]: userBucket };
        window.localStorage.setItem(DEGREE_ROADMAP_CACHE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Best effort cache only.
      }
    },
    [userId]
  );

  const runCatalogSearch = useCallback(async (query: string) => {
    setCatalogLoading(true);
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
      const msg = error instanceof Error ? error.message : "Failed to search catalog";
      pushSchoolOsToast({ kind: "error", message: msg });
      setCatalogResults([]);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isCatalogPickerOpen) return;
    const trimmed = catalogQuery.trim();
    if (!trimmed) return;
    const handle = window.setTimeout(() => {
      void runCatalogSearch(trimmed);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [catalogQuery, isCatalogPickerOpen, runCatalogSearch]);

  const isCatalogCourseQueued = useCallback(
    (course: CatalogSearchCourse) =>
      catalogBookingQueue.some((c) => catalogPickKey(c) === catalogPickKey(course)),
    [catalogBookingQueue]
  );

  const toggleCatalogCourseForBooking = useCallback(
    (course: CatalogSearchCourse) => {
      const alreadyLocal = courses.some(
        (item) => item.source === course.source && item.externalCourseId === course.externalId
      );
      if (alreadyLocal) {
        pushSchoolOsToast({ kind: "error", message: "Course already exists in your courses." });
        return;
      }
      setCatalogBookingQueue((prev) => {
        const key = catalogPickKey(course);
        const idx = prev.findIndex((c) => catalogPickKey(c) === key);
        if (idx >= 0) {
          return prev.filter((_, i) => i !== idx);
        }
        return [...prev, course];
      });
    },
    [courses]
  );

  const beginBookCatalogCourses = useCallback(() => {
    if (catalogBookingQueue.length === 0) return;
    setCatalogBookingSessionBooked([]);
    setCatalogBookingFlowOpen(true);
    dispatch({ type: "set-view", payload: "calendar" });
    setCalendarMode("week");
    setIsCatalogPickerOpen(false);
    pushSchoolOsToast({
      kind: "success",
      message: "Week view opened — book each course from the list on the right."
    });
  }, [catalogBookingQueue.length, dispatch, setCalendarMode, setIsCatalogPickerOpen]);

  const isCatalogCourseOwned = useCallback(
    (course: CatalogSearchCourse) =>
      courses.some((c) => c.source === course.source && c.externalCourseId === course.externalId),
    [courses]
  );

  const importCatalogCourse = useCallback(
    async (course: CatalogSearchCourse): Promise<boolean> => {
      const alreadyLocal = courses.some(
        (item) => item.source === course.source && item.externalCourseId === course.externalId
      );
      if (alreadyLocal) {
        pushSchoolOsToast({ kind: "error", message: "Course already exists in your courses." });
        return false;
      }
      setCatalogImportingId(course.externalId);
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
        return true;
      } catch (error) {
        pushSchoolOsToast({
          kind: "error",
          message: error instanceof Error ? error.message : "Import failed"
        });
        return false;
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
      setCalendarMode,
      setFreshlyAddedCourseId,
      setIsCatalogPickerOpen,
      setIsCourseActionsOpen,
      setIsSettingsOpen,
      setPendingSessionChoiceFlow,
      setVisibleCourseIds
    ]
  );

  const dismissCatalogBookingFlow = useCallback(() => {
    setCatalogBookingFlowOpen(false);
    setCatalogBookingSessionBooked([]);
  }, []);

  const bookQueuedCatalogCourse = useCallback(
    async (course: CatalogSearchCourse) => {
      if (catalogBookingBusyId) return;
      setCatalogBookingBusyId(course.externalId);
      try {
        const ok = await importCatalogCourse(course);
        if (!ok) return;
        const key = catalogPickKey(course);
        setCatalogBookingQueue((prev) => prev.filter((c) => catalogPickKey(c) !== key));
        setCatalogBookingSessionBooked((prev) => [...prev, course]);
      } finally {
        setCatalogBookingBusyId(null);
      }
    },
    [catalogBookingBusyId, importCatalogCourse]
  );

  const loadDegreeRoadmapCourses = useCallback(
    async (degreeId: string, showToast = true, openCatalogPicker = true): Promise<boolean> => {
      const requestSeq = degreeLoadRequestSeqRef.current + 1;
      degreeLoadRequestSeqRef.current = requestSeq;
      setCatalogDegreeImporting(true);
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
        persistRoadmapSnapshot(degreeId, cachedCourses, null);
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
        persistRoadmapSnapshot(degreeId, roadmapCourses, roadmapCode);
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
                ? `Loaded ${roadmapCourses.length} roadmap courses${roadmapCode ? ` (${roadmapCode})` : ""}. Tap courses to queue them, then Book courses.`
                : "No roadmap courses found for this degree."
          });
        }
        return true;
      } catch (error) {
        if (degreeLoadRequestSeqRef.current !== requestSeq) {
          return false;
        }
        pushSchoolOsToast({
          kind: "error",
          message: error instanceof Error ? error.message : "Degree import failed"
        });
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
      setIsCatalogPickerOpen,
      setIsCourseActionsOpen,
      persistRoadmapSnapshot,
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
      setCatalogResults([]);
      setCatalogViewMode("search");
      if (onboardingActive) {
        markDegreeRoadmapStale();
      }
    },
    [
      markDegreeRoadmapStale,
      onboardingActive,
      setCatalogDegree,
      setCatalogDegreeSearchQuery,
      setIsCatalogDegreeOptionsOpen,
      setCatalogQuery,
      setCatalogResults,
      setCatalogViewMode
    ]
  );

  const loadSelectedDegreeRoadmap = useCallback(async () => {
    const id = catalogDegree?.trim();
    if (!id) {
      pushSchoolOsToast({ kind: "error", message: "Search and select a degree first." });
      return;
    }
    await loadDegreeRoadmapCourses(id, true, true);
  }, [catalogDegree, loadDegreeRoadmapCourses]);

  const selectSavedRoadmap = useCallback(
    (degreeId: string) => {
      const saved = savedDegreeRoadmaps.find((r) => r.degreeId === degreeId);
      if (!saved) return;
      const opt = catalogDegreeOptions.find((d) => d.id === degreeId);
      setCatalogDegree(degreeId);
      if (opt) {
        setCatalogDegreeSearchQuery(opt.label);
      }
      setIsCatalogDegreeOptionsOpen(false);
      setCatalogViewMode("roadmap");
      setCatalogResults(saved.courses);
      setCatalogQuery("");
    },
    [
      catalogDegreeOptions,
      savedDegreeRoadmaps,
      setCatalogDegree,
      setCatalogDegreeSearchQuery,
      setIsCatalogDegreeOptionsOpen,
      setCatalogViewMode,
      setCatalogResults,
      setCatalogQuery
    ]
  );

  const removeSavedRoadmap = useCallback(
    (degreeId: string): boolean => {
      const label = savedDegreeRoadmaps.find((r) => r.degreeId === degreeId)?.label ?? "this roadmap";
      if (
        !window.confirm(
          `Remove "${label}" from your saved roadmaps? You can load it again later from Settings.`
        )
      ) {
        return false;
      }
      const remaining = savedDegreeRoadmaps.filter((r) => r.degreeId !== degreeId);
      clearDegreeRoadmapCache(degreeId);
      dispatch({ type: "remove-saved-degree-roadmap", payload: degreeId });
      if (degreeId !== catalogDegree) {
        return true;
      }
      if (remaining.length > 0) {
        selectSavedRoadmap(remaining[0]!.degreeId);
      } else {
        setCatalogViewMode("roadmap");
        setCatalogResults([]);
      }
      return true;
    },
    [
      catalogDegree,
      clearDegreeRoadmapCache,
      dispatch,
      savedDegreeRoadmaps,
      selectSavedRoadmap
    ]
  );

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
    catalogResults,
    catalogFreshness,
    catalogImportingId,
    catalogDegreeImporting,
    catalogViewMode,
    setCatalogViewMode,
    runCatalogSearch,
    importCatalogCourse,
    catalogBookingQueue,
    toggleCatalogCourseForBooking,
    isCatalogCourseQueued,
    beginBookCatalogCourses,
    isCatalogCourseOwned,
    catalogBookingFlowOpen,
    catalogBookingSessionBooked,
    catalogBookingBusyId,
    bookQueuedCatalogCourse,
    dismissCatalogBookingFlow,
    loadDegreeRoadmapCourses,
    importFullDegreePlan,
    selectCatalogDegreeOption,
    loadSelectedDegreeRoadmap,
    selectSavedRoadmap,
    removeSavedRoadmap,
    groupedRoadmapCourses
  };
}
