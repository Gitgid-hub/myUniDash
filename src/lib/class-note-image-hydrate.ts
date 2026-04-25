"use client";

import { getClassNoteAttachmentBlob } from "@/lib/class-note-attachment-blobs";

/** Resolves `img[data-classnote-img]` to blob URLs for preview. Returns cleanup to revoke URLs. */
export function hydrateClassNoteImagesInRoot(root: HTMLElement, noteId: string): () => void {
  const urls: string[] = [];
  void (async () => {
    for (const img of [...root.querySelectorAll<HTMLImageElement>("img[data-classnote-img]")]) {
      const id = img.getAttribute("data-classnote-img");
      if (!id) continue;
      const blob = await getClassNoteAttachmentBlob(noteId, id);
      if (!blob?.size) continue;
      const u = URL.createObjectURL(blob);
      urls.push(u);
      img.src = u;
    }
  })();
  return () => {
    for (const u of urls) {
      URL.revokeObjectURL(u);
    }
  };
}
