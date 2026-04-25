import { useEffect, useRef } from "react";
import { nowIso } from "@/lib/date";
import type { ClassNote, ClassNoteAttachment } from "@/lib/types";

/** Per file; total note size is still bounded by browser storage. */
export const CLASS_NOTE_PRESENTATION_MAX_BYTES = 40 * 1024 * 1024;

/** Extension-only `accept` avoids picker issues when MIME types are missing or wrong (e.g. Safari, Google Drive). */
export const CLASS_NOTE_PRESENTATION_ACCEPT = ".pdf,.ppt,.pps,.pptx,.ppsx,.key,.odp";

const EXT_OK = new Set(["pdf", "ppt", "pps", "pptx", "ppsx", "key", "odp"]);

function isPresentationMime(mime: string): boolean {
  const m = mime.toLowerCase();
  if (!m) return false;
  if (m === "application/pdf") return true;
  if (m === "application/vnd.ms-powerpoint") return true;
  if (m.includes("presentationml")) return true;
  if (m === "application/x-iwork-keynote-sffkey") return true;
  if (m === "application/vnd.oasis.opendocument.presentation") return true;
  return false;
}

function extOf(name: string): string | undefined {
  const base = name.trim().split(/[/\\]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  if (i < 0) return undefined;
  return base.slice(i + 1).toLowerCase();
}

export function isPresentationFile(file: File): boolean {
  const ext = extOf(file.name);
  if (ext && EXT_OK.has(ext)) return true;
  const t = (file.type || "").toLowerCase();
  if (isPresentationMime(t)) return true;
  if (t === "application/octet-stream" || t === "binary/octet-stream") {
    return ext !== undefined && EXT_OK.has(ext);
  }
  return false;
}

/** Screenshots / slides pasted as images (stored in the same IndexedDB store as presentations). */
export const CLASS_NOTE_IMAGE_MAX_BYTES = 12 * 1024 * 1024;

export const CLASS_NOTE_IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp,.gif";

const IMAGE_EXT_OK = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export function isClassNoteImageFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("image/")) return true;
  const ext = extOf(file.name);
  return ext !== undefined && IMAGE_EXT_OK.has(ext);
}

export function isClassNoteImageAttachment(att: ClassNoteAttachment): boolean {
  return (att.mimeType || "").toLowerCase().startsWith("image/");
}

export function createClassNoteAttachmentMeta(file: File, id: string): ClassNoteAttachment {
  return {
    id,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    uploadedAt: nowIso()
  };
}

const DB_NAME = "school-os-class-note-files";
const STORE = "blobs";
const DB_VERSION = 1;

function blobKey(noteId: string, attachmentId: string): string {
  return `${noteId}::${attachmentId}`;
}

export function openClassNoteBlobsDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

export async function saveClassNoteAttachmentBlob(noteId: string, attachmentId: string, blob: Blob): Promise<void> {
  const db = await openClassNoteBlobsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE).put(blob, blobKey(noteId, attachmentId));
  });
}

export async function getClassNoteAttachmentBlob(noteId: string, attachmentId: string): Promise<Blob | undefined> {
  const db = await openClassNoteBlobsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB read failed"));
    const req = tx.objectStore(STORE).get(blobKey(noteId, attachmentId));
    req.onsuccess = () => resolve(req.result as Blob | undefined);
  });
}

export async function deleteClassNoteAttachmentBlob(noteId: string, attachmentId: string): Promise<void> {
  const db = await openClassNoteBlobsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE).delete(blobKey(noteId, attachmentId));
  });
}

export async function deleteClassNoteAttachmentBlobsForNote(noteId: string): Promise<void> {
  const db = await openClassNoteBlobsDb();
  const prefix = `${noteId}::`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB batch delete failed"));
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(STORE);
    const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`, false, true);
    const req = store.openCursor(range);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB cursor failed"));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  });
}

/** When a class note row disappears from state, drop its blobs from this browser. */
export function usePruneClassNoteAttachmentBlobs(classNotes: ClassNote[] | undefined): void {
  const prevRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const next = new Set((classNotes ?? []).map((n) => n.id));
    void (async () => {
      for (const id of prevRef.current) {
        if (!next.has(id)) {
          await deleteClassNoteAttachmentBlobsForNote(id).catch(() => {});
        }
      }
      prevRef.current = next;
    })();
  }, [classNotes]);
}
