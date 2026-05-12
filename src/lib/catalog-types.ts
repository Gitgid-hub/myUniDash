import type { WeekDay } from "@/lib/types";

export type CatalogDegreeOption = {
  id: string;
  roadmapCode: string;
  label: string;
};

export const DEFAULT_CATALOG_DEGREES: CatalogDegreeOption[] = [];

export interface CatalogSearchMeeting {
  weekday: WeekDay;
  start_time: string;
  end_time: string;
  meeting_type?: string | null;
  location?: string | null;
  semester?: string | null;
}

export interface CatalogSearchCourse {
  source: string;
  externalId: string;
  courseNumber: string;
  title?: string;
  nameHe?: string | null;
  nameEn?: string | null;
  faculty?: string | null;
  department?: string | null;
  credits?: number | null;
  lastSeenAt?: string | null;
  roadmapYearLabel?: string;
  roadmapSectionLabel?: string;
  meetings: CatalogSearchMeeting[];
}

/** Cached HUJI degree roadmap from catalog import (persists in `SchoolState`). */
export interface SavedDegreeRoadmap {
  degreeId: string;
  roadmapCode: string;
  label: string;
  loadedAt: string;
  courses: CatalogSearchCourse[];
}
