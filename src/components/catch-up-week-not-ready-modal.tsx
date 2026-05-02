"use client";

import { Button, Panel } from "@/components/ui";

export function CatchUpWeekNotReadyModal({
  open,
  weekLabel,
  lastSessionEnd,
  onClose
}: {
  open: boolean;
  weekLabel: string;
  lastSessionEnd: Date;
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
        </div>
        <div className="flex justify-end border-t border-slate-200/80 px-5 py-3 dark:border-white/10">
          <Button onClick={onClose}>OK</Button>
        </div>
      </Panel>
    </div>
  );
}
