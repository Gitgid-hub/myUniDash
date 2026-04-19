export interface WaitlistSubmission {
  email: string;
  university?: string;
  year?: string;
  createdAt: string;
}

const STORAGE_KEY = "school-os:waitlist:v1";

function readAll(): WaitlistSubmission[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as WaitlistSubmission[];
  } catch {
    return [];
  }
}

function writeAll(items: WaitlistSubmission[]): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function saveWaitlistLocal(submission: WaitlistSubmission): void {
  const current = readAll();
  const exists = current.some((entry) => entry.email.toLowerCase() === submission.email.toLowerCase());
  if (exists) {
    return;
  }
  writeAll([submission, ...current]);
}

export async function submitWaitlist(submission: WaitlistSubmission): Promise<void> {
  // Current adapter: local persistence.
  saveWaitlistLocal(submission);

  // Swap point for real endpoint integration.
  // Example: await fetch("/api/waitlist", { method: "POST", body: JSON.stringify(submission) });
}

export function listWaitlistLocal(): WaitlistSubmission[] {
  return readAll();
}
