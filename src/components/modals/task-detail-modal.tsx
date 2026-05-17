"use client";

import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  type ChangeEvent,
  type MouseEvent
} from "react";
import { Pencil, Paperclip, Trash2, Upload, X } from "lucide-react";
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
import { DateTimeLocalPicker } from "@/components/datetime-local-picker";
import { formatDueDateOnly, toLocalDateTimeInputFromIso } from "@/lib/date-format";
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
  const [dueAt, setDueAt] = useState(toLocalDateTimeInputFromIso(task.dueAt));
  const [attachments, setAttachments] = useState<TaskAttachment[]>(task.attachments ?? []);
  const [pendingFilesById, setPendingFilesById] = useState<Record<string, File>>({});
  const [attachErr, setAttachErr] = useState<string | null>(null);
  const [blobReady, setBlobReady] = useState<Record<string, boolean>>({});
  const [detailSaving, setDetailSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isCommandHeld, setIsCommandHeld] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const taskFileInputRef = useRef<HTMLInputElement>(null);

  const attachmentLocalSig = useMemo(() => {
    const attPart = attachments.map((a) => `${a.id}:${a.size}`).join("|");
    const pendPart = Object.keys(pendingFilesById)
      .sort()
      .map((id) => `${id}:${pendingFilesById[id]?.size ?? 0}`)
      .join(",");
    return `${attPart}|${pendPart}`;
  }, [attachments, pendingFilesById]);

  const cancelEdit = useCallback(() => {
    setTitle(task.title);
    setDescription(task.description);
    setCourseId(task.courseId);
    setStatus(task.status);
    setPriority(task.priority);
    setDueAt(toLocalDateTimeInputFromIso(task.dueAt));
    setAttachments(task.attachments ?? []);
    setPendingFilesById({});
    setAttachErr(null);
    setIsEditing(false);
  }, [task]);

  const startEditing = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsEditing(true);
  }, []);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setCourseId(task.courseId);
    setStatus(task.status);
    setPriority(task.priority);
    setDueAt(toLocalDateTimeInputFromIso(task.dueAt));
    setAttachments(task.attachments ?? []);
    setPendingFilesById({});
    setAttachErr(null);
    setIsEditing(false);
  }, [task.id]);

  useEffect(() => {
    if (!isEditing) return;
    const input = titleInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [task.id, isEditing]);

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || detailSaving) return;
      event.stopPropagation();
      if (isEditing) {
        cancelEdit();
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  }, [detailSaving, isEditing, onClose, cancelEdit]);

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
  }, [task.id, attachmentLocalSig, pendingFilesById, detailUser?.id]);

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
    if (detailSaving || !isEditing) return;
    const normalizedDueAt = dueAt ? new Date(dueAt).toISOString() : undefined;
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
      if (!isEditing) return;
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
  }, [title, description, courseId, status, priority, dueAt, task, attachments, pendingFilesById, detailSaving, isEditing]);

  const fieldClass =
    "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]";

  const courseLabel =
    courseId === "general"
      ? "General"
      : courseForTask
        ? `${courseForTask.code} · ${courseForTask.name}`
        : "Unknown course";

  const statusLabel =
    status === "in-progress" ? "In progress" : status.charAt(0).toUpperCase() + status.slice(1);
  const priorityLabel = priority.charAt(0).toUpperCase() + priority.slice(1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-detail-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !detailSaving) onClose();
      }}
    >
      <Panel
        className="flex max-h-[min(92vh,40rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl p-0 bg-white/96 dark:bg-[#101317]/96"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (isEditing) void handleSave();
          }}
        >
          <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200/80 px-5 py-3 dark:border-white/10">
            <div>
              <h3 id="task-detail-title" className="text-base font-semibold tracking-tight">
                Task details
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEditing ? "Edit fields, then save." : "Review what needs to be done."}
              </p>
            </div>
            <Button variant="ghost" onClick={onClose} disabled={detailSaving} className="h-8 w-8 shrink-0 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            <div className="space-y-4">
              {isEditing ? (
                <>
                  <input
                    ref={titleInputRef}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    aria-label="Task title"
                    className={fieldClass}
                  />
                  <div className="space-y-1">
                    <label className="block px-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Due date & time
                    </label>
                    <DateTimeLocalPicker
                      value={dueAt}
                      onChange={setDueAt}
                      disabled={detailSaving}
                      inline
                      compact
                    />
                    <p className="px-0.5 text-xs text-slate-500 dark:text-slate-400">{bookingStatusLabel}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <select value={courseId} onChange={(event) => setCourseId(event.target.value)} className={fieldClass}>
                      <option value="general">General</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.code} {course.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={status}
                      onChange={(event) => setStatus(event.target.value as TaskStatus)}
                      className={fieldClass}
                    >
                      <option value="backlog">Backlog</option>
                      <option value="next">Next</option>
                      <option value="in-progress">In progress</option>
                      <option value="done">Done</option>
                    </select>
                    <select
                      value={priority}
                      onChange={(event) => setPriority(event.target.value as TaskPriority)}
                      className={fieldClass}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block px-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      className={`${fieldClass} min-h-[96px] resize-y`}
                    />
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-50">
                    {title}
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-100/80 px-3 py-1 text-xs font-medium text-slate-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200">
                      {courseForTask ? (
                        <span className="h-2 w-2 rounded-full" style={{ background: courseForTask.color }} aria-hidden />
                      ) : null}
                      {courseLabel}
                    </span>
                    <span className="rounded-full border border-slate-200/80 bg-slate-100/80 px-3 py-1 text-xs font-medium text-slate-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200">
                      Due {formatDueDateOnly(task.dueAt)}
                    </span>
                    <span className="rounded-full border border-slate-200/80 bg-slate-100/80 px-3 py-1 text-xs font-medium text-slate-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200">
                      {statusLabel}
                    </span>
                    <span className="rounded-full border border-slate-200/80 bg-slate-100/80 px-3 py-1 text-xs font-medium text-slate-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200">
                      {priorityLabel}
                    </span>
                    <span className="rounded-full border border-sky-200/80 bg-sky-50/80 px-3 py-1 text-xs text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
                      {bookingStatusLabel}
                    </span>
                  </div>
                  {description.trim() ? (
                    <section className="rounded-xl border border-slate-200/80 bg-slate-50/50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                      <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        What to do
                      </h4>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                        {description}
                      </p>
                    </section>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No description yet.</p>
                  )}
                </>
              )}

              {panoptoFolderForTask ? (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
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
                    {isEditing && !description.includes(panoptoFolderForTask) ? (
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
                </div>
              ) : null}

              {detectedLinks.length > 0 && (
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Links
                  </p>
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

              <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Files ({attachments.length}/{TASK_DETAIL_MAX_ATTACHMENTS})
                  </p>
                  {isEditing ? (
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
                  ) : null}
                </div>
                {isEditing ? (
                  <p className="text-[10px] leading-snug text-slate-400 dark:text-slate-500">
                    Stored in this browser. New files and removals apply when you save.
                  </p>
                ) : null}
                {attachErr ? <p className="text-xs text-rose-600 dark:text-rose-400">{attachErr}</p> : null}
                {attachments.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isEditing ? "No files yet. Use Add files for PDFs or docs from your course site." : "No attachments."}
                  </p>
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
                          {isEditing ? (
                            <button
                              type="button"
                              className="shrink-0 rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
                              aria-label={`Remove ${att.name}`}
                              onClick={() => void removeTaskAttachment(att)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200/80 bg-white/95 px-5 py-3 dark:border-white/10 dark:bg-[#101317]/95">
            {isEditing ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelEdit}
                  disabled={detailSaving}
                  className="h-9 px-4 text-sm"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={detailSaving} className={`h-9 px-4 text-sm ${isCommandHeld ? "cmd-save-active" : ""}`}>
                  {detailSaving ? "Saving…" : "Save task"}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={onClose} disabled={detailSaving} className="h-9 px-4 text-sm">
                  Close
                </Button>
                <Button
                  type="button"
                  onMouseDown={startEditing}
                  onClick={startEditing}
                  disabled={detailSaving}
                  className="inline-flex h-9 items-center gap-1.5 px-4 text-sm active:scale-100"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Edit
                </Button>
              </>
            )}
          </div>
        </form>
      </Panel>
    </div>
  );
}
