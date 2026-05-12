"use client";

import { lazy, memo } from "react";
import { CalendarView } from "@/components/calendar/calendar-view";
import { KanbanView } from "@/components/views/kanban-view";
import { DashboardView } from "@/components/views/dashboard-view";
import { ClassNotesPanel } from "@/components/class-notes-panel";
import { CoursesView } from "@/components/school-os/courses-view";

const MemoCalendarView = memo(CalendarView);
const MemoKanbanView = memo(KanbanView);
const MemoDashboardView = memo(DashboardView);
const MemoClassNotesPanel = memo(ClassNotesPanel);
const MemoCoursesView = memo(CoursesView);

export const LazyCalendarView = lazy(async () => ({ default: MemoCalendarView }));
export const LazyKanbanView = lazy(async () => ({ default: MemoKanbanView }));
export const LazyDashboardView = lazy(async () => ({ default: MemoDashboardView }));
export const LazyClassNotesPanel = lazy(async () => ({ default: MemoClassNotesPanel }));
export const LazyCoursesView = lazy(async () => ({ default: MemoCoursesView }));
