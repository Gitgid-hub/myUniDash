import { useMemo } from "react";
import { Check, Circle } from "lucide-react";
import { Badge, Panel } from "@/components/ui";
import type { Course, Task, WorkBlock } from "@/lib/types";
import { buildBookedBlockByTaskId } from "@/lib/work-block-utils";
import { formatDueDateOnly } from "@/lib/date-format";
import { isOverdue, isToday } from "@/lib/date";
import { priorityColor, statusColor } from "@/lib/task-styles";

export interface TaskListProps {
  tasks: Task[];
  courses: Course[];
  workBlocks: WorkBlock[];
  onToggleDone: (id: string) => void;
  onFocus: (id: string) => void;
  focusedTaskId?: string;
  title: string;
}

export function TaskList({
  tasks,
  courses,
  workBlocks,
  onToggleDone,
  onFocus,
  focusedTaskId,
  title
}: TaskListProps) {
  const courseMap = useMemo(() => Object.fromEntries(courses.map((course) => [course.id, course])), [courses]);
  const bookedBlockByTaskId = useMemo(() => buildBookedBlockByTaskId(workBlocks), [workBlocks]);

  return (
    <Panel className="bg-white/90 dark:bg-[#101317]/90">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold">{title}</h3>
        <Badge>{tasks.length}</Badge>
      </div>
      <div className="space-y-3">
        {tasks.map((task) => {
          const course = courseMap[task.courseId as string];
          const bookedBlock = bookedBlockByTaskId.get(task.id);
          const bookingLabel = bookedBlock
            ? `Booked ${new Date(bookedBlock.startAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${new Date(bookedBlock.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Still not booked";
          return (
            <div
              key={task.id}
              role="button"
              tabIndex={0}
              onClick={() => onFocus(task.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onFocus(task.id);
                }
              }}
              className={`w-full rounded-[24px] border p-4 text-left transition ${focusedTaskId === task.id ? "border-slate-300 bg-slate-50 dark:border-white/20 dark:bg-white/[0.06]" : "border-slate-200/80 bg-white/40 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"}`}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[17px] font-medium tracking-[-0.02em]">{task.title}</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{task.description || "No description"}</p>
                </div>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleDone(task.id);
                  }}
                  className="rounded-md p-1 hover:bg-slate-100 dark:hover:bg-white/10"
                  aria-label="toggle done"
                >
                  {task.status === "done" ? <Check className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-slate-400" />}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {isOverdue(task.dueAt) && task.status !== "done" ? (
                  <span className="rounded-full border border-rose-300/70 bg-rose-500/15 px-2.5 py-1 text-rose-200 shadow-[0_0_14px_rgba(244,63,94,0.55)]">
                    overdue
                  </span>
                ) : (
                  <span className={`rounded-full px-2.5 py-1 ${priorityColor[task.priority]}`}>{task.priority}</span>
                )}
                <span className={statusColor[task.status]}>{task.status}</span>
                {task.dueAt ? (
                  <span className="text-slate-500 dark:text-slate-400">{formatDueDateOnly(task.dueAt)}</span>
                ) : null}
                <span className="text-slate-500 dark:text-slate-400">{bookingLabel}</span>
                <span className="rounded-full border border-slate-200 px-2.5 py-1 text-slate-500 dark:border-white/10 dark:text-slate-300">{course ? course.code : "General"}</span>
                {task.recurring && <span className="text-slate-400 dark:text-slate-500">Every {task.recurring.interval} {task.recurring.cadence}</span>}
                {isOverdue(task.dueAt) && task.status !== "done" && <span className="text-rose-500">Overdue</span>}
                {isToday(task.dueAt) && task.status !== "done" && <span className="text-sky-500">Today</span>}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export interface DashboardViewProps {
  courses: Course[];
  tasks: Task[];
  workBlocks: WorkBlock[];
  onToggleDone: (id: string) => void;
  onFocus: (id: string) => void;
  focusedTaskId?: string;
  analytics: {
    completed: Record<string, number>;
    workload: Array<{ courseId: string; name: string; total: number; color: string }>;
  };
}

export function DashboardView({
  courses,
  tasks,
  workBlocks,
  onToggleDone,
  onFocus,
  focusedTaskId,
  analytics
}: DashboardViewProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.3fr_0.92fr]">
      <TaskList
        tasks={tasks.slice(0, 10)}
        courses={courses}
        workBlocks={workBlocks}
        onToggleDone={onToggleDone}
        onFocus={onFocus}
        focusedTaskId={focusedTaskId}
        title="Priority Queue"
      />
      <div className="space-y-3">
        <Panel className="bg-white/90 dark:bg-[#101317]/90">
          <h3 className="mb-3 text-base font-semibold">Weekly Completions</h3>
          <div className="flex items-end gap-2">
            {Object.entries(analytics.completed).slice(-6).map(([week, count]) => (
              <div key={week} className="flex-1 text-center">
                <div className="mx-auto mb-1 h-24 w-7 rounded-full bg-slate-100 p-1 dark:bg-white/10">
                  <div style={{ height: `${Math.min(100, count * 18)}%` }} className="h-full w-full rounded-md bg-sky-500" />
                </div>
                <span className="text-[10px] text-slate-500">{week.slice(5)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="bg-white/90 dark:bg-[#101317]/90">
          <h3 className="mb-3 text-base font-semibold">Workload by Course</h3>
          <div className="space-y-1">
            {analytics.workload.slice(0, 6).map((item) => (
              <div key={item.courseId} className="flex items-center justify-between rounded-2xl px-2 py-1.5 text-sm">
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />{item.name}</span>
                <span className="text-slate-500">{item.total} pts</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
