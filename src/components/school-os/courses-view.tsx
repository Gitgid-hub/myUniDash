"use client";

import { Archive, ArchiveRestore, Plus, Trash2, Video } from "lucide-react";
import type { Course } from "@/lib/types";
import { Badge, Button, Panel } from "@/components/ui";

export type CourseListMode = "all" | "imported" | "manual" | "archived";

export function CoursesView({
  activeCoursesCount,
  importedCoursesCount,
  manualCoursesCount,
  archivedCourses,
  visibleCoursesInSidebar,
  courseListMode,
  onCourseListModeChange,
  selectedCourseId,
  onOpenCourseEditor,
  isCourseActionsOpen,
  onToggleCourseActions,
  onOpenAddManual,
  onOpenCatalogImport,
  onOpenPanoptoForCourse,
  onUnarchiveCourse,
  onRequestArchiveCourse,
  onRequestDeleteCourse
}: {
  activeCoursesCount: number;
  importedCoursesCount: number;
  manualCoursesCount: number;
  archivedCourses: Course[];
  visibleCoursesInSidebar: Course[];
  courseListMode: CourseListMode;
  onCourseListModeChange: (mode: CourseListMode) => void;
  selectedCourseId: string;
  onOpenCourseEditor: (courseId: string) => void;
  isCourseActionsOpen: boolean;
  onToggleCourseActions: () => void;
  onOpenAddManual: () => void;
  onOpenCatalogImport: () => void;
  onOpenPanoptoForCourse: (courseId: string) => void;
  onUnarchiveCourse: (courseId: string) => void;
  onRequestArchiveCourse: (course: Course) => void;
  onRequestDeleteCourse: (course: Course) => void;
}) {
  return (
    <Panel className="bg-white/90 dark:bg-[#101317]/90">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight">Courses</h3>
        <div className="relative flex items-center gap-2">
          <Badge>{activeCoursesCount} active</Badge>
          <Button
            variant="outline"
            onClick={onToggleCourseActions}
            className="h-8 px-3 text-xs"
            data-onboarding="courses-add-button"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add
          </Button>
          {isCourseActionsOpen && (
            <div className="absolute right-0 top-9 z-20 w-40 rounded-xl border border-slate-200/80 bg-white/95 p-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[#0f1217]/95">
              <button
                type="button"
                onClick={onOpenAddManual}
                className="w-full rounded-lg px-2.5 py-2 text-left text-xs text-slate-600 transition hover:bg-slate-100/80 dark:text-slate-300 dark:hover:bg-white/[0.06]"
              >
                Add manually
              </button>
              <button
                type="button"
                onClick={onOpenCatalogImport}
                className="w-full rounded-lg px-2.5 py-2 text-left text-xs text-slate-600 transition hover:bg-slate-100/80 dark:text-slate-300 dark:hover:bg-white/[0.06]"
              >
                Import from HUJI
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onCourseListModeChange("all")}
          className={`rounded-full border px-2.5 py-1 text-left transition ${courseListMode === "all" ? "border-slate-300 bg-slate-100 text-slate-900 dark:border-white/20 dark:bg-white/10 dark:text-white" : "border-slate-200/70 text-slate-500 hover:bg-slate-100/70 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/[0.04]"}`}
        >
          <p className="text-[11px] font-medium">All <span className="opacity-80">{activeCoursesCount}</span></p>
        </button>
        <button
          type="button"
          onClick={() => onCourseListModeChange("imported")}
          className={`rounded-full border px-2.5 py-1 text-left transition ${courseListMode === "imported" ? "border-slate-300 bg-slate-100 text-slate-900 dark:border-white/20 dark:bg-white/10 dark:text-white" : "border-slate-200/70 text-slate-500 hover:bg-slate-100/70 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/[0.04]"}`}
        >
          <p className="text-[11px] font-medium">Imported <span className="opacity-80">{importedCoursesCount}</span></p>
        </button>
        <button
          type="button"
          onClick={() => onCourseListModeChange("manual")}
          className={`rounded-full border px-2.5 py-1 text-left transition ${courseListMode === "manual" ? "border-slate-300 bg-slate-100 text-slate-900 dark:border-white/20 dark:bg-white/10 dark:text-white" : "border-slate-200/70 text-slate-500 hover:bg-slate-100/70 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/[0.04]"}`}
        >
          <p className="text-[11px] font-medium">Manual <span className="opacity-80">{manualCoursesCount}</span></p>
        </button>
        <button
          type="button"
          onClick={() => onCourseListModeChange("archived")}
          className={`rounded-full border px-2.5 py-1 text-left transition ${courseListMode === "archived" ? "border-slate-300 bg-slate-100 text-slate-900 dark:border-white/20 dark:bg-white/10 dark:text-white" : "border-slate-200/70 text-slate-500 hover:bg-slate-100/70 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/[0.04]"}`}
        >
          <p className="text-[11px] font-medium">Archived <span className="opacity-80">{archivedCourses.length}</span></p>
        </button>
      </div>
      <div className="max-h-[68vh] space-y-1.5 overflow-auto pr-1">
        {visibleCoursesInSidebar.map((course) => {
          const isActive = selectedCourseId === course.id;
          return (
            <div
              key={course.id}
              className={`group flex items-center gap-2 rounded-xl border px-2 py-1 transition ${
                isActive
                  ? "border-slate-300/80 bg-transparent dark:border-white/20"
                  : "border-transparent hover:bg-slate-100/70 dark:hover:bg-white/[0.04]"
              }`}
            >
              <button
                onClick={() => onOpenCourseEditor(course.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: course.color }} />
                <div className="min-w-0">
                  <p dir="auto" className="truncate text-sm font-medium text-start">
                    {course.code ? `${course.code} · ` : ""}{course.name}
                  </p>
                  <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                    {course.source ? "Imported from HUJI" : "Manual course"} · {course.meetings.length} meetings
                  </p>
                </div>
              </button>
              <div className={`flex items-center gap-1 transition ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                <button
                  type="button"
                  aria-label="Panopto recordings link"
                  title="Set Panopto folder URL (weekly catch-up uses this)"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenPanoptoForCourse(course.id);
                  }}
                  className="rounded-md p-1.5 text-slate-500 transition hover:bg-sky-100/80 hover:text-sky-700 dark:text-slate-400 dark:hover:bg-sky-500/15 dark:hover:text-sky-200"
                >
                  <Video className="h-3.5 w-3.5" />
                </button>
                {courseListMode === "archived" ? (
                  <button
                    type="button"
                    aria-label="Restore course to active"
                    title="Back to active courses — calendar sessions stay as they were"
                    onClick={() => onUnarchiveCourse(course.id)}
                    className="rounded-md p-1.5 text-emerald-600 transition hover:bg-emerald-100/70 dark:text-emerald-400 dark:hover:bg-emerald-500/15"
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label="Archive course"
                    onClick={() => onRequestArchiveCourse(course)}
                    className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-white/10"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Delete course"
                  onClick={() => onRequestDeleteCourse(course)}
                  className="rounded-md p-1.5 text-rose-500 transition hover:bg-rose-100/70 dark:text-rose-400 dark:hover:bg-rose-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
