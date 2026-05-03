"use client";

import { Button, Panel } from "@/components/ui";
import { WeeklyCatchUpAutoPromptToggle } from "@/components/weekly-catch-up-auto-prompt-toggle";

export function CatchUpWeekNotReadyModal({
  open,
  weekLabel,
  lastSessionEnd,
  autoPromptEnabled,
  onAutoPromptChange,
  onClose
}: {
  open: boolean;
  weekLabel: string;
  lastSessionEnd: Date;
  autoPromptEnabled: boolean;
  onAutoPromptChange: (next: boolean) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const when = lastSessionEnd.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <Panel
        className="w-full max-w-md overflow-hidden bg-white/96 dark:bg-[#101317]/96"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200/80 px-5 py-4 dark:border-white/10">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">This week isn&apos;t over yet</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Weekly catch-up for <span className="font-medium text-slate-800 dark:text-slate-200">{weekLabel}</span> opens after your
            last Sun–Thu lecture or Tirgul has finished. Your last session for that stretch ends around{" "}
            <span className="font-medium text-slate-800 dark:text-slate-200">{when}</span>. See you then!
          </p>
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200/90 bg-slate-50/80 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
            <WeeklyCatchUpAutoPromptToggle autoOn={autoPromptEnabled} onChange={onAutoPromptChange} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-800 dark:text-slate-100">Open automatically</p>
              <p className="mt-0.5 text-xs leading-snug text-slate-500 dark:text-slate-400">
                {autoPromptEnabled ? (
                  <>
                    After your last Sun–Thu lecture or Tirgul ends, School OS can bring up this weekly catch-up for you.
                  </>
                ) : (
                  <>
                    You open it when you want — use <span className="font-medium text-slate-600 dark:text-slate-300">Weekly catch-up</span> on the
                    calendar. Nothing will open on its own.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end border-t border-slate-200/80 px-5 py-3 dark:border-white/10">
          <Button onClick={onClose}>OK</Button>
        </div>
      </Panel>
    </div>
  );
}
