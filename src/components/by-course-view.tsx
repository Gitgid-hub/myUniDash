"use client";

import { Check, Circle } from "lucide-react";
import { Badge, Panel } from "@/components/ui";
import type { Course, Task } from "@/lib/types";

function taskComparator(a: Task, b: Task): number {
  return (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999");
}

export function ByCourseView({
  tasks,
  courses,
  onToggleDone,
  onFocus
}: {
  tasks: Task[];
  courses: Course[];
  onToggleDone: (id: string) => void;
  onFocus: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {courses.map((course) => {
        const courseTasks = tasks.filter((task) => task.courseId === course.id);
        if (courseTasks.length === 0) {
          return null;
        }
        return (
          <Panel key={course.id} className="bg-white/80 dark:bg-slate-950/70">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: course.color }} />{course.code} {course.name}</h3>
              <Badge>{courseTasks.length}</Badge>
            </div>
            <div className="space-y-2">
              {courseTasks.sort(taskComparator).map((task) => (
                <div key={task.id} className="rounded-lg border border-slate-200 p-2 dark:border-white/10">
                  <div className="flex items-center justify-between">
                    <button onClick={() => onFocus(task.id)} className="text-left text-sm font-medium">{task.title}</button>
                    <button onClick={() => onToggleDone(task.id)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-white/10">{task.status === "done" ? <Check className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4" />}</button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
