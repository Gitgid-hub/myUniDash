import { nowIso } from "@/lib/date";
import type { TaskAttachment } from "@/lib/types";

export const TASK_ATTACHMENT_MAX_BYTES = 32 * 1024 * 1024;
export const TASK_ATTACHMENT_ACCEPT =
  ".pdf,.doc,.docx,.zip,.png,.jpg,.jpeg,.webp,.txt,.rtf,.ppt,.pptx,.odt,.csv";

const DB_NAME = "school-os-task-files";
const STORE = "blobs";
const DB_VERSION = 1;

function blobKey(taskId: string, attachmentId: string): string {
  return `${taskId}::${attachmentId}`;
}

export function createTaskAttachmentMeta(file: File, id: string): TaskAttachment {
  return {
    id,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    uploadedAt: nowIso()
  };
}

export function openTaskBlobsDb(): Promise<IDBDatabase> {
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

export async function saveTaskAttachmentBlob(taskId: string, attachmentId: string, blob: Blob): Promise<void> {
  const db = await openTaskBlobsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE).put(blob, blobKey(taskId, attachmentId));
  });
}

export async function getTaskAttachmentBlob(taskId: string, attachmentId: string): Promise<Blob | undefined> {
  const db = await openTaskBlobsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB read failed"));
    const req = tx.objectStore(STORE).get(blobKey(taskId, attachmentId));
    req.onsuccess = () => resolve(req.result as Blob | undefined);
  });
}

export async function deleteTaskAttachmentBlob(taskId: string, attachmentId: string): Promise<void> {
  const db = await openTaskBlobsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE).delete(blobKey(taskId, attachmentId));
  });
}

export async function deleteTaskAttachmentBlobsForTask(taskId: string): Promise<void> {
  const db = await openTaskBlobsDb();
  const prefix = `${taskId}::`;
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
