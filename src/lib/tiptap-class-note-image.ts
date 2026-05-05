import { Node, mergeAttributes } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { getClassNoteAttachmentBlob } from "@/lib/class-note-attachment-blobs";

/** Block image backed by IndexedDB (`data-classnote-img` = attachment id). */
export const ClassNoteImage = Node.create({
  name: "classNoteImage",
  group: "block",
  atom: true,
  draggable: true,

  addStorage() {
    return { noteId: "" };
  },

  addAttributes() {
    return {
      attachmentId: { default: null as string | null },
      alt: { default: "" },
      sourceNoteId: { default: null as string | null },
      widthPercent: {
        default: 100,
        parseHTML: (el) => {
          const raw = (el as HTMLElement).getAttribute("data-classnote-width");
          if (!raw) return 100;
          const parsed = Number.parseInt(raw, 10);
          if (!Number.isFinite(parsed)) return 100;
          return Math.max(35, Math.min(100, parsed));
        },
        renderHTML: (attrs) => {
          const raw = Number(attrs.widthPercent);
          const safe = Number.isFinite(raw) ? Math.max(35, Math.min(100, Math.round(raw))) : 100;
          return {
            "data-classnote-width": String(safe),
            style: `width:${safe}%`
          };
        }
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: "img[data-classnote-img]",
        getAttrs: (el) => {
          const node = el as HTMLImageElement;
          const id = node.getAttribute("data-classnote-img");
          if (!id) return false;
          const widthRaw = node.getAttribute("data-classnote-width");
          const styleWidthRaw = (node.style.width || "").trim();
          const styleMatch = styleWidthRaw.match(/^([\d.]+)%$/);
          const width = widthRaw
            ? Number.parseInt(widthRaw, 10)
            : styleMatch
              ? Number.parseFloat(styleMatch[1] ?? "100")
              : 100;
          return {
            attachmentId: id,
            alt: node.getAttribute("alt") ?? "",
            sourceNoteId: node.getAttribute("data-classnote-noteid"),
            widthPercent: Number.isFinite(width) ? Math.max(35, Math.min(100, width)) : 100
          };
        }
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const id = HTMLAttributes.attachmentId as string | null | undefined;
    return [
      "img",
      mergeAttributes(
        HTMLAttributes,
        {
          class: "classnote-inline-screenshot max-w-full rounded-lg border border-slate-200/80 object-contain dark:border-white/10",
          alt: (HTMLAttributes.alt as string) || "",
          loading: "lazy",
          decoding: "async"
        },
        id ? { "data-classnote-img": id } : {},
        HTMLAttributes.sourceNoteId
          ? { "data-classnote-noteid": HTMLAttributes.sourceNoteId as string }
          : {}
      )
    ];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const figure = document.createElement("figure");
      figure.className = "classnote-screenshot-frame group relative my-3";
      figure.style.position = "relative";
      const img = document.createElement("img");
      img.alt = (node.attrs.alt as string) || "";
      img.className =
        "max-w-full rounded-lg border border-slate-200/80 object-contain dark:border-white/10 max-h-[min(72vh,720px)]";
      img.style.width = "100%";
      img.style.height = "auto";
      img.style.display = "block";
      img.loading = "lazy";
      img.decoding = "async";
      figure.appendChild(img);

      const handles: HTMLSpanElement[] = [];
      const HANDLE = 12;
      const CORNERS: Array<{ key: "nw" | "ne" | "sw" | "se"; style: Partial<CSSStyleDeclaration> }> = [
        { key: "nw", style: { left: "-6px", top: "-6px", cursor: "nwse-resize" } },
        { key: "ne", style: { right: "-6px", top: "-6px", cursor: "nesw-resize" } },
        { key: "sw", style: { left: "-6px", bottom: "-6px", cursor: "nesw-resize" } },
        { key: "se", style: { right: "-6px", bottom: "-6px", cursor: "nwse-resize" } }
      ];

      let selected = false;
      let resizing = false;

      const setSelectedUi = (isSelected: boolean) => {
        selected = isSelected;
        img.style.outline = isSelected ? "2px solid rgba(56,189,248,0.85)" : "";
        img.style.outlineOffset = isSelected ? "2px" : "";
        for (const h of handles) {
          h.style.display = isSelected ? "block" : "none";
        }
      };

      const editorRoot = () => editor.view.dom as HTMLElement;

      const setNodeWidthPercent = (widthPercent: number) => {
        const pos = typeof getPos === "function" ? getPos() : null;
        if (typeof pos !== "number") return;
        const current = editor.state.doc.nodeAt(pos);
        if (!current || current.type.name !== "classNoteImage") return;
        const safe = Math.max(35, Math.min(100, Math.round(widthPercent)));
        const prev = Number(current.attrs.widthPercent);
        if (Number.isFinite(prev) && Math.round(prev) === safe) return;
        const tr = editor.state.tr.setNodeMarkup(pos, undefined, {
          ...current.attrs,
          widthPercent: safe
        });
        editor.view.dispatch(tr);
      };

      for (const corner of CORNERS) {
        const h = document.createElement("span");
        h.setAttribute("data-corner", corner.key);
        h.style.position = "absolute";
        h.style.width = `${HANDLE}px`;
        h.style.height = `${HANDLE}px`;
        h.style.borderRadius = "999px";
        h.style.border = "2px solid rgba(56,189,248,0.95)";
        h.style.background = "rgba(2,6,23,0.85)";
        h.style.boxShadow = "0 0 0 1px rgba(15,23,42,0.15)";
        h.style.display = "none";
        h.style.zIndex = "3";
        Object.assign(h.style, corner.style);
        handles.push(h);
        figure.appendChild(h);

        h.addEventListener("mousedown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const root = editorRoot();
          const rootRect = root.getBoundingClientRect();
          const startRect = figure.getBoundingClientRect();
          const startX = event.clientX;
          const startY = event.clientY;
          const startWidthPx = startRect.width;
          const startAspect = startRect.width / Math.max(1, startRect.height);
          const minPx = Math.max(120, rootRect.width * 0.35);
          const maxPx = rootRect.width;
          const horizontalSign = corner.key === "ne" || corner.key === "se" ? 1 : -1;
          const verticalSign = corner.key === "sw" || corner.key === "se" ? 1 : -1;
          resizing = true;

          const onMove = (moveEv: MouseEvent) => {
            const dx = (moveEv.clientX - startX) * horizontalSign;
            const dy = (moveEv.clientY - startY) * verticalSign;
            const projectedFromY = dy * startAspect;
            const dominantDelta = Math.abs(projectedFromY) > Math.abs(dx) ? projectedFromY : dx;
            const nextPx = Math.max(minPx, Math.min(maxPx, startWidthPx + dominantDelta));
            const nextPercent = (nextPx / rootRect.width) * 100;
            setNodeWidthPercent(nextPercent);
          };

          const onUp = () => {
            resizing = false;
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };

          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        });
      }

      let objectUrl: string | undefined;
      let currentAttachmentId: string | null = null;

      const revoke = () => {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = undefined;
        }
        img.removeAttribute("src");
      };

      const load = async (attachmentId: string | null, sourceNoteId: string | null) => {
        if (!attachmentId) return;
        if (attachmentId === currentAttachmentId && img.getAttribute("src")) return;
        revoke();
        const noteId = editor.storage.classNoteImage?.noteId ?? "";
        if (!noteId) return;
        let blob = await getClassNoteAttachmentBlob(noteId, attachmentId);
        // Cross-note paste safety: if migration hasn't happened yet, try source note once.
        if ((!blob || !blob.size) && sourceNoteId && sourceNoteId !== noteId) {
          blob = await getClassNoteAttachmentBlob(sourceNoteId, attachmentId);
        }
        if (!blob?.size) return;
        currentAttachmentId = attachmentId;
        objectUrl = URL.createObjectURL(blob);
        img.src = objectUrl;
      };

      const applyWidth = (raw: unknown) => {
        const width = Number(raw);
        const safe = Number.isFinite(width) ? Math.max(35, Math.min(100, Math.round(width))) : 100;
        figure.style.width = `${safe}%`;
        figure.style.maxWidth = "100%";
      };

      void load(node.attrs.attachmentId as string | null, (node.attrs.sourceNoteId as string | null) ?? null);
      applyWidth(node.attrs.widthPercent);
      setSelectedUi(false);

      figure.addEventListener("mousedown", (event) => {
        if ((event.target as HTMLElement)?.getAttribute("data-corner")) return;
        const pos = typeof getPos === "function" ? getPos() : null;
        if (typeof pos !== "number") return;
        const tr = editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos));
        editor.view.dispatch(tr);
        editor.view.focus();
      });

      return {
        dom: figure,
        update: (updated) => {
          if (updated.type.name !== "classNoteImage") return false;
          img.alt = (updated.attrs.alt as string) || "";
          applyWidth(updated.attrs.widthPercent);
          void load(
            updated.attrs.attachmentId as string | null,
            (updated.attrs.sourceNoteId as string | null) ?? null
          );
          return true;
        },
        selectNode: () => {
          setSelectedUi(true);
        },
        deselectNode: () => {
          if (!resizing) setSelectedUi(false);
        },
        destroy: () => {
          revoke();
          currentAttachmentId = null;
        }
      };
    };
  }
});
