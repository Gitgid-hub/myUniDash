"use client";

import clsx from "clsx";
import { useCallback, useMemo, useState } from "react";
import { Button, Panel } from "@/components/ui";
import { groupOccurrencesByWeekday } from "@/lib/academic-week-catchup";
import { formatDateKey, formatSessionType, type SessionOccurrence } from "@/lib/calendar-occurrences";
import type { WeekDay } from "@/lib/types";

const DAY_ORDER: WeekDay[] = ["Sun", "Mon", "Tue", "Wed", "Thu"];

function dayShortLabel(day: WeekDay): string {
  switch (day) {
    case "Sun":
      return "Sunday";
    case "Mon":
      return "Monday";
    case "Tue":
      return "Tuesday";
    case "Wed":
      return "Wednesday";
    case "Thu":
      return "Thursday";
    default:
      return day;
  }
}

export function WeeklyCatchUpModal({
  open,
  weekLabel,
  occurrences,
  onClose,
  onGenerate
}: {
  open: boolean;
  weekLabel: string;
  occurrences: SessionOccurrence[];
  onClose: () => void;
  onGenerate: (attendedInstanceKeys: Set<string>) => void;
}) {
  const [attended, setAttended] = useState<Set<string>>(() => new Set());

  const byDay = useMemo(() => groupOccurrencesByWeekday(occurrences), [occurrences]);

  const toggleAttended = useCallback((instanceKey: string) => {
    setAttended((prev) => {
      const next = new Set(prev);
      if (next.has(instanceKey)) next.delete(instanceKey);
      else next.add(instanceKey);
      return next;
    });
  }, []);

  const handleClose = useCallback(() => {
    setAttended(new Set());
    onClose();
  }, [onClose]);

  const handleGenerate = useCallback(() => {
    onGenerate(new Set(attended));
    setAttended(new Set());
  }, [attended, onGenerate]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={handleClose}>
      <Panel
        className="flex max-h-[min(88vh,720px)] w-full max-w-lg flex-col overflow-hidden bg-white/96 dark:bg-[#101317]/96"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200/80 px-5 py-4 dark:border-white/10">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">Weekly attendance</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Lectures & Tirgul (Sun–Thu) — {weekLabel}. Check sessions you attended; Generate adds backlog tasks to watch recordings for the rest.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {occurrences.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No lectures or Tirgul sessions this week.</p>
          ) : (
            <div className="space-y-5">
              {DAY_ORDER.map((day) => {
                const list = byDay[day] ?? [];
                if (list.length === 0) return null;
                return (
                  <div key={day}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      {dayShortLabel(day)}
                    </p>
                    <ul className="space-y-2">
                      {list.map((occ) => {
                        const label = occ.meeting.title?.trim() || formatSessionType(occ.meeting.type);
                        const typeLabel = formatSessionType(occ.meeting.type);
                        const checked = attended.has(occ.instanceKey);
                        const courseName = occ.course.name?.trim();
                        const titleLine =
                          courseName && courseName !== occ.course.code.trim()
                            ? `${courseName} · ${label}`
                            : `${occ.course.code} · ${label}`;
                        const metaPrefix =
                          courseName && courseName !== occ.course.code.trim() ? `${occ.course.code} · ` : "";
                        return (
                          <li
                            key={occ.instanceKey}
                            className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]"
                          >
                            <input
                              type="checkbox"
                              id={`catchup-${occ.instanceKey}`}
                              checked={checked}
                              onChange={() => toggleAttended(occ.instanceKey)}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300"
                            />
                            <label htmlFor={`catchup-${occ.instanceKey}`} className="min-w-0 flex-1 cursor-pointer">
                              <span className="block text-sm font-medium text-slate-900 dark:text-slate-100" dir="auto">
                                {titleLine}
                              </span>
                              <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400" dir="auto">
                                {metaPrefix}
                                {typeLabel} · {occ.meeting.start}–{occ.meeting.end} · {formatDateKey(occ.date)}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200/80 px-5 py-3 dark:border-white/10">
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={occurrences.length === 0} className={clsx(occurrences.length === 0 && "opacity-50")}>
            Generate tasks
          </Button>
        </div>
      </Panel>
    </div>
  );
}
