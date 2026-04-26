"use client";

import { Check, Circle } from "lucide-react";
import { byPriority } from "@/lib/selectors";
import { Badge, Panel } from "@/components/ui";
import type { Task, TaskPriority } from "@/lib/types";

function taskComparator(a: Task, b: Task): number {
  return (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999");
}

export function ByPriorityView({
  tasks,
  onToggleDone,
  onFocus
}: {
  tasks: Task[];
  onToggleDone: (id: string) => void;
  onFocus: (id: string) => void;
}) {
  const grouped = byPriority(tasks);
  const order: TaskPriority[] = ["urgent", "high", "medium", "low"];

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {order.map((priority) => (
        <Panel key={priority} className="bg-white/80 dark:bg-slate-950/70">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold capitalize">{priority}</h3>
            <Badge>{grouped[priority].length}</Badge>
          </div>
          <div className="space-y-2">
            {grouped[priority].sort(taskComparator).map((task) => (
              <div key={task.id} className="rounded-lg border border-slate-200 p-2 dark:border-white/10">
                <div className="flex items-center justify-between">
                  <button onClick={() => onFocus(task.id)} className="text-left text-sm">{task.title}</button>
                  <button onClick={() => onToggleDone(task.id)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-white/10">{task.status === "done" ? <Check className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4" />}</button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}
