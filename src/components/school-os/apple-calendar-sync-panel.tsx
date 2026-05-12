"use client";

import { Button, Panel } from "@/components/ui";

export function AppleCalendarSyncPanel({
  appleCalendarAutoSync,
  onAutoSyncChange,
  onManageSubscription,
  className
}: {
  appleCalendarAutoSync: boolean;
  onAutoSyncChange: (next: boolean) => void;
  onManageSubscription: () => void;
  className?: string;
}) {
  return (
    <Panel className={className ?? "bg-white/92 dark:bg-[#101317]/92"}>
      <h3 className="mb-2 font-semibold">Apple Calendar sync</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Subscription mode: Apple pulls updates itself. Turn this on to auto-prepare sync whenever you edit sessions here.
      </p>
      <label className="mt-3 inline-flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
        <span className="text-sm text-slate-700 dark:text-slate-200">Auto-sync sessions to Apple subscription</span>
        <input
          type="checkbox"
          checked={appleCalendarAutoSync}
          onChange={(event) => onAutoSyncChange(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
      </label>
      <Button variant="outline" className="mt-3 w-full justify-center text-xs" onClick={onManageSubscription}>
        Manage Apple Calendar subscription link
      </Button>
    </Panel>
  );
}
