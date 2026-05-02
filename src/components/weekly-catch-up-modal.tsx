"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
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

export type WeeklyCatchUpGenerateMode = "initial" | "edit";

export type WeeklyCatchUpGenerateResult = {
  created: number;
  /** IDs of newly created tasks (excludes dedupe skips). */
  newTaskIds: string[];
};

export type WeeklyCatchUpModalProps = {
  open: boolean;
  weekLabel: string;
  occurrences: SessionOccurrence[];
  /** Owner “Demo catch-up”: prior demo tasks were cleared when opening; safe to regenerate for QA. */
  demoMode?: boolean;
  /** True when the user already pressed Generate for this week (modal opens read-only with an Edit option). */
  alreadySubmitted: boolean;
  onClose: () => void;
  /** Returns synchronously how many tasks were newly created and their ids so the result step can offer “Go to tasks”. */
  onGenerate: (
    attendedInstanceKeys: Set<string>,
    mode: WeeklyCatchUpGenerateMode
  ) => WeeklyCatchUpGenerateResult;
  /** Switch to the Kanban view and trigger the soft glow on `newTaskIds`. */
  onGoToTasks: (newTaskIds: string[]) => void;
};

export function WeeklyCatchUpModal({
  open,
  weekLabel,
  occurrences,
  demoMode = false,
  alreadySubmitted,
  onClose,
  onGenerate,
  onGoToTasks
}: WeeklyCatchUpModalProps) {
  const [attended, setAttended] = useState<Set<string>>(() => new Set());
  const [editMode, setEditMode] = useState(false);
  const [resultStep, setResultStep] = useState<WeeklyCatchUpGenerateResult | null>(null);

  const isReadOnly = alreadySubmitted && !editMode && resultStep === null;
  const isEditing = alreadySubmitted && editMode;

  useEffect(() => {
    if (!open) {
      setAttended(new Set());
      setEditMode(false);
      setResultStep(null);
    }
  }, [open]);

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
    onClose();
  }, [onClose]);

  const handleGenerate = useCallback(() => {
    const mode: WeeklyCatchUpGenerateMode = isEditing ? "edit" : "initial";
    const result = onGenerate(new Set(attended), mode);
    if (mode === "edit") {
      onClose();
      return;
    }
    setResultStep(result);
  }, [attended, isEditing, onGenerate, onClose]);

  const handleGoToTasks = useCallback(() => {
    if (!resultStep) return;
    onGoToTasks(resultStep.newTaskIds);
  }, [resultStep, onGoToTasks]);

  const handleStartEdit = useCallback(() => {
    setEditMode(true);
  }, []);

  if (!open) return null;

  const showResult = resultStep !== null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={handleClose}>
      <Panel
        className="flex max-h-[min(88vh,720px)] w-full max-w-lg flex-col overflow-hidden bg-white/96 dark:bg-[#101317]/96"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200/80 px-5 py-4 dark:border-white/10">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {showResult ? "Catch-up tasks ready" : "Weekly attendance"}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {showResult
              ? `Generated for ${weekLabel}.`
              : isReadOnly
                ? `You already generated catch-up tasks for ${weekLabel}. The list below is read-only — use Edit if you need to add more recording tasks.`
                : `Lectures & Tirgul (Sun–Thu) — ${weekLabel}. Check sessions you attended; Generate adds backlog tasks to watch recordings for the rest. Each task's due date is set to the start of your next lecture or Tirgul in that course (from your calendar).`}
          </p>
          {demoMode && !showResult ? (
            <p className="mt-3 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs leading-snug text-sky-900 dark:text-sky-100/95">
              <span className="font-semibold">QA demo.</span> Any previous demo catch-up tasks were cleared when you opened this. Sessions are for a{" "}
              <span className="font-medium">fixed Sun–Thu week</span> (virtual “now” in <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[10px] dark:bg-white/10">src/lib/demo-weekly-catchup.ts</code>), not the live calendar week. Use Demo catch-up again after each change; closing this modal or leaving Kanban also clears demo tasks.
            </p>
          ) : null}
        </div>

        {showResult ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-300">
              <Sparkles className="h-7 w-7" aria-hidden />
            </div>
            <div>
              <p className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {resultStep!.created === 0
                  ? "No new tasks"
                  : `${resultStep!.created} recording task${resultStep!.created === 1 ? "" : "s"} added`}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {resultStep!.created === 0
                  ? "Everything was either attended or already in your backlog."
                  : "Open Kanban to see your new backlog items — they'll glow softly so they're easy to spot."}
              </p>
            </div>
          </div>
        ) : (
          <div
            className={clsx(
              "min-h-0 flex-1 overflow-y-auto px-5 py-3",
              isReadOnly && "pointer-events-none select-none opacity-60"
            )}
          >
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
                                disabled={isReadOnly}
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
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200/80 px-5 py-3 dark:border-white/10">
          {showResult ? (
            <>
              <Button variant="ghost" onClick={handleClose}>
                Close
              </Button>
              <Button onClick={handleGoToTasks} disabled={resultStep!.created === 0} className={clsx(resultStep!.created === 0 && "opacity-50")}>
                Go to tasks
              </Button>
            </>
          ) : isReadOnly ? (
            <>
              <Button variant="ghost" onClick={handleClose}>
                Close
              </Button>
              <Button variant="outline" onClick={handleStartEdit}>
                Edit
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={occurrences.length === 0} className={clsx(occurrences.length === 0 && "opacity-50")}>
                {isEditing ? "Update tasks" : "Generate tasks"}
              </Button>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
