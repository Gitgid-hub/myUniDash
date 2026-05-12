"use client";

import { BookOpen, Command, Search, X } from "lucide-react";
import { Button, Panel } from "@/components/ui";
import type { getTabGuideSheet } from "@/lib/view-tab-guide";

type GuideSheet = ReturnType<typeof getTabGuideSheet>;

export function SchoolOsUtilityDrawer({
  open,
  guideSheet,
  onClose,
  onReplayOnboarding
}: {
  open: boolean;
  guideSheet: GuideSheet;
  onClose: () => void;
  onReplayOnboarding: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close utility drawer"
        className="absolute inset-0 bg-slate-950/18 backdrop-blur-[1px] dark:bg-black/35"
        onClick={onClose}
      />
      <aside className="absolute inset-y-4 right-4 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-4 overflow-y-auto rounded-[32px] border border-slate-200/80 bg-[#f7f8fa]/96 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.16)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#0f1115]/96 dark:shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
        <div className="flex items-center justify-between px-1">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Guide — {guideSheet.viewLabel}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">This tab, then global keys.</p>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-10 w-10 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Panel className="bg-white/92 dark:bg-[#101317]/92">
          <div className="space-y-4">
            {guideSheet.sections.map((section) => (
              <div key={section.title}>
                <h4 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">{section.title}</h4>
                <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                  {section.items.map((item, idx) => (
                    <li key={`${section.title}-${idx}`}>
                      <span className="font-medium text-slate-800 dark:text-slate-100">{item.keys}</span>
                      <span className="text-slate-500 dark:text-slate-400"> — </span>
                      {item.detail}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-slate-200/80 pt-3 dark:border-white/10">
            <Button variant="outline" className="w-full justify-center" onClick={onReplayOnboarding} data-onboarding="replay-onboarding">
              Replay onboarding
            </Button>
          </div>
        </Panel>
      </aside>
    </div>
  );
}

export function SchoolOsMainToolbar({
  viewTitle,
  activeView,
  onOpenSearch,
  onOpenGuide
}: {
  viewTitle: string;
  activeView: string;
  onOpenSearch: () => void;
  onOpenGuide: () => void;
}) {
  return (
    <Panel className="shrink-0 bg-white/90 dark:bg-[#101317]/90">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[34px] font-semibold tracking-[-0.03em]">{viewTitle}</h2>
          <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">One month to launch. Everything in one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenSearch}
            className={`inline-flex h-10 items-center justify-between rounded-full border border-slate-200 bg-slate-50 px-4 text-sm text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08] ${
              activeView === "kanban" ? "w-full min-w-0 max-w-[520px] sm:w-[520px]" : "min-w-[260px]"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Search className="h-4 w-4 text-slate-400" />
              Search tasks, notes, features...
            </span>
            <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-500 dark:border-white/15 dark:bg-white/[0.06] dark:text-slate-300">
              <Command className="mr-1 h-3 w-3" />
              K
            </span>
          </button>
          {activeView !== "kanban" && activeView !== "class-notes" ? (
            <Button variant="outline" onClick={onOpenGuide} data-onboarding="guide-button">
              <BookOpen className="mr-1 h-4 w-4" />
              Guide
            </Button>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
