import type { Course } from "@/lib/types";

/**
 * Built-in Panopto folder URLs keyed by calendar `course.code` (trimmed).
 * Used when `course.panoptoFolderUrl` is unset.
 *
 * Panopto does not expose a stable public “course code → folder” API we can call from the browser, so
 * unknown codes need either a row here or `course.panoptoFolderUrl` from Edit course (paste the Sessions list URL once).
 */
const BUILTIN_PANOPTO_FOLDER_BY_COURSE_CODE: Record<string, string> = {
  "6170":
    "https://huji.cloud.panopto.eu/Panopto/Pages/Sessions/List.aspx#folderID=%2242c10f38-5c91-4060-88a7-b30d00fb9108%22",
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

/**
 * Offer the “paste Panopto folder URL” step after adding a course when we still cannot resolve a folder
 * (no saved URL and no built-in match for this code/name).
 */
export function shouldOfferPanoptoFolderPastePrompt(course: Pick<Course, "code" | "name" | "panoptoFolderUrl">): boolean {
  if (course.panoptoFolderUrl?.trim()) return false;
  return resolvePanoptoFolderUrl(course as Course) === undefined;
}
