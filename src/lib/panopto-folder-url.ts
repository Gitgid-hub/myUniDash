import type { Course } from "@/lib/types";

/**
 * Built-in Panopto folder URLs keyed by calendar `course.code` (trimmed).
 * Used when `course.panoptoFolderUrl` is unset — extend or replace with per-course URLs in settings later.
 */
const BUILTIN_PANOPTO_FOLDER_BY_COURSE_CODE: Record<string, string> = {
  // HUJI Panopto — Research Methods for Cognitive Sciences (test / default for 6177).
  "6177":
    "https://huji.cloud.panopto.eu/Panopto/Pages/Sessions/List.aspx#folderID=%2200af158c-48c7-4eaf-b9b5-b30d00bc611a%22"
};

/** Panopto course folder URL for recording catch-up tasks, if known. */
export function resolvePanoptoFolderUrl(course: Course): string | undefined {
  const direct = course.panoptoFolderUrl?.trim();
  if (direct) return direct;
  const trimmedCode = course.code.trim();
  const exact = BUILTIN_PANOPTO_FOLDER_BY_COURSE_CODE[trimmedCode];
  if (exact) return exact;
  const haystack = `${course.code} ${course.name}`;
  for (const [codeKey, url] of Object.entries(BUILTIN_PANOPTO_FOLDER_BY_COURSE_CODE)) {
    if (new RegExp(`\\b${codeKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystack)) {
      return url;
    }
  }
  return undefined;
}
