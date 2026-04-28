import { nowIso } from "@/lib/date";
import { getSupabaseClient } from "@/lib/supabase";
import type { TaskAttachment } from "@/lib/types";

export const TASK_ATTACHMENT_MAX_BYTES = 32 * 1024 * 1024;
export const TASK_ATTACHMENT_ACCEPT =
  ".pdf,.doc,.docx,.zip,.png,.jpg,.jpeg,.webp,.txt,.rtf,.ppt,.pptx,.odt,.csv";

const BUCKET = "user-attachments";

function storagePath(userId: string, taskId: string, attachmentId: string): string {
  return `${userId}/tasks/${taskId}/${attachmentId}`;
}

// ---------------------------------------------------------------------------
// IndexedDB fallback (used when no userId is available / offline mode)
// ---------------------------------------------------------------------------

const DB_NAME = "school-os-task-files";
const STORE = "blobs";
const DB_VERSION = 1;

function blobKey(taskId: string, attachmentId: string): string {
  return `${taskId}::${attachmentId}`;
}

function openTaskBlobsDb(): Promise<IDBDatabase> {
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

async function idbSave(taskId: string, attachmentId: string, blob: Blob): Promise<void> {
  const db = await openTaskBlobsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE).put(blob, blobKey(taskId, attachmentId));
  });
}

async function idbGet(taskId: string, attachmentId: string): Promise<Blob | undefined> {
  const db = await openTaskBlobsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB read failed"));
    const req = tx.objectStore(STORE).get(blobKey(taskId, attachmentId));
    req.onsuccess = () => resolve(req.result as Blob | undefined);
  });
}

async function idbDelete(taskId: string, attachmentId: string): Promise<void> {
  const db = await openTaskBlobsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
    tx.oncomplete = () => resolve();
    tx.objectStore(STORE).delete(blobKey(taskId, attachmentId));
  });
}

async function idbDeleteForTask(taskId: string): Promise<void> {
  const db = await openTaskBlobsDb();
  const prefix = `${taskId}::`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB batch delete failed"));
    tx.oncomplete = () => resolve();
    const store = tx.objectStore(STORE);
    const range = IDBKeyRange.bound(prefix, `${prefix}￿`, false, true);
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createTaskAttachmentMeta(file: File, id: string): TaskAttachment {
  return {
    id,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    uploadedAt: nowIso()
  };
}

export async function saveTaskAttachmentBlob(
  userId: string | null | undefined,
  taskId: string,
  attachmentId: string,
  blob: Blob
): Promise<void> {
  const supabase = userId ? getSupabaseClient() : null;
  if (supabase && userId) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath(userId, taskId, attachmentId), blob, { upsert: true });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return;
  }
  await idbSave(taskId, attachmentId, blob);
}

export async function getTaskAttachmentBlob(
  userId: string | null | undefined,
  taskId: string,
  attachmentId: string
): Promise<Blob | undefined> {
  const supabase = userId ? getSupabaseClient() : null;
  if (supabase && userId) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(storagePath(userId, taskId, attachmentId));
    if (error) return undefined;
    return data ?? undefined;
  }
  return idbGet(taskId, attachmentId);
}

export async function deleteTaskAttachmentBlob(
  userId: string | null | undefined,
  taskId: string,
  attachmentId: string
): Promise<void> {
  const supabase = userId ? getSupabaseClient() : null;
  if (supabase && userId) {
    await supabase.storage.from(BUCKET).remove([storagePath(userId, taskId, attachmentId)]);
    return;
  }
  await idbDelete(taskId, attachmentId);
}

export async function deleteTaskAttachmentBlobsForTask(
  userId: string | null | undefined,
  taskId: string
): Promise<void> {
  const supabase = userId ? getSupabaseClient() : null;
  if (supabase && userId) {
    const prefix = `${userId}/tasks/${taskId}/`;
    const { data } = await supabase.storage.from(BUCKET).list(`${userId}/tasks/${taskId}`);
    if (data && data.length > 0) {
      const paths = data.map((f) => `${prefix}${f.name}`);
      await supabase.storage.from(BUCKET).remove(paths);
    }
    return;
  }
  await idbDeleteForTask(taskId);
}
