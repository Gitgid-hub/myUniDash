"use client";

import clsx from "clsx";

/** Compact switch: on = auto-open weekly catch-up after the week’s last session; off = manual only. */
export function WeeklyCatchUpAutoPromptToggle({
  autoOn,
  onChange,
  disabled,
  id
}: {
  autoOn: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={autoOn}
      aria-label={autoOn ? "Open weekly catch-up automatically after last session" : "Weekly catch-up: open only from calendar"}
      disabled={disabled}
      onClick={() => onChange(!autoOn)}
      className={clsx(
        "relative h-5 w-8 shrink-0 rounded-full p-0.5 outline-none transition-colors duration-200",
        "focus-visible:ring-2 focus-visible:ring-slate-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-slate-500/40 dark:focus-visible:ring-offset-[#101317]",
        autoOn ? "bg-slate-900 dark:bg-slate-100" : "bg-slate-200/90 dark:bg-white/10",
        disabled && "pointer-events-none opacity-50"
      )}
    >
      <span
        className={clsx(
          "pointer-events-none block h-3 w-3 rounded-full bg-white shadow-sm ring-1 ring-slate-900/8 transition-transform duration-200 ease-out dark:ring-slate-900/10",
          autoOn ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}
