"use client";

import {
  useState,
  useMemo,
  useRef,
  useEffect,
  type ChangeEvent
} from "react";
import { Paperclip, Trash2, Upload, X } from "lucide-react";
import { Button, Panel } from "@/components/ui";
import type { Course, Task, TaskAttachment, TaskPriority, TaskStatus, WorkBlock } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { createId } from "@/lib/id";
import {
  createTaskAttachmentMeta,
  deleteTaskAttachmentBlob,
  getTaskAttachmentBlob,
  saveTaskAttachmentBlob,
  TASK_ATTACHMENT_ACCEPT,
  TASK_ATTACHMENT_MAX_BYTES
} from "@/lib/task-attachment-blobs";
import { toLocalDateInput } from "@/lib/date-format";
import { formatFileBytes } from "@/lib/file-utils";
import { getNextScheduledBlock } from "@/lib/work-block-utils";
import { resolvePanoptoFolderUrl } from "@/lib/panopto-folder-url";

export const TASK_DETAIL_MAX_ATTACHMENTS = 24;

export interface TaskDetailModalProps {
  task: Task;
  courses: Course[];
  workBlocks: WorkBlock[];
  onClose: () => void;
  onSave: (task: Partial<Task> & { id: string }) => void;
}

export function TaskDetailModal({
  task,
  courses,
  workBlocks,
  onClose,
  onSave
}: TaskDetailModalProps) {
  const { user: detailUser } = useAuth();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [courseId, setCourseId] = useState<string | "general">(task.courseId);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueAt, setDueAt] = useState(toLocalDateInput(task.dueAt));
  const [attachments, setAttachments] = useState<TaskAttachment[]>(task.attachments ?? []);
  const [pendingFilesById, setPendingFilesById] = useState<Record<string, File>>({});
  const [attachErr, setAttachErr] = useState<string | null>(null);
  const [blobReady, setBlobReady] = useState<Record<string, boolean>>({});
  const [detailSaving, setDetailSaving] = useState(false);
  const [isCommandHeld, setIsCommandHeld] = useState(false);
  const taskFileInputRef = useRef<HTMLInputElement>(null);

  const attachmentLocalSig = useMemo(() => {
    const attPart = attachments.map((a) => `${a.id}:${a.size}`).join("|");
    const pendPart = Object.keys(pendingFilesById)
      .sort()
      .map((id) => `${id}:${pendingFilesById[id]?.size ?? 0}`)
      .join(",");
    return `${attPart}|${pendPart}`;
  }, [attachments, pendingFilesById]);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setCourseId(task.courseId);
    setStatus(task.status);
    setPriority(task.priority);
    setDueAt(toLocalDateInput(task.dueAt));
    setAttachments(task.attachments ?? []);
    setPendingFilesById({});
    setAttachErr(null);
  }, [task]);

  useEffect(() => {
    let cancelled = false;
    const list = attachments;
    void (async () => {
      await new Promise<void>((r) => queueMicrotask(() => r()));
      const next: Record<string, boolean> = {};
      for (const a of list) {
        if (pendingFilesById[a.id]) {
          next[a.id] = true;
          continue;
        }
        const b = await getTaskAttachmentBlob(detailUser?.id, task.id, a.id);
        next[a.id] = !!(b && b.size > 0);
      }
      if (!cancelled) setBlobReady(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [task.id, attachmentLocalSig, pendingFilesById]);

  const detectedLinks = useMemo(() => {
    const matches = description.match(/https?:\/\/[^\s]+/g) ?? [];
    return Array.from(new Set(matches));
  }, [description]);

  const courseForTask = useMemo(
    () => (courseId === "general" ? undefined : courses.find((c) => c.id === courseId)),
    [courseId, courses]
  );
  const panoptoFolderForTask = useMemo(
    () => (courseForTask ? resolvePanoptoFolderUrl(courseForTask) : undefined),
    [courseForTask]
  );

  const nextBookedBlock = useMemo(() => getNextScheduledBlock(task.id, workBlocks), [task.id, workBlocks]);
  const bookingStatusLabel = nextBookedBlock
    ? `Booked ${new Date(nextBookedBlock.startAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${new Date(nextBookedBlock.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "Still not booked";

  const handleTaskAttachFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const list = Array.from(input.files ?? []);
    input.value = "";
    if (!list.length) return;
    setAttachErr(null);
    for (const file of list) {
      if (file.size > TASK_ATTACHMENT_MAX_BYTES) {
        setAttachErr(
          `"${file.name}" is too large (${formatFileBytes(file.size)}). Max is ${formatFileBytes(TASK_ATTACHMENT_MAX_BYTES)}.`
        );
        return;
      }
    }
    if (attachments.length + list.length > TASK_DETAIL_MAX_ATTACHMENTS) {
      setAttachErr(`At most ${TASK_DETAIL_MAX_ATTACHMENTS} files per task.`);
      return;
    }
    const additions: TaskAttachment[] = [];
    const filesById: Record<string, File> = {};
    for (const file of list) {
      const attId = createId("tatt");
      additions.push(createTaskAttachmentMeta(file, attId));
      filesById[attId] = file;
    }
    setAttachments((prev) => [...prev, ...additions]);
    setPendingFilesById((prev) => ({ ...prev, ...filesById }));
  };

  const removeTaskAttachment = (att: TaskAttachment) => {
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    setPendingFilesById((prev) => {
      if (!prev[att.id]) return prev;
      const next = { ...prev };
      delete next[att.id];
      return next;
    });
    setBlobReady((prev) => {
      const next = { ...prev };
      delete next[att.id];
      return next;
    });
  };

  const openTaskAttachment = async (att: TaskAttachment) => {
    const pending = pendingFilesById[att.id];
    if (pending) {
      const url = URL.createObjectURL(pending);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      return;
    }
    const blob = await getTaskAttachmentBlob(detailUser?.id, task.id, att.id);
    if (!blob?.size) return;
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  };

  async function handleSave() {
    if (detailSaving) return;
    const normalizedDueAt = dueAt
      ? (() => {
          const [year, month, day] = dueAt.split("-").map(Number);
          const date = new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
          return date.toISOString();
        })()
      : undefined;
    setDetailSaving(true);
    setAttachErr(null);
    try {
      for (const a of attachments) {
        const file = pendingFilesById[a.id];
        if (!file) continue;
        await saveTaskAttachmentBlob(detailUser?.id, task.id, a.id, file);
        const verify = await getTaskAttachmentBlob(detailUser?.id, task.id, a.id);
        if (!verify || verify.size < 1) {
          throw new Error("Upload failed or storage is unavailable. Please try again.");
        }
      }
      const prev = task.attachments ?? [];
      for (const p of prev) {
        if (!attachments.some((x) => x.id === p.id)) {
          await deleteTaskAttachmentBlob(detailUser?.id, task.id, p.id);
        }
      }
      onSave({
        id: task.id,
        title: title.trim() || task.title,
        description,
        courseId,
        status,
        priority,
        effort: task.effort,
        dueAt: normalizedDueAt,
        attachments
      });
      setPendingFilesById({});
      onClose();
    } catch (e) {
      setAttachErr(e instanceof Error ? e.message : "Could not update attachments.");
    } finally {
      setDetailSaving(false);
    }
  }

  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey) {
        setIsCommandHeld(true);
      }
      if (event.key !== "Enter") return;
      if (!(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      void handleSave();
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
  }, [title, description, courseId, status, priority, dueAt, task, attachments, pendingFilesById, detailSaving]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!detailSaving) onClose();
      }}
    >
      <Panel
        className="w-full max-w-2xl bg-white/96 dark:bg-[#101317]/96"
        onClick={(event) => event.stopPropagation()}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            if (!(event.metaKey || event.ctrlKey)) return;
            event.preventDefault();
            void handleSave();
          }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold tracking-tight">Task details</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Review and edit this task.</p>
            </div>
            <Button variant="ghost" onClick={onClose} disabled={detailSaving} className="h-10 w-10 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
            <div className="space-y-1.5">
              <input value={dueAt} onChange={(event) => setDueAt(event.target.value)} type="date" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
              <p className="px-1 text-xs text-slate-500 dark:text-slate-400">{bookingStatusLabel}</p>
            </div>
            <select value={courseId} onChange={(event) => setCourseId(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]">
              <option value="general">General</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.code} {course.name}</option>)}
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]">
              <option value="backlog">Backlog</option>
              <option value="next">Next</option>
              <option value="in-progress">In progress</option>
              <option value="done">Done</option>
            </select>
            <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <div className="md:col-span-2 space-y-1.5">
              <label className="block px-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Description
              </label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]"
              />
            </div>
            {panoptoFolderForTask ? (
              <div className="md:col-span-2 rounded-2xl border border-slate-200/80 bg-slate-50/60 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Panopto — course folder
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={panoptoFolderForTask}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex max-w-full items-center gap-1.5 break-all text-sm text-sky-600 underline underline-offset-2 hover:text-sky-500 dark:text-sky-300 dark:hover:text-sky-200"
                  >
                    Open recordings folder
                  </a>
                  {!description.includes(panoptoFolderForTask) ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 px-3 text-xs"
                      onClick={() => {
                        const url = panoptoFolderForTask;
                        setDescription((d) => {
                          if (d.includes(url)) return d;
                          const base = d.trim();
                          const line = `Panopto (course folder): ${url}`;
                          return base ? `${base}\n\n${line}` : line;
                        });
                      }}
                    >
                      Add link to description
                    </Button>
                  ) : null}
                </div>
                <p className="mt-2 text-[10px] leading-snug text-slate-400 dark:text-slate-500">
                  Links inside the description box are plain text; use Open recordings folder or Detected links below to open in a new tab.
                </p>
              </div>
            ) : null}
            {detectedLinks.length > 0 && (
              <div className="md:col-span-2 rounded-2xl border border-slate-200/80 bg-slate-50/60 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Detected links</p>
                <div className="space-y-1">
                  {detectedLinks.map((link) => (
                    <a
                      key={link}
                      href={link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block truncate text-sm text-sky-600 underline underline-offset-2 hover:text-sky-500 dark:text-sky-300 dark:hover:text-sky-200"
                    >
                      {link}
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div className="md:col-span-2 space-y-2 rounded-2xl border border-slate-200/80 bg-slate-50/60 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Files ({attachments.length}/{TASK_DETAIL_MAX_ATTACHMENTS})
                </p>
                <div className="flex items-center gap-2">
                  <input
                    ref={taskFileInputRef}
                    type="file"
                    multiple
                    accept={TASK_ATTACHMENT_ACCEPT}
                    className="hidden"
                    disabled={detailSaving}
                    onChange={handleTaskAttachFiles}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                    disabled={detailSaving || attachments.length >= TASK_DETAIL_MAX_ATTACHMENTS}
                    onClick={() => taskFileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden />
                    Add files
                  </Button>
                </div>
              </div>
              <p className="text-[10px] leading-snug text-slate-400 dark:text-slate-500">
                Stored in this browser (IndexedDB). New files and removals apply when you save. Click a file to preview.
              </p>
              {attachErr ? <p className="text-xs text-rose-600 dark:text-rose-400">{attachErr}</p> : null}
              {attachments.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No files yet. Use Add files for PDFs or docs from your course site.</p>
              ) : (
                <ul className="space-y-1.5">
                  {attachments.map((att) => {
                    const probe = blobReady[att.id];
                    const definitelyMissing = probe === false;
                    return (
                      <li
                        key={att.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-xs dark:border-white/10 dark:bg-[#15181d]/90"
                      >
                        <button
                          type="button"
                          disabled={definitelyMissing}
                          onClick={() => void openTaskAttachment(att)}
                          className={`min-w-0 flex-1 truncate text-left ${definitelyMissing ? "cursor-not-allowed text-slate-400" : "text-sky-600 underline-offset-2 hover:underline dark:text-sky-300"}`}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {att.name}
                          </span>
                          <span className="ml-2 text-[10px] text-slate-400">{formatFileBytes(att.size)}</span>
                          {definitelyMissing ? (
                            <span className="ml-2 text-[10px] text-amber-600 dark:text-amber-400">(missing)</span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className="shrink-0 rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
                          aria-label={`Remove ${att.name}`}
                          onClick={() => void removeTaskAttachment(att)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={detailSaving}>
              Close
            </Button>
            <Button type="submit" disabled={detailSaving} className={isCommandHeld ? "cmd-save-active" : ""}>
              {detailSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
