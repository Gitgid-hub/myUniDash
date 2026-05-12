import { useState, useMemo } from "react";
import { BookOpen, Check, ChevronDown, Circle, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Panel } from "@/components/ui";
import type { Course, Task, TaskPriority, TaskStatus, WorkBlock } from "@/lib/types";
import { buildBookedBlockByTaskId } from "@/lib/work-block-utils";
import { sortCompletedTasksByCompletedAtDesc, sortTasksByDueThenPriority } from "@/lib/kanban-sort";
import { formatDueDateOnly } from "@/lib/date-format";
import { formatWeekOfLabel, isOverdue } from "@/lib/date";
import { priorityColor } from "@/lib/task-styles";

export interface KanbanViewProps {
  tasks: Task[];
  tab: "board" | "completed";
  onTabChange: (next: "board" | "completed") => void;
  boardLayout: "by-course" | "due-queue";
  onBoardLayoutChange: (layout: "by-course" | "due-queue") => void;
  boardCount: number;
  completedCount: number;
  thisWeekCompletedCount: number;
  weeklyCompletedBuckets: Array<{ weekKey: string; count: number }>;
  courses: Course[];
  workBlocks: WorkBlock[];
  onUpdate: (task: Partial<Task> & { id: string }) => void;
  onDelete: (id: string) => void;
  onFocus: (id: string) => void;
  onToggleDone: (id: string) => void;
  onOpenComposer: (courseId?: string | "general") => void;
  onOpenAiImport: (courseId?: string | "general") => void;
  onOpenTabGuide?: () => void;
  glowTaskIds?: string[];
}

export function KanbanView({
  tasks,
  tab,
  onTabChange,
  boardLayout,
  onBoardLayoutChange,
  boardCount,
  completedCount,
  thisWeekCompletedCount,
  weeklyCompletedBuckets,
  courses,
  workBlocks,
  onUpdate,
  onDelete,
  onFocus,
  onToggleDone,
  onOpenComposer,
  onOpenAiImport,
  onOpenTabGuide,
  glowTaskIds
}: KanbanViewProps) {
  const glowSet = useMemo(() => new Set(glowTaskIds ?? []), [glowTaskIds]);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [sortModeByGroup, setSortModeByGroup] = useState<Record<string, "date" | "priority">>({});
  const bookedBlockByTaskId = useMemo(() => buildBookedBlockByTaskId(workBlocks), [workBlocks]);
  const taskTypeLabel: Record<TaskStatus, string> = {
    backlog: "Backlog",
    next: "To-do",
    "in-progress": "In progress",
    done: "Done"
  };
  const tasksByCourseId = useMemo(() => {
    return tasks.reduce<Record<string, Task[]>>((acc, task) => {
      const key = task.courseId === "general" ? "general" : task.courseId;
      (acc[key] ??= []).push(task);
      return acc;
    }, {});
  }, [tasks]);
  const courseGroups = useMemo(() => {
    const knownGroups = courses.map((course) => ({
      id: course.id,
      label: `${course.code} · ${course.name}`,
      color: course.color,
      tasks: tasksByCourseId[course.id] ?? []
    }));
    const generalTasks = tasksByCourseId.general ?? [];
    if (generalTasks.length > 0) {
      knownGroups.push({
        id: "general",
        label: "General",
        color: "#64748b",
        tasks: generalTasks
      });
    }
    return knownGroups.filter((group) => group.tasks.length > 0);
  }, [courses, tasksByCourseId]);

  const sortedDueQueueTasks = useMemo(() => {
    if (tab === "completed") return sortCompletedTasksByCompletedAtDesc(tasks);
    return sortTasksByDueThenPriority(tasks);
  }, [tab, tasks]);

  const showDueQueue = boardLayout === "due-queue";

  function courseMetaForTask(task: Task): { label: string; color: string } {
    if (task.courseId === "general") return { label: "General", color: "#64748b" };
    const c = courses.find((x) => x.id === task.courseId);
    return c ? { label: `${c.code} · ${c.name}`, color: c.color } : { label: "Unknown course", color: "#64748b" };
  }

  function toggleGroup(groupId: string) {
    setCollapsedGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  }

  function sortTasksForGroup(groupId: string, sourceTasks: Task[]) {
    if (tab === "completed") {
      return [...sourceTasks].sort((a, b) => {
        const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return tb - ta;
      });
    }
    const mode = sortModeByGroup[groupId] ?? "date";
    const tasksCopy = [...sourceTasks];
    if (mode === "priority") {
      const priorityRank: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      return tasksCopy.sort((a, b) => {
        const rankDiff = priorityRank[a.priority] - priorityRank[b.priority];
        if (rankDiff !== 0) return rankDiff;
        const dueA = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        const dueB = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        return dueA - dueB;
      });
    }
    return tasksCopy.sort((a, b) => {
      const dueA = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const dueB = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (dueA !== dueB) return dueA - dueB;
      const priorityRank: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      return priorityRank[a.priority] - priorityRank[b.priority];
    });
  }

  function renderKanbanTaskRow(task: Task, showCourseColumn: boolean) {
    const nowTs = Date.now();
    const bookedBlock = bookedBlockByTaskId.get(task.id);
    const isNearDeadlineUnbooked =
      !bookedBlock &&
      !!task.dueAt &&
      (() => {
        const dueTs = new Date(task.dueAt as string).getTime();
        if (Number.isNaN(dueTs)) return false;
        const msUntilDeadline = dueTs - nowTs;
        return msUntilDeadline > 0 && msUntilDeadline <= 2 * 24 * 60 * 60 * 1000;
      })();
    const courseMeta = showCourseColumn ? courseMetaForTask(task) : null;
    const gridClass = showCourseColumn
      ? "grid-cols-[40px_minmax(100px,0.42fr)_1.05fr_1.45fr_1fr_0.88fr_0.82fr_0.78fr_52px]"
      : "grid-cols-[40px_1.35fr_1.6fr_1fr_0.9fr_0.85fr_0.8fr_52px]";

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
        className={`group grid cursor-pointer ${gridClass} items-center border-b border-slate-200/70 px-4 py-3 text-sm transition hover:bg-slate-50/60 dark:border-white/10 dark:hover:bg-white/[0.04] ${glowSet.has(task.id) ? "catchup-glow rounded-xl" : ""}`}
      >
        <button
          onClick={(event) => {
            event.stopPropagation();
            onToggleDone(task.id);
          }}
          className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 text-slate-500 hover:bg-slate-100 dark:border-white/20 dark:hover:bg-white/10"
          aria-label="toggle done"
        >
          {task.status === "done" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Circle className="h-3.5 w-3.5" />}
        </button>
        {showCourseColumn && courseMeta ? (
          <div className="flex min-w-0 items-center gap-2 pr-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: courseMeta.color }} />
            <span dir="auto" className="truncate text-slate-600 dark:text-slate-300">
              {courseMeta.label}
            </span>
          </div>
        ) : null}
        <div className="truncate pr-4 font-medium text-slate-900 dark:text-slate-100">{task.title}</div>
        <div className="truncate pr-4 text-slate-500 dark:text-slate-400">{task.description || "-"}</div>
        <div className="truncate pr-4 text-slate-600 dark:text-slate-300">{formatDueDateOnly(task.dueAt)}</div>
        <div className="pl-4">
          <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
            {taskTypeLabel[task.status]}
          </span>
        </div>
        <div>
          {isOverdue(task.dueAt) && task.status !== "done" ? (
            <span className="rounded-lg border border-rose-300/70 bg-rose-500/15 px-2 py-1 text-xs text-rose-200 shadow-[0_0_14px_rgba(244,63,94,0.55)]">
              overdue
            </span>
          ) : (
            <div className="relative inline-flex items-center">
              <select
                value={task.priority}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  event.stopPropagation();
                  onUpdate({ id: task.id, priority: event.target.value as TaskPriority });
                }}
                className={`appearance-none rounded-lg px-2 py-1 pr-6 text-xs outline-none ${priorityColor[task.priority]}`}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="urgent">urgent</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-slate-400" />
            </div>
          )}
        </div>
        <div className="flex items-center justify-start gap-1">
          {task.status !== "done" ? (
            bookedBlock ? (
              <span className="rounded-md border border-sky-300/60 bg-sky-500/15 px-2 py-0.5 text-[11px] text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.55)]">
                Booked
              </span>
            ) : (
              <span
                className={`text-[11px] ${isNearDeadlineUnbooked ? "text-amber-500 dark:text-amber-300" : "text-slate-500 dark:text-slate-400"}`}
              >
                Not booked yet
              </span>
            )
          ) : (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">Completed</span>
          )}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(task.id);
            }}
            className="opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="delete task"
          >
            <Trash2 className="h-4 w-4 text-rose-500 drop-shadow-[0_0_10px_rgba(244,63,94,0.75)]" />
          </button>
        </div>
      </div>
    );
  }

  const showEmpty = showDueQueue ? tasks.length === 0 : courseGroups.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-2xl border border-slate-200/90 bg-slate-50/80 p-1 dark:border-white/10 dark:bg-white/[0.04]">
              <button
                type="button"
                onClick={() => onTabChange("board")}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  tab === "board"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                Board
                <span className="ml-2 rounded-full bg-slate-200/80 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {boardCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onTabChange("completed")}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  tab === "completed"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                Completed
                <span className="ml-2 rounded-full bg-slate-200/80 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {completedCount}
                </span>
              </button>
            </div>
            <div
              className="inline-flex rounded-2xl border border-slate-200/90 bg-slate-50/80 p-1 dark:border-white/10 dark:bg-white/[0.04]"
              role="group"
              aria-label="Kanban board layout"
            >
              <button
                type="button"
                onClick={() => onBoardLayoutChange("by-course")}
                aria-pressed={boardLayout === "by-course"}
                className={`rounded-xl px-3 py-2 text-xs font-medium transition ${
                  boardLayout === "by-course"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                By course
              </button>
              <button
                type="button"
                onClick={() => onBoardLayoutChange("due-queue")}
                aria-pressed={boardLayout === "due-queue"}
                title={
                  tab === "completed"
                    ? "All completed tasks, newest first"
                    : "All open tasks sorted by due date across every course"
                }
                className={`rounded-xl px-3 py-2 text-xs font-medium transition ${
                  boardLayout === "due-queue"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                Due date queue
              </button>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            {onOpenTabGuide ? (
              <Button variant="outline" onClick={onOpenTabGuide} className="h-8 px-3 text-xs" data-onboarding="guide-button">
                <BookOpen className="mr-1 h-3.5 w-3.5" />
                Guide
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => onOpenAiImport()} className="h-8 px-3 text-xs">
              Task generator
            </Button>
            {tab === "completed" && (
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-200/60 bg-emerald-500/10 px-3 py-2 dark:border-emerald-500/25 dark:bg-emerald-500/10">
                <span className="text-xs font-medium uppercase tracking-wide text-emerald-800/90 dark:text-emerald-200/90">This week</span>
                <span className="text-sm font-semibold tabular-nums text-emerald-800 dark:text-emerald-200">{thisWeekCompletedCount}</span>
              </div>
            )}
          </div>
        </div>

        {tab === "completed" && weeklyCompletedBuckets.length > 0 && (
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">Completed by week</p>
            <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
              {weeklyCompletedBuckets.map(({ weekKey, count }) => (
                <span
                  key={weekKey}
                  title={formatWeekOfLabel(weekKey)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/80 bg-white/80 px-2.5 py-1 text-[11px] text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-300"
                >
                  <span className="max-w-[120px] truncate">{formatWeekOfLabel(weekKey)}</span>
                  <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-1 pb-2">
      {!showDueQueue &&
        courseGroups.map((group) => {
          const isCollapsed = collapsedGroups[group.id] ?? false;
          const activeSortMode = sortModeByGroup[group.id] ?? "date";
          const sortedTasks = sortTasksForGroup(group.id, group.tasks);
          return (
            <Panel key={group.id} className="overflow-hidden bg-white/90 dark:bg-[#101317]/90">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="flex w-full items-center justify-between bg-slate-50/80 px-4 py-3 text-left transition hover:bg-slate-100/70 dark:bg-white/[0.02] dark:hover:bg-white/[0.05]"
              >
                <div className="flex items-center gap-2.5">
                  <ChevronDown className={`h-4 w-4 text-slate-500 transition ${isCollapsed ? "-rotate-90" : ""}`} />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: group.color }} />
                  <span className="font-medium text-slate-900 dark:text-slate-100">{group.label}</span>
                  <Badge>{group.tasks.length}</Badge>
                </div>
                <span className="text-xs text-slate-400">{isCollapsed ? "Expand" : "Collapse"}</span>
              </button>

              {!isCollapsed && (
                <div className="overflow-x-auto">
                  <div className="min-w-[920px]">
                    {tab === "board" && (
                      <div className="flex items-center justify-end border-b border-slate-200/80 px-4 py-2 dark:border-white/10">
                        <label className="mr-2 text-xs text-slate-400">Sort</label>
                        <select
                          value={activeSortMode}
                          onChange={(event) =>
                            setSortModeByGroup((current) => ({
                              ...current,
                              [group.id]: event.target.value as "date" | "priority"
                            }))
                          }
                          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300"
                        >
                          <option value="date">Date</option>
                          <option value="priority">Priority</option>
                        </select>
                      </div>
                    )}
                    <div className="grid grid-cols-[40px_1.35fr_1.6fr_1fr_0.9fr_0.85fr_0.8fr_52px] border-b border-slate-200/80 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-400 dark:border-white/10">
                      <div />
                      <div>Task Name</div>
                      <div>Description</div>
                      <div>Deadline</div>
                      <div className="pl-5">Type</div>
                      <div>Priority</div>
                      <div>Status</div>
                      <div />
                    </div>

                    {sortedTasks.map((task) => renderKanbanTaskRow(task, false))}
                  </div>
                  <div className="flex justify-end border-t border-slate-200/70 px-4 py-2.5 dark:border-white/10">
                    <Button variant="outline" onClick={() => onOpenComposer(group.id === "general" ? "general" : group.id)} className="h-8 px-3 text-xs">
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Add task
                    </Button>
                  </div>
                </div>
              )}
            </Panel>
          );
        })}

      {showDueQueue && sortedDueQueueTasks.length > 0 && (
        <Panel className="overflow-hidden bg-white/90 dark:bg-[#101317]/90">
          <div className="border-b border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.02]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {tab === "completed" ? "All courses · completed" : "All courses · by due date"}
                  </span>
                  <Badge>{sortedDueQueueTasks.length}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {tab === "completed"
                    ? "Newest completions first — pick what to review across every course."
                    : "Earliest due first — use this for daily prioritization across every course."}
                </p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-[40px_minmax(100px,0.42fr)_1.05fr_1.45fr_1fr_0.88fr_0.82fr_0.78fr_52px] border-b border-slate-200/80 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-slate-400 dark:border-white/10">
                <div />
                <div>Course</div>
                <div>Task Name</div>
                <div>Description</div>
                <div>Deadline</div>
                <div className="pl-5">Type</div>
                <div>Priority</div>
                <div>Status</div>
                <div />
              </div>
              {sortedDueQueueTasks.map((task) => renderKanbanTaskRow(task, true))}
            </div>
            <div className="flex justify-end border-t border-slate-200/70 px-4 py-2.5 dark:border-white/10">
              <Button variant="outline" onClick={() => onOpenComposer()} className="h-8 px-3 text-xs">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add task
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {showEmpty && (
        <Panel className="bg-white/90 p-8 text-center text-sm text-slate-500 dark:bg-[#101317]/90 dark:text-slate-400">
          {tab === "completed" ? (
            <p>No completed tasks yet. Complete tasks from the Board tab to see them here.</p>
          ) : showDueQueue ? (
            <>
              <p>No tasks on this board. Switch to &quot;By course&quot; if you expected grouped lists.</p>
              <div className="mt-4">
                <Button variant="outline" onClick={() => onBoardLayoutChange("by-course")}>
                  By course
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>No tasks yet. Add a task to start building your board.</p>
              <div className="mt-4">
                <Button onClick={() => onOpenComposer()}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add task
                </Button>
              </div>
            </>
          )}
        </Panel>
      )}
      </div>
    </div>
  );
}
