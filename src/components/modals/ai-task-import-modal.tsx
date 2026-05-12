import { useState } from "react";
import type { CSSProperties } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button, Panel } from "@/components/ui";
import type { Course, TaskPriority } from "@/lib/types";
import { hexToRgb } from "@/lib/color-utils";

export type AiParsedTaskDraft = {
  id: string;
  title: string;
  description: string;
  dueAt: string;
  priority: TaskPriority;
  include: boolean;
  phase?: string;
};

export interface AiTaskImportModalProps {
  courses: Course[];
  selectedCourseId: string | "general" | "";
  planText: string;
  items: AiParsedTaskDraft[];
  parsing: boolean;
  creating: boolean;
  error: string | null;
  onClose: () => void;
  onChangeCourse: (next: string | "general" | "") => void;
  onChangeText: (next: string) => void;
  onParse: () => void;
  onToggleInclude: (id: string) => void;
  onChangeItem: (id: string, patch: Partial<AiParsedTaskDraft>) => void;
  onCreate: () => void;
}

export function AiTaskImportModal({
  courses,
  selectedCourseId,
  planText,
  items,
  parsing,
  creating,
  error,
  onClose,
  onChangeCourse,
  onChangeText,
  onParse,
  onToggleInclude,
  onChangeItem,
  onCreate
}: AiTaskImportModalProps) {
  const [coursePickerOpen, setCoursePickerOpen] = useState(false);
  const includedCount = items.filter((item) => item.include).length;
  const hasReview = items.length > 0;
  const primaryDisabled = parsing || creating || (hasReview && includedCount === 0);
  const primaryLabel = hasReview ? (creating ? "Launching..." : "Let's GO!") : parsing ? "Parsing..." : "Create tasks";
  const primaryAction = hasReview ? onCreate : onParse;
  const selectedCourse =
    selectedCourseId === "general"
      ? { id: "general", code: "GEN", name: "General", color: "#64748b" }
      : courses.find((course) => course.id === selectedCourseId);
  const accentColor = selectedCourse?.color ?? null;
  const accentRgb = accentColor ? hexToRgb(accentColor) : null;
  const accentRing = accentRgb ? `0 0 0 2px rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.28)` : undefined;
  const accentSoftBg = accentRgb ? `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.14)` : undefined;
  const accentSoftBorder = accentRgb ? `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.42)` : undefined;
  const selectAccentStyle: CSSProperties | undefined = accentColor
    ? {
        borderColor: accentSoftBorder,
        background: accentSoftBg,
        boxShadow: accentRing
      }
    : undefined;
  const textAreaAccentStyle: CSSProperties | undefined = accentColor
    ? {
        borderColor: accentSoftBorder,
        boxShadow: accentRing
      }
    : undefined;
  const pickerOptions: Array<{ id: string | "general"; code: string; name: string; color: string }> = [
    { id: "general", code: "GEN", name: "General", color: "#64748b" },
    ...courses.map((course) => ({ id: course.id, code: course.code, name: course.name, color: course.color }))
  ];
  const selectedLabel = selectedCourse ? `${selectedCourse.code} · ${selectedCourse.name}` : "Choose course...";
  return (
    <div className="fixed inset-0 z-[56] flex items-center justify-center bg-black/45 px-4 backdrop-blur-[2px]" onClick={onClose}>
      <Panel className="w-full max-w-3xl bg-white/95 p-6 dark:bg-[#101317]/95" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Task generator</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pick a course and paste your plan. We parse first, then you review and launch.</p>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-10 w-10 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-[240px_minmax(0,1fr)] md:items-start">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Course (required)</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setCoursePickerOpen((open) => !open)}
                className="flex h-10 w-full items-center justify-between rounded-full border border-slate-300/60 bg-slate-100/65 px-3 text-sm outline-none transition hover:bg-slate-100/80 dark:border-white/15 dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
                style={selectAccentStyle ?? undefined}
              >
                <span className="inline-flex min-w-0 items-center gap-2 text-left">
                  {selectedCourse ? <span className="h-2.5 w-2.5 rounded-full" style={{ background: selectedCourse.color }} /> : null}
                  <span className="truncate">{selectedLabel}</span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${coursePickerOpen ? "rotate-180" : ""}`} />
              </button>
              {coursePickerOpen && (
                <div className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-[#0d131a] p-2 shadow-xl dark:border-white/10">
                  {pickerOptions.map((option) => {
                    const rgb = hexToRgb(option.color);
                    const bg = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.18)` : "rgba(100,116,139,0.2)";
                    const border = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.55)` : "rgba(100,116,139,0.5)";
                    const active = selectedCourseId === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          onChangeCourse(option.id);
                          setCoursePickerOpen(false);
                        }}
                        className={`mb-1 flex w-full items-center gap-2 rounded-full border px-3 py-1.5 text-left text-sm text-slate-100 transition hover:brightness-110 ${active ? "ring-1 ring-white/35" : ""}`}
                        style={{ background: bg, borderColor: border }}
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: option.color }} />
                        <span className="truncate">{option.code} · {option.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Plan text</label>
            <textarea
              value={planText}
              onChange={(event) => onChangeText(event.target.value)}
              placeholder="Paste your plan text..."
              className="min-h-[84px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition dark:border-white/10 dark:bg-white/[0.04]"
              style={textAreaAccentStyle}
            />
          </div>
        </div>
        {error ? <div className="mt-3 rounded-xl border border-rose-200/70 bg-rose-50/80 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</div> : null}
        <div className="mt-4 max-h-[45vh] space-y-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200/80 p-3 dark:border-white/10">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={item.include} onChange={() => onToggleInclude(item.id)} className="h-4 w-4 rounded border-slate-300" />
                  include
                </label>
                <select
                  value={item.priority}
                  onChange={(event) => onChangeItem(item.id, { priority: event.target.value as TaskPriority })}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="urgent">urgent</option>
                </select>
              </div>
              <input
                value={item.title}
                onChange={(event) => onChangeItem(item.id, { title: event.target.value })}
                className="mb-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-white/[0.04]"
              />
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_190px]">
                <input
                  value={item.description}
                  onChange={(event) => onChangeItem(item.id, { description: event.target.value })}
                  placeholder="Description"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-white/[0.04]"
                />
                <input
                  type="datetime-local"
                  value={item.dueAt}
                  onChange={(event) => onChangeItem(item.id, { dueAt: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-white/10 dark:bg-white/[0.04]"
                />
              </div>
              {item.phase ? <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Phase: {item.phase}</p> : null}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">{includedCount} selected</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={creating}>Cancel</Button>
            <Button onClick={primaryAction} disabled={primaryDisabled} className="min-w-[134px]">
              {primaryLabel}
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
