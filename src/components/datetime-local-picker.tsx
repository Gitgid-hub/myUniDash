"use client";

import { CircularHourClock } from "@/components/circular-hour-clock";
import { joinLocalDateTimeValue, splitLocalDateTimeValue } from "@/lib/local-datetime";

export interface DateTimeLocalPickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Passed to the date input. */
  dateInputClassName?: string;
  disabled?: boolean;
  compact?: boolean;
  /** Side-by-side date + clock (good in modals). */
  inline?: boolean;
}

export function DateTimeLocalPicker({
  value,
  onChange,
  className = "",
  dateInputClassName = "",
  disabled = false,
  compact = false,
  inline = false
}: DateTimeLocalPickerProps) {
  const { date, hour, minute } = splitLocalDateTimeValue(value);

  function emit(nextDate: string, nextHour: string, nextMinute: string) {
    onChange(joinLocalDateTimeValue(nextDate, nextHour, nextMinute));
  }

  function setToday() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const h = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    onChange(joinLocalDateTimeValue(`${y}-${m}-${d}`, h, min));
  }

  const dateInput = (
    <input
      type="date"
      value={date}
      disabled={disabled}
      onChange={(event) => {
        const nextDate = event.target.value;
        if (!nextDate) {
          onChange("");
          return;
        }
        emit(nextDate, hour, minute);
      }}
      className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04] ${dateInputClassName}`}
    />
  );

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className={inline ? "flex items-start gap-3" : "flex flex-col gap-2"}>
        {inline ? <div className="min-w-0 flex-1 pt-6">{dateInput}</div> : dateInput}
        <CircularHourClock
          hour={hour}
          minute={minute}
          disabled={disabled || !date}
          compact={compact}
          onHourChange={(nextHour) => emit(date, nextHour, minute)}
          onMinuteChange={(nextMinute) => emit(date, hour, nextMinute)}
        />
      </div>
      <div className="flex items-center justify-between gap-2 px-0.5 text-[11px]">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("")}
          className="text-slate-500 transition hover:text-slate-700 disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-200"
        >
          Clear
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={setToday}
          className="text-sky-600 transition hover:text-sky-700 disabled:opacity-50 dark:text-sky-300 dark:hover:text-sky-200"
        >
          Today
        </button>
      </div>
    </div>
  );
}
