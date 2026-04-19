import type { TaskPriority, TaskStatus } from "@/lib/types";

interface ParsedQuickAdd {
  title: string;
  dueAt?: string;
  priority: TaskPriority;
  status: TaskStatus;
}

const dayMap: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6
};

function nextDay(targetDay: number): Date {
  const now = new Date();
  const result = new Date(now);
  const delta = (targetDay - now.getDay() + 7) % 7 || 7;
  result.setDate(now.getDate() + delta);
  return result;
}

function parseDue(raw: string): string | undefined {
  const lower = raw.toLowerCase();
  const dueMatch = lower.match(/due\s+([a-z]{3,9}|tomorrow|today)(?:\s+(\d{1,2}:\d{2}))?/i);
  if (!dueMatch) {
    return undefined;
  }

  const [, dayText, timeText] = dueMatch;
  const now = new Date();
  let date: Date;

  if (dayText === "today") {
    date = new Date(now);
  } else if (dayText === "tomorrow") {
    date = new Date(now);
    date.setDate(now.getDate() + 1);
  } else {
    const mapped = dayMap[dayText];
    if (mapped === undefined) {
      return undefined;
    }
    date = nextDay(mapped);
  }

  const [hours, minutes] = (timeText ?? "23:59").split(":").map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

export function parseQuickAdd(input: string): ParsedQuickAdd {
  const normalized = input.trim();
  const lower = normalized.toLowerCase();

  let priority: TaskPriority = "medium";
  if (lower.includes("urgent") || lower.includes("asap")) {
    priority = "urgent";
  } else if (lower.includes("high")) {
    priority = "high";
  } else if (lower.includes("low")) {
    priority = "low";
  }

  let status: TaskStatus = "next";
  if (lower.includes("backlog")) {
    status = "backlog";
  } else if (lower.includes("in-progress") || lower.includes("doing")) {
    status = "in-progress";
  }

  const dueAt = parseDue(normalized);
  const title = normalized.replace(/due\s+[a-z]{3,9}(?:\s+\d{1,2}:\d{2})?/i, "").trim();

  return {
    title: title || normalized,
    dueAt,
    priority,
    status
  };
}
