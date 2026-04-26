"use client";

import clsx from "clsx";
import { ExternalLink, FileText, Image as ImageIcon, Paperclip, Plus, Presentation, Sparkles, Trash2, Upload, X } from "lucide-react";
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, MouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import { AnkiExportIcon } from "@/components/anki-export-icon";
import { ClassNoteRichEditor, type ClassNoteRichEditorHandle } from "@/components/class-note-rich-editor";
import {
  classNoteBodyToPlainText,
  looksLikeStoredHtml,
  sanitizeClassNoteBodyHtml,
  stripHtmlToPreview
} from "@/lib/class-note-body";
import { extractTextFromPresentationFile } from "@/lib/presentation-text-extract";
import { hydrateClassNoteImagesInRoot } from "@/lib/class-note-image-hydrate";
import {
  CLASS_NOTE_IMAGE_MAX_BYTES,
  CLASS_NOTE_PRESENTATION_ACCEPT,
  CLASS_NOTE_PRESENTATION_MAX_BYTES,
  createClassNoteAttachmentMeta,
  deleteClassNoteAttachmentBlob,
  getClassNoteAttachmentBlob,
  isClassNoteImageAttachment,
  isClassNoteImageFile,
  isPresentationFile,
  saveClassNoteAttachmentBlob
} from "@/lib/class-note-attachment-blobs";
import { formatDateKeyLocal } from "@/lib/date";
import { pushSchoolOsToast } from "@/lib/global-app-toasts";
import { createId } from "@/lib/id";
import { getSupabaseClient } from "@/lib/supabase";
import type { ClassNote, ClassNoteAttachment, ClassNoteEditorTextDir, Course } from "@/lib/types";
import { Badge, Button, Panel } from "@/components/ui";

function softCourseStyle(color: string): CSSProperties {
  return {
    background: `linear-gradient(135deg, ${color}38, ${color}20)`,
    boxShadow: `0 0 0 1px ${color}42, 0 10px 26px ${color}24, inset 0 1px 0 rgba(255,255,255,0.35)`
  };
}

export function defaultClassNoteTitle(occurredOn: string, meetingTitle?: string): string {
  const d = new Date(`${occurredOn}T12:00:00`);
  const label = Number.isNaN(d.getTime())
    ? occurredOn
    : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const mt = meetingTitle?.trim();
  return mt ? `${label} — ${mt}` : `${label} — Class note`;
}

function notePreviewLine(body: string): string {
  if (looksLikeStoredHtml(body)) {
    const t = stripHtmlToPreview(body);
    return t || "No content yet";
  }
  const one = body.replace(/\s+/g, " ").trim();
  if (!one) return "No content yet";
  return one.length > 120 ? `${one.slice(0, 117)}…` : one;
}

function formatFileBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ClassNoteBodyPreview({
  html,
  noteId,
  textDir
}: {
  html: string;
  noteId: string;
  textDir: ClassNoteEditorTextDir;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = sanitizeClassNoteBodyHtml(html);
    return hydrateClassNoteImagesInRoot(el, noteId);
  }, [html, noteId]);

  return (
    <div
      ref={containerRef}
      dir={textDir === "auto" ? "auto" : textDir}
      className="[&_a]:text-sky-600 [&_a]:underline dark:[&_a]:text-sky-400 [&_code]:rounded-md [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs dark:[&_code]:bg-white/10 [&_img]:mx-auto [&_img]:my-2 [&_img]:block [&_img]:max-h-[min(72vh,720px)] [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-slate-200/80 dark:[&_img]:border-white/10 [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
    />
  );
}

const STACK_VISIBLE = 5;

function CourseNotesStack({
  list,
  openNoteId,
  onSelectNote
}: {
  list: ClassNote[];
  openNoteId: string | null;
  onSelectNote: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const onDocPointer = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(event.target as Node)) {
        setExpanded(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const root = rootRef.current;
      if (root && root.contains(document.activeElement)) {
        setExpanded(false);
      }
    };
    document.addEventListener("pointerdown", onDocPointer, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);

  const handleSelect = useCallback(
    (id: string) => {
      setExpanded(false);
      onSelectNote(id);
    },
    [onSelectNote]
  );

  const handleRootMouseLeave = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!expanded) return;
    const rel = event.nativeEvent.relatedTarget;
    if (rel && rel instanceof Node && rootRef.current?.contains(rel)) return;
    setExpanded(false);
  }, [expanded]);

  if (list.length === 0) {
    return <div className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">No notes yet for this course.</div>;
  }

  if (list.length === 1) {
    const note = list[0];
    return (
      <div className="border-t border-slate-200/70 dark:border-white/10">
        <div className="px-5 pb-4 pt-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-sky-200/90 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-900 dark:border-sky-500/35 dark:bg-sky-500/15 dark:text-sky-100">
              1 note in this course
            </span>
          </div>
          <div className="relative mx-auto max-w-full overflow-visible" role="list" aria-label="1 class note in this course">
            <button
              type="button"
              role="listitem"
              onClick={() => handleSelect(note.id)}
              className={clsx(
                "relative left-0 right-0 w-full rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2.5 text-left shadow-md backdrop-blur-sm transition hover:brightness-[1.02] dark:border-white/12 dark:bg-[#15181d]/95",
                openNoteId === note.id && "ring-2 ring-sky-500/50 dark:ring-sky-400/40"
              )}
              style={{ boxShadow: "0 4px 14px rgba(0,0,0,0.12)" }}
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-semibold text-slate-900 dark:text-white">{note.title}</span>
                    {note.status === "draft" ? (
                      <span className="shrink-0 rounded-full border border-amber-200/80 bg-amber-50 px-1.5 py-0 text-[10px] font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                        Draft
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">{note.occurredOn}</span>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const peekCount = Math.min(list.length, STACK_VISIBLE);
  const xStep = list.length <= 3 ? 14 : 11;
  const yStep = list.length <= 3 ? 22 : 16;
  const stackVisualHeight = 54 + (peekCount - 1) * yStep;

  const stackSummaryTitles = list
    .slice(0, 4)
    .map((n) => n.title.trim() || n.occurredOn)
    .join(" · ");
  const stackSummarySuffix = list.length > 4 ? ` · +${list.length - 4} more` : "";

  return (
    <div
      ref={rootRef}
      className="border-t border-slate-200/70 dark:border-white/10"
      onMouseLeave={handleRootMouseLeave}
    >
      {!expanded ? (
        <div
          className="px-5 pb-4 pt-4"
          onMouseEnter={() => setExpanded(true)}
          onFocusCapture={() => setExpanded(true)}
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-sky-200/90 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-900 dark:border-sky-500/35 dark:bg-sky-500/15 dark:text-sky-100">
              {list.length} notes in this course
            </span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Hover stack to expand</p>
          </div>
          <p className="mb-2 line-clamp-2 text-[10px] leading-snug text-slate-500 dark:text-slate-400" title={list.map((n) => n.title).join("\n")}>
            {stackSummaryTitles}
            {stackSummarySuffix}
          </p>
          <div
            className="relative mx-auto max-w-full overflow-visible"
            role="list"
            aria-label={`${list.length} class notes stacked; hover or use Show all to expand`}
            style={{ height: stackVisualHeight }}
          >
            {list.slice(0, STACK_VISIBLE).map((note, i) => (
              <button
                key={note.id}
                type="button"
                role="listitem"
                onClick={() => handleSelect(note.id)}
                className={clsx(
                  "absolute left-0 right-0 rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2.5 text-left shadow-md backdrop-blur-sm transition hover:brightness-[1.02] dark:border-white/12 dark:bg-[#15181d]/95",
                  openNoteId === note.id && "ring-2 ring-sky-500/50 dark:ring-sky-400/40"
                )}
                style={{
                  zIndex: STACK_VISIBLE - i + 1,
                  transform: `translate(${i * xStep}px, ${i * yStep}px)`,
                  boxShadow: "0 4px 14px rgba(0,0,0,0.12)"
                }}
              >
                <div className="flex items-start gap-2">
                  <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-semibold text-slate-900 dark:text-white">{note.title}</span>
                      {note.status === "draft" ? (
                        <span className="shrink-0 rounded-full border border-amber-200/80 bg-amber-50 px-1.5 py-0 text-[10px] font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                          Draft
                        </span>
                      ) : null}
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">{note.occurredOn}</span>
                  </div>
                </div>
              </button>
            ))}
            {list.length > STACK_VISIBLE ? (
              <div
                className="pointer-events-none absolute right-3 top-1 z-[30] rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm dark:bg-white dark:text-slate-900"
                aria-hidden
              >
                +{list.length - STACK_VISIBLE}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="max-h-[min(60vh,480px)] space-y-0 divide-y divide-slate-200/70 overflow-y-auto py-1 dark:divide-white/10">
          {list.map((note) => (
            <NoteRowButton key={note.id} note={note} openNoteId={openNoteId} onSelectNote={handleSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteRowButton({
  note,
  openNoteId,
  onSelectNote
}: {
  note: ClassNote;
  openNoteId: string | null;
  onSelectNote: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectNote(note.id)}
      className={clsx(
        "flex w-full items-start gap-3 px-5 py-3.5 text-left transition hover:bg-slate-50/90 dark:hover:bg-white/[0.04]",
        openNoteId === note.id && "bg-slate-50 dark:bg-white/[0.06]"
      )}
    >
      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-slate-900 dark:text-white">{note.title}</span>
          <Badge
            className={
              note.status === "draft"
                ? "border-amber-200/80 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
                : ""
            }
          >
            {note.status === "draft" ? "Draft" : "Saved"}
          </Badge>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">{note.occurredOn}</span>
          {(note.attachments ?? []).length > 0 ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
              <Presentation className="h-3 w-3" aria-hidden />
              {(note.attachments ?? []).length}
            </span>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{notePreviewLine(note.bodyMarkdown)}</p>
      </div>
    </button>
  );
}

function ClassNoteAttachmentsBar({
  note,
  onUpdateNote,
  onGenerateFromAttachment,
  generatingAttachmentId,
  summaryError
}: {
  note: ClassNote;
  onUpdateNote: (payload: Partial<ClassNote> & { id: string }) => void;
  onGenerateFromAttachment: (att: ClassNoteAttachment) => Promise<void>;
  generatingAttachmentId: string | null;
  summaryError: string | null;
}) {
  const deckFileRef = useRef<HTMLInputElement>(null);
  const deckInputId = useId();
  const noteRef = useRef(note);
  noteRef.current = note;
  const [deckBusy, setDeckBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(false);
  const [blobReady, setBlobReady] = useState<Record<string, boolean>>({});
  const attachments = note.attachments ?? [];
  const attachmentSig = useMemo(() => attachments.map((a) => `${a.id}:${a.size}`).join("|"), [attachments]);

  useEffect(() => {
    if (!uploadSuccess) return;
    const t = window.setTimeout(() => setUploadSuccess(null), 5000);
    return () => window.clearTimeout(t);
  }, [uploadSuccess]);

  useEffect(() => {
    if ((note.attachments ?? []).length > 0) {
      setAttachmentsExpanded(true);
    }
  }, [note.attachments]);

  useEffect(() => {
    let cancelled = false;
    const list = note.attachments ?? [];
    void (async () => {
      await new Promise<void>((r) => queueMicrotask(() => r()));
      const next: Record<string, boolean> = {};
      for (const a of list) {
        const b = await getClassNoteAttachmentBlob(note.id, a.id);
        next[a.id] = !!(b && b.size > 0);
      }
      if (!cancelled) setBlobReady(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [note.id, attachmentSig]);

  const handlePresentationFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const list = Array.from(input.files ?? []);
    input.value = "";
    if (!list.length) return;
    setErr(null);
    for (const file of list) {
      if (!isPresentationFile(file)) {
        const kind = file.type || "unknown type";
        setErr(
          `"${file.name}" (${kind}) is not supported. Use PDF, PowerPoint (.ppt / .pps / .pptx / .ppsx), Keynote (.key), or Impress (.odp).`
        );
        return;
      }
      if (file.size > CLASS_NOTE_PRESENTATION_MAX_BYTES) {
        setErr(
          `"${file.name}" is too large (${formatFileBytes(file.size)}). Max per file is ${formatFileBytes(CLASS_NOTE_PRESENTATION_MAX_BYTES)}.`
        );
        return;
      }
    }
    setDeckBusy(true);
    try {
      const meta: ClassNoteAttachment[] = [];
      const n = noteRef.current;
      for (const file of list) {
        const attId = createId("att");
        await saveClassNoteAttachmentBlob(n.id, attId, file);
        const verify = await getClassNoteAttachmentBlob(n.id, attId);
        if (!verify || verify.size < 1) {
          throw new Error("Storage wrote nothing readable (private mode, full disk, or blocked IndexedDB).");
        }
        meta.push(createClassNoteAttachmentMeta(file, attId));
      }
      const merged = [...(n.attachments ?? []), ...meta];
      onUpdateNote({ id: n.id, attachments: merged });
      setBlobReady((prev) => {
        const next = { ...prev };
        for (const m of meta) next[m.id] = true;
        return next;
      });
      setUploadSuccess(
        meta.length === 1
          ? `Attached: ${meta[0].name} — click the file below to open it.`
          : `Attached ${meta.length} files — click a file below to open it.`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(
        msg
          ? `Could not save the file: ${msg}`
          : "Could not store the file in this browser. Check site storage permissions."
      );
    } finally {
      setDeckBusy(false);
    }
  };

  const removeAttachment = async (att: ClassNoteAttachment) => {
    const n = noteRef.current;
    await deleteClassNoteAttachmentBlob(n.id, att.id).catch(() => {});
    onUpdateNote({
      id: n.id,
      attachments: (n.attachments ?? []).filter((a) => a.id !== att.id)
    });
    setBlobReady((prev) => {
      const next = { ...prev };
      delete next[att.id];
      return next;
    });
  };

  const openAttachment = async (att: ClassNoteAttachment) => {
    const blob = await getClassNoteAttachmentBlob(noteRef.current.id, att.id);
    if (!blob?.size) return;
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  };

  const renderRow = (att: ClassNoteAttachment, showAi: boolean) => {
    const probe = blobReady[att.id];
    const definitelyMissing = probe === false;
    const verified = probe === true;
    const isImg = isClassNoteImageAttachment(att);
    return (
      <li
        key={att.id}
        className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-white/90 p-2 text-xs dark:border-white/10 dark:bg-[#15181d]/95 sm:flex-row sm:items-stretch sm:gap-0 sm:p-0"
      >
        <button
          type="button"
          disabled={definitelyMissing}
          onClick={() => void openAttachment(att)}
          className={clsx(
            "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-left transition sm:py-2.5",
            definitelyMissing
              ? "cursor-not-allowed opacity-70"
              : "cursor-pointer hover:bg-sky-500/10 dark:hover:bg-sky-400/10"
          )}
        >
          {isImg ? (
            <ImageIcon className="h-4 w-4 shrink-0 text-sky-500 dark:text-sky-400" aria-hidden />
          ) : (
            <Paperclip className="h-4 w-4 shrink-0 text-sky-500 dark:text-sky-400" aria-hidden />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-sky-700 underline decoration-sky-500/50 underline-offset-2 dark:text-sky-200">
              {att.name}
            </span>
            <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
              {formatFileBytes(att.size)}
              {definitelyMissing
                ? " · File not stored on this device"
                : verified
                  ? " · Click to open in a new tab"
                  : " · Click to open (verifying…)"}
            </span>
          </span>
          {!definitelyMissing ? (
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-sky-500 dark:text-sky-400" aria-hidden />
          ) : null}
        </button>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200/80 pt-2 sm:border-t-0 sm:border-l sm:border-slate-200/80 sm:px-2 sm:py-1.5 dark:border-white/10">
          {showAi ? (
            <button
              type="button"
              disabled={!verified || generatingAttachmentId === att.id}
              onClick={() => void onGenerateFromAttachment(att)}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-xl border-2 border-amber-400/95 bg-gradient-to-br from-amber-400/35 via-orange-500/30 to-amber-600/35 px-3 py-2 text-[11px] font-bold text-amber-950 shadow-[0_0_20px_rgba(251,146,60,0.7),0_0_42px_rgba(249,115,22,0.35)] transition hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-400/55 dark:from-amber-500/30 dark:via-orange-600/35 dark:to-amber-700/35 dark:text-amber-50 dark:shadow-[0_0_24px_rgba(251,146,60,0.5),0_0_52px_rgba(234,88,12,0.28)]"
              )}
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {generatingAttachmentId === att.id ? "מייצר…" : "סיכום AI"}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={`Remove ${att.name}`}
            onClick={() => void removeAttachment(att)}
            className="rounded-lg p-2.5 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </li>
    );
  };

  return (
    <div className="shrink-0 border-t border-slate-200/80 bg-slate-50/30 px-4 py-2 dark:border-white/10 dark:bg-black/15 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
          <span className="flex items-center gap-1.5">
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-sky-500 dark:text-sky-400" aria-hidden />
            <Presentation className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            Presentations
          </span>
          {attachments.length > 0 ? (
            <Badge className="border-sky-200/80 bg-sky-50 text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-100">
              {attachments.length}
            </Badge>
          ) : null}
          <button
            type="button"
            onClick={() => setAttachmentsExpanded((v) => !v)}
            className="rounded-full border border-slate-200/80 bg-white/70 px-2 py-0.5 text-[11px] text-slate-600 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.06]"
          >
            {attachmentsExpanded ? "Hide" : "Show"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={deckFileRef}
            id={deckInputId}
            type="file"
            multiple
            disabled={deckBusy}
            className="sr-only"
            accept={CLASS_NOTE_PRESENTATION_ACCEPT}
            onChange={handlePresentationFiles}
          />
          <label
            htmlFor={deckInputId}
            className={clsx(
              "inline-flex h-8 cursor-pointer select-none items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200 dark:hover:bg-white/[0.06]",
              deckBusy && "pointer-events-none cursor-wait opacity-60"
            )}
          >
            <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {deckBusy ? "Uploading…" : "Upload"}
          </label>
        </div>
      </div>
      {attachmentsExpanded ? (
        <>
          <p className="mt-1 text-[10px] leading-snug text-slate-400 dark:text-slate-500">
            Decks / PDFs: upload above. Screenshots: paste or use the image button (max {formatFileBytes(CLASS_NOTE_IMAGE_MAX_BYTES)}).
          </p>
          {uploadSuccess ? (
            <p className="mt-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-3 py-1.5 text-xs text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-100">
              {uploadSuccess}
            </p>
          ) : null}
          {err ? <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{err}</p> : null}
          {summaryError ? (
            <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{summaryError}</p>
          ) : null}

          <ul className="mt-2 space-y-2" aria-label="Attached files">
            {attachments.length === 0 ? (
              <li className="rounded-xl border border-dashed border-slate-300/80 px-3 py-2 text-center text-xs text-slate-500 dark:border-white/15 dark:text-slate-400">
                No files yet. Use <span className="font-medium text-slate-700 dark:text-slate-200">Upload</span> or paste images in the editor.
              </li>
            ) : (
              attachments.map((att) => renderRow(att, !isClassNoteImageAttachment(att)))
            )}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function ClassNoteFullscreenEditor({
  note,
  course,
  editorTab,
  setEditorTab,
  onUpdateNote,
  onDeleteNote,
  onPublishNote,
  onClose
}: {
  note: ClassNote;
  course?: Course;
  editorTab: "write" | "preview";
  setEditorTab: (tab: "write" | "preview") => void;
  onUpdateNote: (payload: Partial<ClassNote> & { id: string }) => void;
  onDeleteNote: (id: string) => void;
  onPublishNote: (id: string) => void;
  onClose: () => void;
}) {
  const courseLine = course ? [course.code, course.name].filter(Boolean).join(" · ") : undefined;
  const attachmentCount = (note.attachments ?? []).length;
  const richEditorRef = useRef<ClassNoteRichEditorHandle>(null);
  const noteRef = useRef(note);
  noteRef.current = note;
  const [generatingAttachmentId, setGeneratingAttachmentId] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [ankiExportInFlight, setAnkiExportInFlight] = useState(false);
  const [ankiGuidanceOpen, setAnkiGuidanceOpen] = useState(false);
  const [ankiCsvError, setAnkiCsvError] = useState<string | null>(null);
  const ankiExportLockRef = useRef(false);
  const editorMountedRef = useRef(true);
  useEffect(() => {
    editorMountedRef.current = true;
    return () => {
      editorMountedRef.current = false;
    };
  }, []);

  const ankiSourceText = classNoteBodyToPlainText(note.bodyMarkdown).trim();
  const hasAnkiSourceText = ankiSourceText.length > 0;

  const getAiAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error(
        "AI features require a signed-in account and Supabase auth is currently unavailable."
      );
    }
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) {
      throw new Error("Please sign in to use AI features.");
    }
    return { Authorization: `Bearer ${data.session.access_token}` };
  }, []);

  const handleAnkiCsvDownload = useCallback(() => {
    if (ankiExportLockRef.current) {
      pushSchoolOsToast({
        kind: "success",
        message: "Anki export is already running in the background."
      });
      return;
    }
    if (!ankiSourceText) {
      const msg = "Add some note text first, then generate Anki CSV.";
      setAnkiCsvError(msg);
      pushSchoolOsToast({ kind: "error", message: msg });
      return;
    }
    ankiExportLockRef.current = true;
    setAnkiCsvError(null);
    setAnkiGuidanceOpen(true);
    setAnkiExportInFlight(true);
    pushSchoolOsToast({
      kind: "success",
      message: "Started Anki CSV export in the background. You can keep working."
    });

    const bodyMarkdown = note.bodyMarkdown;
    const noteTitle = note.title;
    const occurredOn = note.occurredOn;
    const courseName = course?.name ?? "";
    const courseCode = course?.code ?? "";

    void (async () => {
      try {
        const authHeaders = await getAiAuthHeaders();
        const res = await fetch(`${window.location.origin}/api/class-notes/anki-csv`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            bodyMarkdown,
            noteTitle,
            courseName,
            courseCode,
            occurredOn
          })
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (res.status === 401) {
            throw new Error("Please sign in to use AI features.");
          }
          throw new Error(typeof data.error === "string" ? data.error : res.statusText);
        }
        const cardCount = Number(res.headers.get("X-Card-Count") ?? 0);
        const blob = await res.blob();
        const base = noteTitle
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 48);
        const codePart = courseCode
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 16);
        const countPart = cardCount > 0 ? `${cardCount}cards` : "cards";
        const fname = `anki-${codePart || "course"}-${base || "class-note"}-${countPart}.csv`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fname;
        a.rel = "noopener";
        a.click();
        URL.revokeObjectURL(url);
        pushSchoolOsToast({
          kind: "success",
          message: "Anki CSV is ready — your download should start. You can keep working; this notice fades on its own."
        });
        if (cardCount > 0 && cardCount < 35) {
          pushSchoolOsToast({
            kind: "success",
            message: `Exported ${cardCount} cards — this note was shorter than the 35-card target.`
          });
        }
      } catch (e) {
        const net =
          e instanceof TypeError &&
          (e.message === "Failed to fetch" || e.message === "Load failed" || e.message.includes("fetch"));
        const longMsg = net
          ? "Network error (Failed to fetch): the browser could not reach your Next server. Start or restart `npm run dev`, open the app from the same URL (e.g. http://localhost:3000), and avoid mixing http vs https or 127.0.0.1 vs localhost unless you always use the same one. Ad blockers can sometimes block API calls—try disabling for this site."
          : e instanceof Error
            ? e.message
            : String(e);
        if (editorMountedRef.current) {
          setAnkiCsvError(longMsg);
        }
        pushSchoolOsToast({
          kind: "error",
          message: net ? "Anki export failed: network error (could not reach the server)." : `Anki export failed: ${e instanceof Error ? e.message : String(e)}`
        });
      } finally {
        ankiExportLockRef.current = false;
        if (editorMountedRef.current) {
          setAnkiExportInFlight(false);
        }
      }
    })();
  }, [ankiSourceText, course?.code, course?.name, getAiAuthHeaders, note.bodyMarkdown, note.occurredOn, note.title]);

  const handleRegisterEmbeddedImage = useCallback(
    async (file: File) => {
      if (!isClassNoteImageFile(file) || file.size > CLASS_NOTE_IMAGE_MAX_BYTES) return null;
      const n = noteRef.current;
      const attId = createId("att");
      try {
        await saveClassNoteAttachmentBlob(n.id, attId, file);
        const verify = await getClassNoteAttachmentBlob(n.id, attId);
        if (!verify || verify.size < 1) return null;
        const meta = createClassNoteAttachmentMeta(file, attId);
        const merged = [...(n.attachments ?? []), meta];
        onUpdateNote({ id: n.id, attachments: merged });
        noteRef.current = { ...n, attachments: merged };
        return attId;
      } catch {
        return null;
      }
    },
    [onUpdateNote]
  );

  const handleGenerateFromAttachment = useCallback(
    async (att: ClassNoteAttachment) => {
      if (isClassNoteImageAttachment(att)) return;
      setSummaryError(null);
      setGeneratingAttachmentId(att.id);
      try {
        const blob = await getClassNoteAttachmentBlob(note.id, att.id);
        if (!blob?.size) {
          throw new Error("הקובץ לא נמצא במכשיר הזה.");
        }
        const text = await extractTextFromPresentationFile(blob, att.name, att.mimeType);
        if (!text.trim()) {
          throw new Error(
            "לא נמצא טקסט בקובץ (אולי סריקת תמונה בלבד). נסו PDF עם טקסט נבחר או PPTX."
          );
        }
        const authHeaders = await getAiAuthHeaders();
        const res = await fetch("/api/class-notes/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            sourceText: text,
            noteTitle: note.title,
            courseName: course?.name ?? ""
          })
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; html?: string };
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error("Please sign in to use AI features.");
          }
          throw new Error(typeof data.error === "string" ? data.error : res.statusText);
        }
        const html = data.html;
        if (!html?.trim()) {
          throw new Error("השרת החזיר תשובה ריקה.");
        }
        richEditorRef.current?.insertAiSummaryHtml(html);
        setEditorTab("write");
      } catch (e) {
        setSummaryError(e instanceof Error ? e.message : String(e));
      } finally {
        setGeneratingAttachmentId(null);
      }
    },
    [course?.name, getAiAuthHeaders, note.id, note.title, setEditorTab]
  );

  return (
    <div
      className="fixed inset-0 z-[52] flex flex-col bg-[linear-gradient(180deg,#f7f8fa_0%,#f4f5f7_100%)] text-slate-900 dark:bg-[linear-gradient(180deg,#090b0d_0%,#0d1014_100%)] dark:text-slate-100"
      role="dialog"
      aria-modal="true"
      aria-labelledby="class-note-title"
    >
      {ankiGuidanceOpen ? (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setAnkiGuidanceOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="anki-export-guidance-title"
            className="max-w-md rounded-2xl border border-slate-200/90 bg-white p-5 text-slate-900 shadow-2xl dark:border-white/10 dark:bg-[#12151a] dark:text-slate-100"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 id="anki-export-guidance-title" className="text-base font-semibold">
              Anki export running
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              We&apos;re generating your CSV in the background. You can keep editing this note, switch views, or work elsewhere in School OS — nothing else is blocked.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              When the file is ready, your browser will start the download and a short notification will appear (also if something goes wrong).
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAnkiGuidanceOpen(false)}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="mx-auto flex h-[100dvh] min-h-0 w-full max-w-[56rem] flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200/80 px-5 py-4 dark:border-white/10 sm:px-8">
          <div className="min-w-0 flex-1">
            {courseLine ? (
              <p dir="auto" className="mb-1 truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                {courseLine}
              </p>
            ) : null}
            <input
              id="class-note-title"
              value={note.title}
              onChange={(e) => onUpdateNote({ id: note.id, title: e.target.value })}
              className="min-w-0 w-full border-0 bg-transparent text-base font-semibold text-slate-900 outline-none dark:text-white sm:text-lg"
              dir="auto"
              placeholder="Title"
            />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {attachmentCount > 0 ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-sky-200/90 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-900 dark:border-sky-500/35 dark:bg-sky-500/15 dark:text-sky-100"
                title={`${attachmentCount} file(s) attached — scroll down for presentations & screenshots`}
              >
                <Paperclip className="h-3.5 w-3.5" aria-hidden />
                {attachmentCount}
              </span>
            ) : null}
            <button
              type="button"
              disabled={ankiExportInFlight}
              aria-label={ankiExportInFlight ? "Generating Anki CSV…" : "Download Anki CSV"}
              title={
                hasAnkiSourceText
                  ? "AI → Anki CSV in the background (Front, Back, Tags + course number). Import with “Allow HTML in fields” and a Basic note type; drop the CourseNumber column in Anki if you map only three fields."
                  : "Add note content first"
              }
              onClick={handleAnkiCsvDownload}
              className={clsx(
                "rounded-full p-2 text-sky-600 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-40 dark:text-sky-400"
              )}
            >
              <AnkiExportIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Close editor"
              onClick={onClose}
              className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {ankiCsvError ? (
          <p className="shrink-0 border-b border-rose-200/80 bg-rose-50/90 px-5 py-2 text-xs text-rose-800 dark:border-rose-500/25 dark:bg-rose-950/40 dark:text-rose-200 sm:px-8">
            {ankiCsvError}
          </p>
        ) : null}
        <div className="flex shrink-0 border-b border-slate-200/80 px-3 dark:border-white/10 sm:px-6">
          <button
            type="button"
            onClick={() => setEditorTab("write")}
            className={clsx(
              "flex-1 rounded-none border-b-2 py-2.5 text-sm font-medium transition",
              editorTab === "write"
                ? "border-slate-900 text-slate-900 dark:border-white dark:text-white"
                : "border-transparent text-slate-500 dark:text-slate-400"
            )}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setEditorTab("preview")}
            className={clsx(
              "flex-1 rounded-none border-b-2 py-2.5 text-sm font-medium transition",
              editorTab === "preview"
                ? "border-slate-900 text-slate-900 dark:border-white dark:text-white"
                : "border-transparent text-slate-500 dark:text-slate-400"
            )}
          >
            Preview
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex flex-col p-4 sm:p-6 sm:px-8">
            {editorTab === "write" ? (
              <ClassNoteRichEditor
                ref={richEditorRef}
                key={note.id}
                noteId={note.id}
                onRegisterEmbeddedImage={handleRegisterEmbeddedImage}
                body={note.bodyMarkdown}
                onBodyChange={(html) => onUpdateNote({ id: note.id, bodyMarkdown: html })}
                placeholder="Write your class summary…"
                textDir={note.editorTextDir ?? "auto"}
                onTextDirChange={(dir) => onUpdateNote({ id: note.id, editorTextDir: dir })}
              />
            ) : (
              <div className="prose-note-preview min-h-[min(42vh,360px)] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/40 p-4 text-sm leading-relaxed text-slate-800 dark:border-white/10 dark:bg-black/15 dark:text-slate-100 sm:min-h-[min(38vh,320px)] sm:p-5 [&_a]:text-sky-600 [&_a]:underline dark:[&_a]:text-sky-400">
                {note.bodyMarkdown.trim() ? (
                  looksLikeStoredHtml(note.bodyMarkdown) ? (
                    <ClassNoteBodyPreview
                      html={note.bodyMarkdown}
                      noteId={note.id}
                      textDir={note.editorTextDir ?? "auto"}
                    />
                  ) : (
                    <div className="[&_a]:text-sky-600 [&_a]:underline dark:[&_a]:text-sky-400 [&_code]:rounded-md [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs dark:[&_code]:bg-white/10 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
                      <ReactMarkdown>{note.bodyMarkdown}</ReactMarkdown>
                    </div>
                  )
                ) : (
                  <p className="text-sm text-slate-400">Nothing to preview yet.</p>
                )}
              </div>
            )}
          </div>
          <ClassNoteAttachmentsBar
            note={note}
            onUpdateNote={onUpdateNote}
            onGenerateFromAttachment={handleGenerateFromAttachment}
            generatingAttachmentId={generatingAttachmentId}
            summaryError={summaryError}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 px-4 py-2 dark:border-white/10 sm:px-8">
          <p className="text-[10px] text-slate-400 dark:text-slate-500">Auto-saved locally</p>
          <div className="flex flex-wrap items-center gap-2">
            {note.status === "draft" ? (
              <>
                <Button
                  onClick={() => onPublishNote(note.id)}
                  className="min-w-[142px] py-1.5 shadow-[0_0_24px_rgba(56,189,248,0.35)] dark:shadow-[0_0_28px_rgba(56,189,248,0.22)]"
                >
                  Save to course
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm("Discard this draft?")) {
                      onDeleteNote(note.id);
                      onClose();
                    }
                  }}
                  className="text-rose-600 hover:text-rose-700 dark:text-rose-400"
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Discard
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                onClick={() => {
                  if (window.confirm("Delete this saved note?")) {
                    onDeleteNote(note.id);
                    onClose();
                  }
                }}
                className="text-rose-600 hover:text-rose-700 dark:text-rose-400"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

export type ClassNotesPanelProps = {
  courses: Course[];
  classNotes: ClassNote[];
  /** Controlled selection of which note is open in the editor (null = list only). */
  openNoteId: string | null;
  onOpenNote: (id: string | null) => void;
  /** Create a new note; must return the new note id. */
  onCreateNote: (input: {
    id: string;
    courseId: string;
    occurredOn: string;
    meetingId?: string;
    title: string;
    bodyMarkdown?: string;
    status?: ClassNote["status"];
  }) => void;
  onUpdateNote: (payload: Partial<ClassNote> & { id: string }) => void;
  onDeleteNote: (id: string) => void;
  onPublishNote: (id: string) => void;
};

function ClassNotesPanelInner({
  courses,
  classNotes,
  openNoteId,
  onOpenNote,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onPublishNote
}: ClassNotesPanelProps) {
  const [editorTab, setEditorTab] = useState<"write" | "preview">("write");
  const activeCourses = useMemo(() => courses.filter((c) => !c.archived), [courses]);

  const notesByCourse = useMemo(() => {
    const map = new Map<string, ClassNote[]>();
    for (const note of classNotes) {
      const arr = map.get(note.courseId) ?? [];
      arr.push(note);
      map.set(note.courseId, arr);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => {
        const t = b.occurredOn.localeCompare(a.occurredOn);
        if (t !== 0) return t;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
    }
    return map;
  }, [classNotes]);

  const openNote = openNoteId ? classNotes.find((n) => n.id === openNoteId) : undefined;
  const openCourse = openNote ? activeCourses.find((c) => c.id === openNote.courseId) : undefined;

  useEffect(() => {
    if (openNoteId && !openNote) {
      onOpenNote(null);
    }
  }, [openNote, openNoteId, onOpenNote]);

  useEffect(() => {
    if (!openNote) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [openNote]);

  useEffect(() => {
    if (!openNote) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenNote(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openNote, onOpenNote]);

  const handleAddManual = useCallback(
    (courseId: string) => {
      const occurredOn = formatDateKeyLocal(new Date());
      const id = createId("cnote");
      onCreateNote({
        id,
        courseId,
        occurredOn,
        title: defaultClassNoteTitle(occurredOn),
        bodyMarkdown: "",
        status: "draft"
      });
      onOpenNote(id);
      setEditorTab("write");
    },
    [onCreateNote, onOpenNote]
  );

  return (
    <>
      {openNote ? (
        <ClassNoteFullscreenEditor
          key={openNote.id}
          note={openNote}
          course={openCourse}
          editorTab={editorTab}
          setEditorTab={setEditorTab}
          onUpdateNote={onUpdateNote}
          onDeleteNote={onDeleteNote}
          onPublishNote={onPublishNote}
          onClose={() => onOpenNote(null)}
        />
      ) : null}

      {!openNote ? (
        <div className="space-y-6">
          <p className="max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Lecture summaries grouped by course. Open a session from the calendar to start a dated draft, or use + on a course
            for a quick manual entry.
          </p>

          <div className="max-w-3xl space-y-4">
            {activeCourses.length === 0 ? (
              <Panel className="p-6 text-sm text-slate-500 dark:text-slate-400">Add a course to start collecting class notes.</Panel>
            ) : (
              activeCourses.map((course) => {
                const list = notesByCourse.get(course.id) ?? [];
                return (
                  <Panel key={course.id} className="overflow-visible p-0">
                    <div
                      className="flex items-start justify-between gap-3 border-b border-slate-200/80 px-5 py-4 dark:border-white/10"
                      style={softCourseStyle(course.color)}
                    >
                      <div className="min-w-0" dir="auto">
                        <p className="truncate text-base font-semibold text-slate-900 dark:text-white">{course.name}</p>
                        <p className="text-sm text-slate-600 dark:text-white/80">{course.code}</p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Add class note for ${course.name}`}
                        onClick={() => handleAddManual(course.id)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/40 bg-white/80 text-slate-900 shadow-sm transition hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                    <CourseNotesStack
                      list={list}
                      openNoteId={openNoteId}
                      onSelectNote={(id) => {
                        onOpenNote(id);
                        setEditorTab("write");
                      }}
                    />
                  </Panel>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

export const ClassNotesPanel = memo(ClassNotesPanelInner);
