import type { NextRequest } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase-server";

export const MAX_INPUT_CHARS = 40_000;
export const MAX_OUTPUT_TASKS = 60;
export const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
export const SCREENSHOT_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export type ParsedTask = {
  title: string;
  description?: string;
  dueAt?: string | null;
  priority?: "low" | "medium" | "high" | "urgent";
  phase?: string;
};

export async function getUserIdFromRequest(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

function normalizePriority(value: unknown): ParsedTask["priority"] {
  if (typeof value !== "string") return undefined;
  const token = value.toLowerCase();
  if (token === "low" || token === "medium" || token === "high" || token === "urgent") return token;
  return undefined;
}

const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24H_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function padTime24h(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(TIME_24H_RE);
  if (match) {
    return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
  }
  const ampm = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!ampm) return null;
  let hour = Number(ampm[1]);
  const minute = ampm[2] ?? "00";
  const isPm = ampm[3].toUpperCase() === "PM";
  if (hour === 12) hour = isPm ? 12 : 0;
  else if (isPm) hour += 12;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

/** Moodle screenshots: read wall-clock from dueDate/dueTime; avoid UTC Z shifting hours. */
function normalizeScreenshotDueAt(obj: Record<string, unknown>): string | null | undefined {
  const dueDate = typeof obj.dueDate === "string" ? obj.dueDate.trim() : "";
  const dueTimeRaw = typeof obj.dueTime === "string" ? obj.dueTime.trim() : "";
  if (DATE_ONLY_RE.test(dueDate)) {
    const dueTime = padTime24h(dueTimeRaw);
    if (dueTime) return `${dueDate}T${dueTime}`;
    return null;
  }

  const dueAt = typeof obj.dueAt === "string" ? obj.dueAt.trim() : "";
  if (!dueAt) return null;
  if (LOCAL_DATETIME_RE.test(dueAt)) return dueAt;
  const zMatch = dueAt.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (zMatch && /z$/i.test(dueAt)) {
    return `${zMatch[1]}T${zMatch[2]}:${zMatch[3]}`;
  }
  const parsed = new Date(dueAt);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function normalizeDueAt(value: unknown, now: Date, mode: "plan" | "screenshot"): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (LOCAL_DATETIME_RE.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  if (mode === "screenshot") {
    const zMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
    if (zMatch && /z$/i.test(trimmed)) return `${zMatch[1]}T${zMatch[2]}:${zMatch[3]}`;
    return parsed.toISOString();
  }
  const adjusted = new Date(parsed.getTime());
  let safety = 0;
  while (adjusted.getTime() < now.getTime() && safety < 10) {
    adjusted.setFullYear(adjusted.getFullYear() + 1);
    safety += 1;
  }
  return adjusted.toISOString();
}

function sanitizeScreenshotDescription(description: string, title: string): string | undefined {
  const trimmed = description.trim();
  if (!trimmed || trimmed === title) return undefined;
  if (/reichen|moodi[ey]|garbled/i.test(trimmed)) return undefined;
  const latinWords = trimmed.match(/\b[a-zA-Z]{4,}\b/g) ?? [];
  const hasHebrew = /[\u0590-\u05FF]/.test(trimmed);
  const allowedLatin = new Set(["docx", "pdf", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Monday"]);
  const suspiciousLatin = latinWords.filter((word) => !allowedLatin.has(word));
  if (hasHebrew && suspiciousLatin.length > 0) return undefined;
  return trimmed;
}

export function normalizeTasks(raw: unknown, now: Date, mode: "plan" | "screenshot" = "plan"): ParsedTask[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedTask[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    if (!title) continue;
    const descriptionRaw = typeof obj.description === "string" ? obj.description.trim() : "";
    const description =
      mode === "screenshot" ? sanitizeScreenshotDescription(descriptionRaw, title) : descriptionRaw || undefined;
    const phase = typeof obj.phase === "string" ? obj.phase.trim() : "";
    const dueAt =
      mode === "screenshot"
        ? normalizeScreenshotDueAt(obj) ?? normalizeDueAt(obj.dueAt, now, mode)
        : normalizeDueAt(obj.dueAt, now, mode);
    out.push({
      title,
      description,
      dueAt: dueAt === undefined ? null : dueAt,
      priority: normalizePriority(obj.priority),
      phase: phase || undefined
    });
    if (out.length >= MAX_OUTPUT_TASKS) break;
  }
  return out;
}

export function buildTaskParseSystemPrompt(mode: "plan" | "screenshot"): string {
  if (mode === "screenshot") {
    return `You read university assignment screenshots (Moodle, Canvas, etc.) in Hebrew and/or English.
Return ONLY valid JSON. No markdown or prose.
Output schema:
{
  "tasks": [
    {
      "title": "assignment title exactly as shown (preserve Hebrew)",
      "description": "optional — ONLY a clearly visible attachment filename (e.g. .docx/.pdf) or short instructor note; otherwise omit or use empty string",
      "dueDate": "YYYY-MM-DD from the Due: line exactly as printed",
      "dueTime": "HH:mm 24-hour clock exactly as printed on the Due: line (e.g. 09:00 for 9:00 AM); null if no time shown",
      "priority": "low|medium|high|urgent",
      "phase": "string optional"
    }
  ]
}
Rules:
- One task per assignment page.
- Copy the main heading as title (e.g. עבודה שניה) — do not invent or translate.
- Read Due: date and time literally; do not shift year/day/hour. Example: "Tuesday, 26 May 2026, 9:00 AM" → dueDate "2026-05-26", dueTime "09:00".
- Never use UTC Z suffixes. Prefer dueDate + dueTime over dueAt.
- Do NOT put course codes, breadcrumbs, or guessed text in description. If unsure, leave description empty.
- Never transliterate or hallucinate Hebrew/Latin mixed text.
- Ignore submission status tables unless they contain a distinct second task.
- Never return more than ${MAX_OUTPUT_TASKS} tasks.`;
  }
  const source = "study/project plans";
  return `You convert ${source} into clean task JSON.
Return ONLY valid JSON. No markdown or prose.
Output schema:
{
  "tasks": [
    {
      "title": "string",
      "description": "string optional",
      "dueAt": "ISO-8601 datetime with timezone OR null",
      "priority": "low|medium|high|urgent",
      "phase": "string optional"
    }
  ]
}
Rules:
- Extract concrete actionable tasks only (assignments, submissions, readings, exams).
- Keep titles concise; preserve Hebrew text when present.
- Put links and long instructions in description.
- If due date/time is visible, use ISO-8601 with timezone; include hour when shown.
- If due date is missing/ambiguous, use null.
- If year is missing or seems stale, use the upcoming/current year rather than past years.
- Map urgency markers to priority when possible.
- Never return more than ${MAX_OUTPUT_TASKS} tasks.`;
}

export async function callOpenAiTaskParse(
  apiKey: string,
  messages: Array<{ role: string; content: unknown }>,
  mode: "plan" | "screenshot" = "plan"
): Promise<ParsedTask[]> {
  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages
    })
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    throw new Error(errText.slice(0, 500) || "Upstream AI parse failed.");
  }

  const data = (await upstream.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) {
    throw new Error("Empty response from model.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Could not parse AI response JSON.");
  }
  return normalizeTasks((parsed as Record<string, unknown>).tasks, new Date(), mode);
}
