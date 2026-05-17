import { useCallback, useEffect, useState } from "react";
import type { ClipboardEvent, CSSProperties } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button, Panel } from "@/components/ui";
import type { Course, TaskPriority } from "@/lib/types";
import { hexToRgb } from "@/lib/color-utils";

const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const SCREENSHOT_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

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
  screenshotFile: File | null;
  items: AiParsedTaskDraft[];
  parsing: boolean;
  creating: boolean;
  error: string | null;
  onClose: () => void;
  onChangeCourse: (next: string | "general" | "") => void;
  onChangeText: (next: string) => void;
  onScreenshotChange: (file: File | null) => void;
  onScreenshotPasteIssue?: (message: string | null) => void;
  onParse: () => void;
  onToggleInclude: (id: string) => void;
  onChangeItem: (id: string, patch: Partial<AiParsedTaskDraft>) => void;
  onCreate: () => void;
}

export function AiTaskImportModal({
  courses,
  selectedCourseId,
  planText,
  screenshotFile,
  items,
  parsing,
  creating,
  error,
  onClose,
  onChangeCourse,
  onChangeText,
  onScreenshotChange,
  onScreenshotPasteIssue,
  onParse,
  onToggleInclude,
  onChangeItem,
  onCreate
}: AiTaskImportModalProps) {
  const [coursePickerOpen, setCoursePickerOpen] = useState(false);
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState<string | null>(null);
  const includedCount = items.filter((item) => item.include).length;
  const hasReview = items.length > 0;
  const hasScreenshot = Boolean(screenshotFile);
  const hasPlanText = planText.trim().length > 0;
  const canParse = hasScreenshot || hasPlanText;
  const primaryDisabled = parsing || creating || (hasReview ? includedCount === 0 : !canParse);
  const primaryLabel = hasReview
    ? creating
      ? "Launching..."
      : "Let's GO!"
    : parsing
      ? hasScreenshot
        ? "Reading screenshot..."
        : "Parsing..."
      : hasScreenshot
        ? "Extract from screenshot"
        : "Parse plan";
  const primaryAction = hasReview ? onCreate : onParse;

  useEffect(() => {
    if (!screenshotFile) {
      setScreenshotPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(screenshotFile);
    setScreenshotPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [screenshotFile]);

  const handlePlanPaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const imageFiles = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (imageFiles.length === 0) return;
      event.preventDefault();
      const file = imageFiles[0];
      const mimeType = file.type || "image/png";
      if (!SCREENSHOT_MIME_TYPES.has(mimeType)) {
        onScreenshotPasteIssue?.("Use a PNG, JPEG, WebP, or GIF screenshot.");
        return;
      }
      if (file.size > MAX_SCREENSHOT_BYTES) {
        onScreenshotPasteIssue?.("Screenshot must be 4 MB or smaller.");
        return;
      }
      const named = file.name
        ? file
        : new File([file], `pasted-screenshot-${Date.now()}.png`, { type: mimeType });
      onScreenshotChange(named);
      onScreenshotPasteIssue?.(null);
    },
    [onScreenshotChange, onScreenshotPasteIssue]
  );
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
    <div className="fixed inset-0 z-[56] flex items-center justify-center bg-black/45 px-3 py-4 backdrop-blur-[2px]" onClick={onClose}>
      <Panel
        className="flex max-h-[min(90vh,720px)] w-full max-w-xl flex-col overflow-hidden bg-white/95 p-5 dark:bg-[#101317]/95"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold tracking-tight">Task generator</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Pick a course, paste a screenshot or plan, review, then launch.
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-8 w-8 shrink-0 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="shrink-0 space-y-3 overflow-visible px-0.5 pb-1">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Course</label>
            <div className="relative z-30">
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
                  <div className="absolute left-0 right-0 z-50 mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-[#0d131a] p-2 shadow-2xl dark:border-white/10">
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
                          <span className="min-w-0 flex-1 truncate">{option.code} · {option.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Plan or screenshot</label>
            <div className="rounded-[14px] p-0.5" style={textAreaAccentStyle}>
              <textarea
                value={planText}
                onChange={(event) => onChangeText(event.target.value)}
                onPaste={handlePlanPaste}
                placeholder="Paste text or screenshot (⌘V)..."
                rows={hasReview ? 2 : 4}
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition dark:border-white/10 dark:bg-white/[0.04]"
              />
            </div>
            {screenshotPreviewUrl && !hasReview ? (
              <div className="relative mt-2 overflow-hidden rounded-lg border border-slate-200 dark:border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={screenshotPreviewUrl} alt="Screenshot preview" className="max-h-28 w-full object-contain bg-slate-50 dark:bg-white/[0.03]" />
                  <button
                    type="button"
                    onClick={() => onScreenshotChange(null)}
                    className="absolute right-1.5 top-1.5 rounded-full bg-black/55 p-0.5 text-white transition hover:bg-black/70"
                    aria-label="Remove screenshot"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
          {error ? (
            <div className="rounded-lg border border-rose-200/70 bg-rose-50/80 px-2.5 py-1.5 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </div>
          ) : null}

          {hasReview ? (
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="rounded-lg border border-slate-200/80 p-2.5 dark:border-white/10">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={item.include}
                        onChange={() => onToggleInclude(item.id)}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                      include
                    </label>
                    <select
                      value={item.priority}
                      onChange={(event) => onChangeItem(item.id, { priority: event.target.value as TaskPriority })}
                      className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] dark:border-white/10 dark:bg-white/[0.04]"
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
                    className="mb-1.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-white/[0.04]"
                  />
                  <input
                    value={item.description}
                    onChange={(event) => onChangeItem(item.id, { description: event.target.value })}
                    placeholder="Description (optional)"
                    className="mb-1.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-white/[0.04]"
                  />
                  <input
                    type="datetime-local"
                    value={item.dueAt}
                    onChange={(event) => onChangeItem(item.id, { dueAt: event.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-white/10 dark:bg-white/[0.04]"
                  />
                  {item.phase ? <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Phase: {item.phase}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex shrink-0 items-center justify-between gap-2 border-t border-slate-200/60 pt-3 dark:border-white/10">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{includedCount} selected</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={creating} className="h-8 px-3 text-xs">
              Cancel
            </Button>
            <Button onClick={primaryAction} disabled={primaryDisabled} className="h-8 min-w-[120px] px-3 text-xs">
              {primaryLabel}
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
