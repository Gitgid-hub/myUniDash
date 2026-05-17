"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type ChangeEvent
} from "react";
import { Paperclip, Trash2 } from "lucide-react";
import { Button, Panel } from "@/components/ui";
import type { Course, TaskAttachment, TaskPriority } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { createId } from "@/lib/id";
import {
  createTaskAttachmentMeta,
  deleteTaskAttachmentBlobsForTask,
  saveTaskAttachmentBlob,
  TASK_ATTACHMENT_ACCEPT,
  TASK_ATTACHMENT_MAX_BYTES
} from "@/lib/task-attachment-blobs";
import { DateTimeLocalPicker } from "@/components/datetime-local-picker";
import { parseNaturalDeadlineToLocalInput } from "@/lib/date-format";

export const TASK_COMPOSER_MAX_FILES = 12;

export interface TaskComposerProps {
  courses: Course[];
  initialCourseId?: string | "general";
  onClose: () => void;
  onSave: (input: {
    id?: string;
    title: string;
    description?: string;
    courseId?: string | "general";
    dueAt?: string;
    priority?: TaskPriority;
    attachments?: TaskAttachment[];
  }) => void | Promise<void>;
}

export function TaskComposer({
  courses,
  initialCourseId,
  onClose,
  onSave
}: TaskComposerProps) {
  const { user: composerUser } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [courseId, setCourseId] = useState<string | "general" | "">(initialCourseId ?? "");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueAt, setDueAt] = useState("");
  const [dueAtHint, setDueAtHint] = useState<string | null>(null);
  const [isCommandHeld, setIsCommandHeld] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [fileHint, setFileHint] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCourseId(initialCourseId ?? "");
  }, [initialCourseId]);

  const removePending = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const onPickFiles = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setFileHint(null);
      const list = event.target.files;
      if (!list?.length) return;
      const next: File[] = [...pendingFiles];
      for (const file of Array.from(list)) {
        if (file.size > TASK_ATTACHMENT_MAX_BYTES) {
          setFileHint(`Skipped "${file.name}" — larger than ${Math.round(TASK_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB.`);
          continue;
        }
        if (next.length >= TASK_COMPOSER_MAX_FILES) {
          setFileHint(`At most ${TASK_COMPOSER_MAX_FILES} files.`);
          break;
        }
        next.push(file);
      }
      setPendingFiles(next);
      event.target.value = "";
    },
    [pendingFiles]
  );

  const handleCreateTask = useCallback(async () => {
    if (!title.trim() || !courseId || saving) {
      return;
    }
    setSaving(true);
    setFileHint(null);
    const taskId = createId("task");
    try {
      const attachments: TaskAttachment[] = [];
      for (const file of pendingFiles) {
        const attId = createId("tatt");
        const meta = createTaskAttachmentMeta(file, attId);
        await saveTaskAttachmentBlob(composerUser?.id, taskId, attId, file);
        attachments.push(meta);
      }
      await Promise.resolve(
        onSave({
          id: taskId,
          title,
          description,
          courseId: courseId as string | "general",
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          priority,
          attachments: attachments.length ? attachments : undefined
        })
      );
      onClose();
    } catch (e) {
      void deleteTaskAttachmentBlobsForTask(composerUser?.id, taskId).catch(() => {});
      setFileHint(e instanceof Error ? e.message : "Could not save attachments.");
    } finally {
      setSaving(false);
    }
  }, [courseId, description, dueAt, onClose, onSave, pendingFiles, priority, saving, title]);

  const applyPastedDeadline = useCallback((pasted: string) => {
    const parsed = parseNaturalDeadlineToLocalInput(pasted);
    if (!parsed) {
      setDueAtHint("Could not recognize date/time text. Try: Tuesday, 5 May 2026, 4:00 PM");
      return false;
    }
    setDueAt(parsed);
    setDueAtHint("Parsed pasted deadline text.");
    return true;
  }, []);

  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey) {
        setIsCommandHeld(true);
      }
      if (event.key !== "Enter") return;
      if (!(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      void handleCreateTask();
    }
    function onWindowKeyUp(event: KeyboardEvent) {
      if (!event.metaKey && !event.ctrlKey) {
        setIsCommandHeld(false);
      }
    }
    function onWindowBlur() {
      setIsCommandHeld(false);
    }
    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("keyup", onWindowKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("keyup", onWindowKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [handleCreateTask]);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/65 p-3 backdrop-blur-sm">
      <Panel
        className="w-full max-w-2xl bg-white/95 dark:bg-slate-950/95"
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          if (!(event.metaKey || event.ctrlKey)) return;
          event.preventDefault();
          void handleCreateTask();
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">New Task</h3>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <select
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
          >
            <option value="" disabled>
              Select course
            </option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.code} {course.name}
              </option>
            ))}
            <option value="general">General</option>
          </select>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={courseId ? "Task title" : "Select course first"}
            disabled={!courseId}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5"
          />
          <div
            className="space-y-1 md:col-span-2"
            onPaste={(event) => {
              const pasted = event.clipboardData.getData("text");
              if (!pasted) return;
              const handled = applyPastedDeadline(pasted);
              if (handled) event.preventDefault();
            }}
          >
            <DateTimeLocalPicker
              value={dueAt}
              onChange={(next) => {
                setDueAt(next);
                if (dueAtHint) setDueAtHint(null);
              }}
              disabled={saving}
              dateInputClassName="rounded-lg border-slate-300 dark:border-white/10 dark:bg-white/5"
            />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const pasted = await navigator.clipboard.readText();
                    if (!pasted) {
                      setDueAtHint("Clipboard is empty.");
                      return;
                    }
                    applyPastedDeadline(pasted);
                  } catch {
                    setDueAtHint("Clipboard read blocked. Paste directly into the deadline field.");
                  }
                }}
                className="text-xs text-sky-600 transition hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-200"
              >
                Paste text deadline
              </button>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Example: Tuesday, 5 May 2026, 4:00 PM
              </span>
            </div>
            {dueAtHint ? (
              <p
                className={`text-xs ${
                  /could not|blocked|empty/i.test(dueAtHint)
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-emerald-600 dark:text-emerald-300"
                }`}
              >
                {dueAtHint}
              </p>
            ) : null}
          </div>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as TaskPriority)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <div className="md:col-span-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={TASK_ATTACHMENT_ACCEPT}
                className="hidden"
                onChange={onPickFiles}
              />
              <Button
                type="button"
                variant="outline"
                className="inline-flex items-center gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={!courseId || saving}
              >
                <Paperclip className="h-4 w-4" aria-hidden />
                Attach files
              </Button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                PDF, Office, images, zip — stored in this browser (IndexedDB).
              </span>
            </div>
            {pendingFiles.length > 0 ? (
              <ul className="space-y-1 rounded-lg border border-slate-200/90 bg-slate-50/80 p-2 text-xs dark:border-white/10 dark:bg-white/[0.04]">
                {pendingFiles.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{file.name}</span>
                    <button
                      type="button"
                      className="shrink-0 rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
                      onClick={() => removePending(index)}
                      aria-label={`Remove ${file.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {fileHint ? <p className="text-xs text-amber-700 dark:text-amber-300">{fileHint}</p> : null}
          </div>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description"
            className="md:col-span-2 min-h-[100px] rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
          />
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleCreateTask()}
            disabled={!courseId || !title.trim() || saving}
            className={isCommandHeld ? "cmd-save-active" : ""}
          >
            {saving ? "Saving…" : "Save Task"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
