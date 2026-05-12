"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, Trash2, X } from "lucide-react";
import type { CatalogDegreeOption, CatalogSearchCourse, SavedDegreeRoadmap } from "@/lib/catalog-types";
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
  onLoadRoadmap,
  catalogDegreeImporting,
  catalogQuery,
  onCatalogQueryChange,
  catalogLoading,
  catalogViewMode,
  catalogResults,
  groupedRoadmapCourses,
  savedDegreeRoadmaps,
  onSelectSavedRoadmap,
  onRemoveSavedRoadmap,
  catalogBookingQueueCount,
  onToggleCatalogCourseForBooking,
  onBookCourses,
  isCatalogCourseQueued,
  isCatalogCourseOwned,
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
  onLoadRoadmap: () => void;
  catalogDegreeImporting: boolean;
  catalogQuery: string;
  onCatalogQueryChange: (value: string) => void;
  catalogLoading: boolean;
  catalogViewMode: "search" | "roadmap";
  catalogResults: CatalogSearchCourse[];
  groupedRoadmapCourses: CatalogRoadmapGroup[];
  savedDegreeRoadmaps: SavedDegreeRoadmap[];
  onSelectSavedRoadmap: (degreeId: string) => void;
  onRemoveSavedRoadmap: (degreeId: string) => boolean;
  catalogBookingQueueCount: number;
  onToggleCatalogCourseForBooking: (course: CatalogSearchCourse) => void;
  onBookCourses: () => void;
  isCatalogCourseQueued: (course: CatalogSearchCourse) => boolean;
  isCatalogCourseOwned: (course: CatalogSearchCourse) => boolean;
  onClose: () => void;
}) {
  const [roadmapMenuOpen, setRoadmapMenuOpen] = useState(false);
  const roadmapMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setRoadmapMenuOpen(false);
  }, [open]);

  useEffect(() => {
    if (!roadmapMenuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRoadmapMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [roadmapMenuOpen]);

  useEffect(() => {
    if (!roadmapMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const el = roadmapMenuRef.current;
      if (el && !el.contains(event.target as Node)) {
        setRoadmapMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [roadmapMenuOpen]);

  if (!open) return null;

  const hasSavedRoadmapForDegree = savedDegreeRoadmaps.some((r) => r.degreeId === catalogDegree);
  const showRoadmapSwitcher = savedDegreeRoadmaps.length >= 2 && hasSavedRoadmapForDegree;
  const viewingSavedRoadmap = hasSavedRoadmapForDegree;
  const activeRoadmapLabel =
    savedDegreeRoadmaps.find((r) => r.degreeId === catalogDegree)?.label ?? "Roadmap";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-10 sm:py-14">
      <Panel
        data-onboarding="catalog-import-panel"
        className={`relative flex max-h-[min(85dvh,calc(100dvh-3.5rem))] w-full max-w-3xl flex-col bg-white/95 p-5 dark:bg-[#101317]/95 ${
          onboardingCatalogLocked ? "pointer-events-none select-none" : ""
        }`}
        aria-disabled={onboardingCatalogLocked}
      >
        {onboardingCatalogLocked ? (
          <div className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] bg-slate-300/38 backdrop-brightness-75 dark:bg-slate-900/42" />
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="shrink-0 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">HUJI Catalog Import</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Choose a degree, click <span className="font-medium">Load roadmap</span>, then add courses to your list and use{" "}
              <span className="font-medium">Book courses</span> when you are ready (next: week calendar).
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

        <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="relative z-20 min-w-0">
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
              className="relative z-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100"
            />
            {isCatalogDegreeOptionsOpen && catalogDegreeSearchQuery.trim().length > 0 ? (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 text-slate-900 shadow-lg dark:border-white/15 dark:bg-[#1a1f26] dark:text-slate-100">
                {catalogDegreeOptions.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300">No matching degrees found.</p>
                ) : (
                  catalogDegreeOptions.map((degree) => (
                    <button
                      key={degree.id}
                      type="button"
                      onClick={() => onSelectCatalogDegree(degree)}
                      className={`w-full rounded-lg px-2 py-1.5 text-left text-xs transition ${
                        catalogDegree === degree.id
                          ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                          : "text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/[0.1]"
                      }`}
                    >
                      {degree.label}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            variant="primary"
            className="h-[42px] shrink-0 px-4 md:self-end"
            onClick={() => onLoadRoadmap()}
            disabled={!catalogDegree.trim() || catalogDegreeImporting}
            data-onboarding="load-roadmap"
          >
            {catalogDegreeImporting ? "Loading…" : "Load roadmap"}
          </Button>
        </div>

        {viewingSavedRoadmap ? (
          <div className="min-w-0">
            <div ref={roadmapMenuRef} className="relative min-w-0 max-w-xl">
              <label className="mb-1 block px-1 text-xs font-medium text-slate-600 dark:text-slate-300">Roadmap</label>
              <button
                type="button"
                onClick={() => setRoadmapMenuOpen((v) => !v)}
                className="flex h-[42px] w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-900 outline-none ring-offset-2 transition hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:hover:border-white/20 dark:focus-visible:ring-slate-500"
                aria-expanded={roadmapMenuOpen}
                aria-haspopup="listbox"
              >
                <span className="min-w-0 flex-1 truncate">{activeRoadmapLabel}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${roadmapMenuOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              {roadmapMenuOpen ? (
                <ul
                  role="listbox"
                  className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-slate-900 shadow-lg dark:border-white/15 dark:bg-[#1a1f26] dark:text-slate-100"
                >
                  {savedDegreeRoadmaps.map((r) => {
                    const selected = r.degreeId === catalogDegree;
                    return (
                      <li key={r.degreeId} role="none" className="px-1">
                        <div
                          className={`group flex items-stretch gap-0.5 rounded-lg ${
                            selected
                              ? "bg-slate-100 dark:bg-white/[0.08]"
                              : "hover:bg-slate-50 dark:hover:bg-white/[0.05]"
                          }`}
                        >
                          <button
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className="min-w-0 flex-1 truncate px-2 py-2.5 text-left text-xs text-slate-800 dark:text-slate-100"
                            onClick={() => {
                              onSelectSavedRoadmap(r.degreeId);
                              setRoadmapMenuOpen(false);
                            }}
                          >
                            {r.label}
                          </button>
                          <button
                            type="button"
                            title="Remove saved roadmap"
                            aria-label={`Remove roadmap ${r.label}`}
                            className="flex shrink-0 items-center justify-center rounded-md px-2 text-slate-400 opacity-40 transition-all hover:bg-rose-500/15 hover:text-rose-600 hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60 dark:text-slate-500 dark:hover:text-rose-400"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (onRemoveSavedRoadmap(r.degreeId)) {
                                setRoadmapMenuOpen(false);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={2} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
            {showRoadmapSwitcher ? (
              <p className="mt-1.5 px-1 text-xs text-slate-500 dark:text-slate-400">
                To add another degree, pick it under Degree above, then load its roadmap (e.g. from Settings).
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="relative min-w-0">
            <label className="mb-1 block px-1 text-xs font-medium text-slate-600 dark:text-slate-300">Search courses</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={catalogQuery}
                onChange={(event) => onCatalogQueryChange(event.target.value)}
                placeholder="Course number or name…"
                className="h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm text-slate-900 outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100"
              />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-[42px] shrink-0 px-4 md:self-end"
            onClick={onBookCourses}
            disabled={catalogBookingQueueCount === 0}
            title={catalogBookingQueueCount === 0 ? "Add at least one course first" : undefined}
          >
            Book courses ({catalogBookingQueueCount})
          </Button>
        </div>
          </div>

        <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-slate-200/70 pt-3 dark:border-white/10">
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-1">
          {catalogLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Searching catalog...</p>
          ) : catalogResults.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {catalogViewMode === "roadmap"
                ? "No roadmap loaded yet. Choose a degree and click Load roadmap, or pick a saved roadmap above."
                : "No courses match this search."}
            </p>
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
                          type="button"
                          variant="outline"
                          className="shrink-0"
                          onClick={() => onToggleCatalogCourseForBooking(course)}
                          disabled={isCatalogCourseOwned(course)}
                          aria-pressed={isCatalogCourseQueued(course)}
                          title={
                            isCatalogCourseOwned(course)
                              ? "Already in your courses"
                              : isCatalogCourseQueued(course)
                                ? "Remove from booking list"
                                : "Add to booking list"
                          }
                        >
                          {isCatalogCourseOwned(course) ? (
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">In workspace</span>
                          ) : isCatalogCourseQueued(course) ? (
                            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} aria-hidden />
                          ) : (
                            "Add course"
                          )}
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
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => onToggleCatalogCourseForBooking(course)}
                    disabled={isCatalogCourseOwned(course)}
                    aria-pressed={isCatalogCourseQueued(course)}
                    title={
                      isCatalogCourseOwned(course)
                        ? "Already in your courses"
                        : isCatalogCourseQueued(course)
                          ? "Remove from booking list"
                          : "Add to booking list"
                    }
                  >
                    {isCatalogCourseOwned(course) ? (
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">In workspace</span>
                    ) : isCatalogCourseQueued(course) ? (
                      <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} aria-hidden />
                    ) : (
                      "Add course"
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}
          </div>
        </div>
        </div>
      </Panel>
    </div>
  );
}
