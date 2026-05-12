"use client";

import { Search, X } from "lucide-react";
import type { CatalogDegreeOption, CatalogSearchCourse } from "@/lib/catalog-types";
import { Button, Panel } from "@/components/ui";

export type CatalogRoadmapGroup = { label: string; courses: CatalogSearchCourse[] };

export function CatalogImportModal({
  open,
  onboardingCatalogLocked,
  catalogDegreeSearchQuery,
  onCatalogDegreeSearchQueryChange,
  isCatalogDegreeOptionsOpen,
  onCatalogDegreeOptionsOpen,
  onCatalogDegreeOptionsCloseEscape,
  catalogDegreeOptions,
  catalogDegree,
  onSelectCatalogDegree,
  catalogQuery,
  onCatalogQueryChange,
  onRefreshCatalog,
  catalogRefreshing,
  selectedCatalogDegreeLabel,
  catalogDegreeIdDisplay,
  catalogFreshness,
  catalogError,
  catalogLoading,
  catalogViewMode,
  catalogResults,
  groupedRoadmapCourses,
  catalogImportingId,
  onImportCatalogCourse,
  onClose
}: {
  open: boolean;
  onboardingCatalogLocked: boolean;
  catalogDegreeSearchQuery: string;
  onCatalogDegreeSearchQueryChange: (value: string) => void;
  isCatalogDegreeOptionsOpen: boolean;
  onCatalogDegreeOptionsOpen: () => void;
  onCatalogDegreeOptionsCloseEscape: () => void;
  catalogDegreeOptions: CatalogDegreeOption[];
  catalogDegree: string;
  onSelectCatalogDegree: (degree: CatalogDegreeOption) => void;
  catalogQuery: string;
  onCatalogQueryChange: (value: string) => void;
  onRefreshCatalog: () => void;
  catalogRefreshing: boolean;
  selectedCatalogDegreeLabel: string | undefined;
  catalogDegreeIdDisplay: string;
  catalogFreshness: { lastCompletedAt: string | null; fetchedCount: number } | null;
  catalogError: string | null;
  catalogLoading: boolean;
  catalogViewMode: "search" | "roadmap";
  catalogResults: CatalogSearchCourse[];
  groupedRoadmapCourses: CatalogRoadmapGroup[];
  catalogImportingId: string | null;
  onImportCatalogCourse: (course: CatalogSearchCourse) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <Panel
        data-onboarding="catalog-import-panel"
        className={`w-full max-w-3xl bg-white/95 p-5 dark:bg-[#101317]/95 ${
          onboardingCatalogLocked ? "pointer-events-none select-none" : ""
        }`}
        aria-disabled={onboardingCatalogLocked}
      >
        {onboardingCatalogLocked ? (
          <div className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] bg-slate-300/38 backdrop-brightness-75 dark:bg-slate-900/42" />
        ) : null}
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">HUJI Catalog Import</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Search by course number or name, or load your degree roadmap and quick-add selected courses.
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={onClose}
            className="h-10 w-10 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[280px_minmax(0,1fr)_auto] md:items-end">
          <div className="min-w-0">
            <label className="mb-1 block px-1 text-xs font-medium text-slate-600 dark:text-slate-300">Degree</label>
            <input
              value={catalogDegreeSearchQuery}
              onChange={(event) => {
                onCatalogDegreeSearchQueryChange(event.target.value);
                onCatalogDegreeOptionsOpen();
              }}
              onFocus={() => onCatalogDegreeOptionsOpen()}
              onKeyDown={(event) => {
                if (event.key === "Escape") onCatalogDegreeOptionsCloseEscape();
              }}
              placeholder="Search degree..."
              data-onboarding="degree-select"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04]"
            />
            {isCatalogDegreeOptionsOpen && catalogDegreeSearchQuery.trim().length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white/90 p-1 dark:border-white/10 dark:bg-white/[0.03]">
                {catalogDegreeOptions.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-slate-500 dark:text-slate-400">No matching degrees found.</p>
                ) : (
                  catalogDegreeOptions.map((degree) => (
                    <button
                      key={degree.id}
                      type="button"
                      onClick={() => onSelectCatalogDegree(degree)}
                      className={`w-full rounded-lg px-2 py-1.5 text-left text-xs transition ${
                        catalogDegree === degree.id
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                          : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.08]"
                      }`}
                    >
                      {degree.label}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={catalogQuery}
              onChange={(event) => onCatalogQueryChange(event.target.value)}
              placeholder="Search HUJI course number or name..."
              className="h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04]"
            />
          </div>
          <Button variant="outline" className="h-[42px] px-4 md:self-end" onClick={onRefreshCatalog} disabled={catalogRefreshing}>
            {catalogRefreshing ? "Refreshing..." : "Refresh catalog"}
          </Button>
        </div>

        <div className="mb-3 rounded-lg border border-slate-200/70 bg-slate-50/60 px-3 py-2 text-xs text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
          {`Degree catalog: ${selectedCatalogDegreeLabel ?? catalogDegreeIdDisplay}.` +
            " " +
            (catalogFreshness?.lastCompletedAt
              ? `Catalog updated ${new Date(catalogFreshness.lastCompletedAt).toLocaleString()} (${catalogFreshness.fetchedCount} courses).`
              : "Catalog not synced yet. Use refresh catalog to ingest latest data.")}
        </div>

        {catalogError && (
          <div className="mb-3 rounded-xl border border-rose-200/70 bg-rose-50/80 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            {catalogError}
          </div>
        )}

        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {catalogLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Searching catalog...</p>
          ) : catalogResults.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No courses found for your query.</p>
          ) : catalogViewMode === "roadmap" ? (
            groupedRoadmapCourses.map((group) => (
              <details key={group.label} open className="rounded-2xl border border-slate-200/70 bg-white/40 p-2 dark:border-white/10 dark:bg-white/[0.02]">
                <summary className="cursor-pointer list-none rounded-xl px-2 py-1.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-100/70 dark:text-slate-100 dark:hover:bg-white/[0.05]">
                  {group.label} ({group.courses.length})
                </summary>
                <div className="mt-2 space-y-2">
                  {group.courses.map((course) => (
                    <div key={`${course.source}:${course.externalId}`} className="rounded-2xl border border-slate-200/70 px-3 py-3 dark:border-white/10">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {course.courseNumber} · {course.nameHe || course.nameEn || course.title || "Unnamed course"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {course.faculty || "HUJI"} · {course.department || "Life Sciences"} · {course.meetings.length} meetings
                          </p>
                          {course.meetings.length > 0 && (
                            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                              {course.meetings
                                .slice(0, 3)
                                .map((m) => `${m.weekday} ${m.start_time}-${m.end_time}`)
                                .join(" | ")}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          className="shrink-0"
                          onClick={() => onImportCatalogCourse(course)}
                          disabled={catalogImportingId === course.externalId}
                        >
                          {catalogImportingId === course.externalId ? "Importing..." : "Add course"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))
          ) : (
            catalogResults.map((course) => (
              <div key={`${course.source}:${course.externalId}`} className="rounded-2xl border border-slate-200/70 px-3 py-3 dark:border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {course.courseNumber} · {course.nameHe || course.nameEn || "Unnamed course"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {course.faculty || "HUJI"} · {course.department || "Life Sciences"} · {course.meetings.length} meetings
                    </p>
                    {course.meetings.length > 0 && (
                      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                        {course.meetings
                          .slice(0, 3)
                          .map((m) => `${m.weekday} ${m.start_time}-${m.end_time}`)
                          .join(" | ")}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    className="shrink-0"
                    onClick={() => onImportCatalogCourse(course)}
                    disabled={catalogImportingId === course.externalId}
                  >
                    {catalogImportingId === course.externalId ? "Importing..." : "Add course"}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}
