"use client";

import ListKeymap from "@tiptap/extension-list-keymap";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { TextAlign } from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { ClassNoteTextStyle } from "@/lib/tiptap-class-note-text-style";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import clsx from "clsx";
import DOMPurify from "dompurify";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  Code2,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Languages,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2
} from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { ClassNoteEditorTextDir } from "@/lib/types";
import { initialEditorHtml } from "@/lib/class-note-body";
import { CLASS_NOTE_IMAGE_ACCEPT, CLASS_NOTE_IMAGE_MAX_BYTES, isClassNoteImageFile } from "@/lib/class-note-attachment-blobs";
import { ClassNoteImage } from "@/lib/tiptap-class-note-image";

export type ClassNoteRichEditorHandle = {
  /** Appends a horizontal rule and sanitized HTML at the end of the document. */
  insertAiSummaryHtml: (html: string) => void;
  /** Inserts an embedded screenshot node (attachment must already exist in IndexedDB + note.attachments). */
  insertClassNoteImage: (attachmentId: string, alt?: string) => void;
};

type ClassNoteRichEditorProps = {
  noteId: string;
  /** Save image bytes + metadata; return attachment id, or null on failure. */
  onRegisterEmbeddedImage: (file: File) => Promise<string | null>;
  body: string;
  onBodyChange: (html: string) => void;
  placeholder: string;
  textDir: ClassNoteEditorTextDir;
  onTextDirChange: (dir: ClassNoteEditorTextDir) => void;
};

function ToolbarBtn({
  title,
  onAction,
  active,
  disabled,
  children
}: {
  title: string;
  onAction: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onAction}
      className={clsx(
        "rounded-lg p-2 text-slate-600 transition hover:bg-slate-200/80 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-white/10",
        active && "bg-sky-500/20 text-sky-800 dark:bg-sky-500/20 dark:text-sky-100"
      )}
    >
      {children}
    </button>
  );
}

const DIR_ORDER: ClassNoteEditorTextDir[] = ["auto", "ltr", "rtl"];

function dirLabel(d: ClassNoteEditorTextDir): string {
  if (d === "rtl") return "RTL";
  if (d === "ltr") return "LTR";
  return "Auto";
}

function sanitizeAiHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "ul", "ol", "li", "strong", "em", "br", "hr"],
    ALLOWED_ATTR: ["dir"]
  });
}

/** Word/Docs-style body sizes (stored as `pt` on the textStyle mark). */
const FONT_SIZE_PT = ["9", "10", "11", "12", "14", "16", "18", "20", "24", "28", "36"] as const;
const FONT_SIZE_PT_VALUES = new Set(FONT_SIZE_PT.map((n) => `${n}pt`));

function FontSizeSelect({ editor }: { editor: Editor }) {
  const rawSize = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      const fs = (ed.getAttributes("textStyle").fontSize as string | undefined)?.trim() ?? "";
      return fs;
    }
  });

  const value = rawSize && FONT_SIZE_PT_VALUES.has(rawSize) ? rawSize : "";

  return (
    <select
      aria-label="Font size"
      title="Font size"
      className="h-8 min-w-[3.25rem] shrink-0 cursor-pointer rounded-md border border-slate-200/90 bg-white px-1.5 text-center text-xs font-medium text-slate-800 shadow-sm outline-none ring-sky-500/30 focus:ring-2 dark:border-white/15 dark:bg-[#1a1d22] dark:text-slate-100"
      value={value}
      onMouseDown={(e) => e.preventDefault()}
      onChange={(e) => {
        const v = e.target.value;
        const chain = editor.chain().focus();
        if (!v) {
          chain.extendMarkRange("textStyle").unsetMark("textStyle").run();
        } else {
          chain.setMark("textStyle", { fontSize: v }).run();
        }
      }}
    >
      <option value="">Auto</option>
      {FONT_SIZE_PT.map((n) => (
        <option key={n} value={`${n}pt`}>
          {n}
        </option>
      ))}
    </select>
  );
}

export const ClassNoteRichEditor = forwardRef<ClassNoteRichEditorHandle, ClassNoteRichEditorProps>(
  function ClassNoteRichEditor({ noteId, onRegisterEmbeddedImage, body, onBodyChange, placeholder, textDir, onTextDirChange }, ref) {
    const registerImageRef = useRef(onRegisterEmbeddedImage);
    registerImageRef.current = onRegisterEmbeddedImage;
    const imageFileRef = useRef<HTMLInputElement>(null);

    const extensions = useMemo(
      () => [
        StarterKit.configure({
          heading: false
        }),
        ClassNoteTextStyle,
        Underline,
        TextAlign.configure({ types: ["paragraph", "listItem"] }),
        Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
        Placeholder.configure({ placeholder }),
        ListKeymap,
        ClassNoteImage
      ],
      [placeholder]
    );

    const editor = useEditor({
      immediatelyRender: false,
      extensions,
      content: initialEditorHtml(body),
      editorProps: {
        attributes: {
          class:
            "prose-note-editor max-w-none px-3 py-2 text-sm leading-relaxed text-slate-800 focus:outline-none dark:text-slate-100",
          dir: textDir,
          spellCheck: "true"
        }
      },
      onUpdate: ({ editor: ed }) => {
        onBodyChange(ed.getHTML());
      }
    });

    useImperativeHandle(
      ref,
      () => ({
        insertAiSummaryHtml(html: string) {
          const ed = editor;
          if (!ed) return;
          const safe = sanitizeAiHtml(html);
          if (!safe.trim()) return;
          ed.chain()
            .focus("end")
            .insertContent("<hr />")
            .insertContent('<p dir="rtl"><strong>סיכום AI מהמצגת</strong></p>')
            .insertContent(safe)
            .run();
        },
        insertClassNoteImage(attachmentId: string, alt?: string) {
          const ed = editor;
          if (!ed) return;
          ed.chain()
            .focus()
            .insertContent({
              type: "classNoteImage",
              attrs: { attachmentId, alt: alt?.trim() || "Screenshot" }
            })
            .run();
        }
      }),
      [editor]
    );

    useEffect(() => {
      if (!editor) return;
      const stor = editor.storage as { classNoteImage?: { noteId: string } };
      stor.classNoteImage!.noteId = noteId;
    }, [editor, noteId]);

    useEffect(() => {
      if (!editor) return;
      const base = editor.options.editorProps ?? {};
      const prevAttrs = (base.attributes ?? {}) as Record<string, string>;
      editor.setOptions({
        editorProps: {
          ...base,
          attributes: {
            ...prevAttrs,
            class:
              "prose-note-editor max-w-none px-3 py-2 text-sm leading-relaxed text-slate-800 focus:outline-none dark:text-slate-100",
            dir: textDir,
            spellCheck: "true"
          },
          handlePaste(view, event) {
            const cd = event.clipboardData;
            if (!cd) return false;
            const fileItem = [...cd.items].find((i) => i.kind === "file" && (i.type || "").startsWith("image/"));
            const file = fileItem?.getAsFile();
            if (!file || !isClassNoteImageFile(file)) return false;
            if (file.size > CLASS_NOTE_IMAGE_MAX_BYTES) return false;
            event.preventDefault();
            void (async () => {
              const id = await registerImageRef.current?.(file);
              if (!id) return;
              const type = view.state.schema.nodes.classNoteImage;
              if (!type) return;
              const node = type.create({ attachmentId: id, alt: file.name || "Screenshot" });
              const pos = view.state.selection.from;
              view.dispatch(view.state.tr.insert(pos, node));
            })();
            return true;
          },
          handleDrop(view, event, _slice, moved) {
            if (moved) return false;
            const dt = event.dataTransfer;
            if (!dt?.files?.length) return false;
            const file = [...dt.files].find((f) => isClassNoteImageFile(f));
            if (!file || file.size > CLASS_NOTE_IMAGE_MAX_BYTES) return false;
            event.preventDefault();
            void (async () => {
              const id = await registerImageRef.current?.(file);
              if (!id) return;
              const type = view.state.schema.nodes.classNoteImage;
              if (!type) return;
              const node = type.create({ attachmentId: id, alt: file.name || "Screenshot" });
              const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
              const pos = coords ? coords.pos : view.state.selection.from;
              view.dispatch(view.state.tr.insert(pos, node));
            })();
            return true;
          }
        }
      });
    }, [editor, textDir]);

    const cycleDir = useCallback(() => {
      const i = DIR_ORDER.indexOf(textDir);
      onTextDirChange(DIR_ORDER[(i + 1) % DIR_ORDER.length]!);
    }, [onTextDirChange, textDir]);

    const setLink = useCallback(() => {
      if (!editor) return;
      const prev = editor.getAttributes("link").href as string | undefined;
      const url = window.prompt("Link URL", prev ?? "https://");
      if (url === null) return;
      const trimmed = url.trim();
      if (trimmed === "") {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
        return;
      }
      editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
    }, [editor]);

    const insertImageFromFile = useCallback(
      async (file: File) => {
        const ed = editor;
        if (!ed) return;
        if (!isClassNoteImageFile(file) || file.size > CLASS_NOTE_IMAGE_MAX_BYTES) return;
        const id = await registerImageRef.current?.(file);
        if (!id) return;
        ed.chain()
          .focus()
          .insertContent({
            type: "classNoteImage",
            attrs: { attachmentId: id, alt: file.name || "Screenshot" }
          })
          .run();
      },
      [editor]
    );

    const onToolbarImageChange = useCallback(
      (event: ChangeEvent<HTMLInputElement>) => {
        const f = event.target.files?.[0];
        event.target.value = "";
        if (f) void insertImageFromFile(f);
      },
      [insertImageFromFile]
    );

    if (!editor) {
      return (
        <div className="tiptap-editor-shell min-h-[min(42vh,360px)] rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 text-sm text-slate-500 dark:border-white/10 dark:bg-black/20 dark:text-slate-400 sm:min-h-[min(38vh,320px)]">
          Loading editor…
        </div>
      );
    }

    return (
      <div className="tiptap-editor-shell flex min-h-[min(42vh,360px)] flex-col rounded-2xl border border-slate-200/80 bg-slate-50/80 dark:border-white/10 dark:bg-black/20 sm:min-h-[min(38vh,320px)]">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200/70 px-1 py-1 dark:border-white/10">
          <ToolbarBtn title="Undo" onAction={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
            <Undo2 className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Redo" onAction={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
            <Redo2 className="h-4 w-4" />
          </ToolbarBtn>
          <span className="mx-1 h-6 w-px shrink-0 bg-slate-200 dark:bg-white/15" />
          <ToolbarBtn title="Bold" onAction={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
            <Bold className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Italic" onAction={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
            <Italic className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Underline" onAction={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}>
            <UnderlineIcon className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Strikethrough" onAction={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}>
            <Strikethrough className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Inline code" onAction={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")}>
            <Braces className="h-4 w-4" />
          </ToolbarBtn>
          <span className="mx-1 h-6 w-px shrink-0 bg-slate-200 dark:bg-white/15" />
          <ToolbarBtn title="Bullet list" onAction={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>
            <List className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Numbered list" onAction={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>
            <ListOrdered className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Indent" onAction={() => editor.chain().focus().sinkListItem("listItem").run()} disabled={!editor.can().sinkListItem("listItem")}>
            <IndentIncrease className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Outdent" onAction={() => editor.chain().focus().liftListItem("listItem").run()} disabled={!editor.can().liftListItem("listItem")}>
            <IndentDecrease className="h-4 w-4" />
          </ToolbarBtn>
          <span className="mx-1 h-6 w-px shrink-0 bg-slate-200 dark:bg-white/15" />
          <ToolbarBtn title="Quote" onAction={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}>
            <Quote className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Code block" onAction={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")}>
            <Code2 className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Horizontal line" onAction={() => editor.chain().focus().setHorizontalRule().run()}>
            <Minus className="h-4 w-4" />
          </ToolbarBtn>
          <span className="mx-1 h-6 w-px shrink-0 bg-slate-200 dark:bg-white/15" />
          <ToolbarBtn
            title="Align left"
            onAction={() => editor.chain().focus().setTextAlign("left").run()}
            active={editor.isActive({ textAlign: "left" })}
          >
            <AlignLeft className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn
            title="Align center"
            onAction={() => editor.chain().focus().setTextAlign("center").run()}
            active={editor.isActive({ textAlign: "center" })}
          >
            <AlignCenter className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn
            title="Align right"
            onAction={() => editor.chain().focus().setTextAlign("right").run()}
            active={editor.isActive({ textAlign: "right" })}
          >
            <AlignRight className="h-4 w-4" />
          </ToolbarBtn>
          <span className="mx-1 h-6 w-px shrink-0 bg-slate-200 dark:bg-white/15" />
          <ToolbarBtn title="Link" onAction={setLink} active={editor.isActive("link")}>
            <Link2 className="h-4 w-4" />
          </ToolbarBtn>
          <input
            ref={imageFileRef}
            type="file"
            accept={CLASS_NOTE_IMAGE_ACCEPT}
            className="sr-only"
            aria-hidden
            tabIndex={-1}
            onChange={onToolbarImageChange}
          />
          <ToolbarBtn
            title="Insert screenshot (PNG, JPEG, WebP)"
            onAction={() => imageFileRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Clear character styles" onAction={() => editor.chain().focus().unsetAllMarks().run()}>
            <RemoveFormatting className="h-4 w-4" />
          </ToolbarBtn>
          <FontSizeSelect editor={editor} />
          <span className="mx-1 h-6 w-px shrink-0 bg-slate-200 dark:bg-white/15" />
          <ToolbarBtn title={`Text direction: ${dirLabel(textDir)} (click to cycle)`} onAction={cycleDir} active={textDir !== "auto"}>
            <Languages className="h-4 w-4" />
          </ToolbarBtn>
          <span className="ml-1 rounded-md bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
            {dirLabel(textDir)}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <EditorContent editor={editor} />
        </div>
      </div>
    );
  }
);
