"use client";

import { Check } from "lucide-react";
import type { CatalogSearchCourse } from "@/lib/catalog-types";
import { Button, Panel } from "@/components/ui";

function courseLabel(course: CatalogSearchCourse): string {
  const name = course.nameHe || course.nameEn || course.title || "Course";
  return `${course.courseNumber} · ${name}`;
}

export function CatalogBookingRail({
  pendingCourses,
  bookedCourses,
  busyExternalId,
  onBook,
  onDone,
  isOwned
}: {
  pendingCourses: CatalogSearchCourse[];
  bookedCourses: CatalogSearchCourse[];
  busyExternalId: string | null;
  onBook: (course: CatalogSearchCourse) => void;
  onDone: () => void;
  isOwned: (course: CatalogSearchCourse) => boolean;
}) {
  const showDone = pendingCourses.length === 0 && bookedCourses.length > 0;

  return (
    <Panel
      className="flex w-[min(100%,20rem)] shrink-0 flex-col overflow-hidden border-slate-200/80 bg-white/90 dark:border-white/10 dark:bg-[#101317]/95"
      aria-label="Book courses from catalog"
    >
      <div className="shrink-0 border-b border-slate-200/70 px-3 py-2.5 dark:border-white/10">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Book from catalog</h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Your week updates as each course is added. Booked courses stay here until you tap Done.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2">
        {pendingCourses.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">To book</p>
            <ul className="space-y-2">
              {pendingCourses.map((course) => {
                const owned = isOwned(course);
                const anyBusy = busyExternalId !== null;
                const thisBusy = busyExternalId === course.externalId;
                return (
                  <li
                    key={`${course.source}:${course.externalId}`}
                    className="rounded-xl border border-slate-200/80 bg-white/80 px-2.5 py-2 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-xs font-medium leading-snug text-slate-800 dark:text-slate-100">
                        {courseLabel(course)}
                      </p>
                      <Button
                        type="button"
                        variant="primary"
                        className="h-7 shrink-0 px-2.5 text-[11px]"
                        disabled={owned || anyBusy}
                        title={owned ? "Already in your courses" : undefined}
                        onClick={() => onBook(course)}
                      >
                        {thisBusy ? "Booking…" : owned ? "Added" : "Book"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {bookedCourses.length > 0 ? (
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-600/90 dark:text-emerald-400/90">
              Booked
            </p>
            <ul className="space-y-2">
              {bookedCourses.map((course) => (
                <li
                  key={`booked:${course.source}:${course.externalId}`}
                  className="rounded-xl border border-emerald-500/35 bg-emerald-500/[0.08] px-2.5 py-2 shadow-[0_0_18px_-4px_rgba(16,185,129,0.45)] dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:shadow-[0_0_22px_-4px_rgba(52,211,153,0.35)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 text-xs font-medium leading-snug text-emerald-950 dark:text-emerald-50">
                      {courseLabel(course)}
                    </p>
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-600/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-100">
                      <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                      Booked
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {showDone ? (
        <div className="shrink-0 border-t border-slate-200/70 p-3 dark:border-white/10">
          <Button type="button" variant="outline" className="w-full justify-center text-sm" onClick={onDone}>
            Done
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}
