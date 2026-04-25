import { Node, mergeAttributes } from "@tiptap/core";
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
      alt: { default: "" }
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
          return { attachmentId: id, alt: node.getAttribute("alt") ?? "" };
        }
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const id = HTMLAttributes.attachmentId as string | null | undefined;
    return [
      "img",
      mergeAttributes(
        {
          class: "classnote-inline-screenshot max-w-full rounded-lg border border-slate-200/80 object-contain dark:border-white/10",
          alt: (HTMLAttributes.alt as string) || "",
          loading: "lazy",
          decoding: "async"
        },
        id ? { "data-classnote-img": id } : {}
      )
    ];
  },

  addNodeView() {
    return ({ node, editor }) => {
      const figure = document.createElement("figure");
      figure.className = "classnote-screenshot-frame my-3";
      const img = document.createElement("img");
      img.alt = (node.attrs.alt as string) || "";
      img.className =
        "max-w-full rounded-lg border border-slate-200/80 object-contain dark:border-white/10 max-h-[min(72vh,720px)]";
      img.loading = "lazy";
      img.decoding = "async";
      figure.appendChild(img);

      let objectUrl: string | undefined;

      const revoke = () => {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrl = undefined;
        }
        img.removeAttribute("src");
      };

      const load = async (attachmentId: string | null) => {
        revoke();
        if (!attachmentId) return;
        const noteId = editor.storage.classNoteImage?.noteId ?? "";
        if (!noteId) return;
        const blob = await getClassNoteAttachmentBlob(noteId, attachmentId);
        if (!blob?.size) return;
        objectUrl = URL.createObjectURL(blob);
        img.src = objectUrl;
      };

      void load(node.attrs.attachmentId as string | null);

      return {
        dom: figure,
        update: (updated) => {
          if (updated.type.name !== "classNoteImage") return false;
          img.alt = (updated.attrs.alt as string) || "";
          void load(updated.attrs.attachmentId as string | null);
          return true;
        },
        destroy: () => {
          revoke();
        }
      };
    };
  }
});
