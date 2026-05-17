import type { AiParsedTaskDraft } from "@/components/modals/ai-task-import-modal";
import { toLocalDateTimeInputFromIso } from "@/lib/date-format";
import type { TaskPriority } from "@/lib/types";

const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function dueAtForDraft(task: Record<string, unknown>): string {
  const dueIso = typeof task.dueAt === "string" ? task.dueAt.trim() : "";
  if (LOCAL_DATETIME_RE.test(dueIso)) return dueIso;
  if (!dueIso) return "";
  return toLocalDateTimeInputFromIso(dueIso);
}

export function mapApiTasksToDrafts(raw: Array<Record<string, unknown>>): AiParsedTaskDraft[] {
  const out: AiParsedTaskDraft[] = [];
  raw.forEach((task, index) => {
    const title = typeof task.title === "string" ? task.title.trim() : "";
    if (!title) return;
    const description = typeof task.description === "string" ? task.description.trim() : "";
    const dueAt = dueAtForDraft(task);
    const phase = typeof task.phase === "string" ? task.phase.trim() : "";
    const priorityToken = typeof task.priority === "string" ? task.priority : "";
    const priority: TaskPriority =
      priorityToken === "low" || priorityToken === "medium" || priorityToken === "high" || priorityToken === "urgent"
        ? priorityToken
        : "medium";
    out.push({
      id: `ai-task-${index}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      description,
      dueAt,
      priority,
      include: true,
      phase: phase || undefined
    });
  });
  return out;
}
