"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { SupabaseStateStore } from "@/lib/cloud-store";
import { nowIso } from "@/lib/date";
import { pushSchoolOsToast } from "@/lib/global-app-toasts";
import { createId } from "@/lib/id";
import { createSeedState } from "@/lib/seed";
import { LocalStorageStore } from "@/lib/storage";
import type {
  ClassNote,
  Course,
  ID,
  MainView,
  SchoolState,
  Store,
  Task,
  TaskAttachment,
  TaskPriority,
  TaskStatus,
  WorkBlock
} from "@/lib/types";

interface TaskInput {
  id?: ID;
  title: string;
  description?: string;
  courseId?: ID | "general";
  status?: TaskStatus;
  dueAt?: string;
  priority?: TaskPriority;
  effort?: number;
  tags?: string[];
  attachments?: TaskAttachment[];
  recurring?: Task["recurring"];
}

interface CourseInput {
  id?: ID;
  name: string;
  code: string;
  source?: string;
  externalCourseId?: string;
  catalogLastSyncedAt?: string;
  color: string;
  instructor?: string;
  notes?: string;
  meetings?: Course["meetings"];
  progressMode?: "manual" | "computed";
  manualProgress?: number;
}

type Action =
  | { type: "hydrate"; payload: SchoolState }
  | { type: "restore-calendar"; payload: { courses: Course[]; workBlocks: WorkBlock[] } }
  | { type: "replace-course"; payload: Course }
  | { type: "replace-work-block"; payload: WorkBlock }
  | { type: "insert-work-block"; payload: WorkBlock }
  | { type: "set-view"; payload: MainView }
  | { type: "set-theme"; payload: SchoolState["ui"]["theme"] }
  | { type: "set-search"; payload: boolean }
  | { type: "set-composer"; payload: boolean }
  | { type: "set-focus"; payload?: ID }
  | { type: "set-course-filter"; payload: ID | "all" }
  | { type: "set-onboarding-complete"; payload?: string }
  | { type: "set-catch-up-prompt-week"; payload?: string }
  | { type: "add-task"; payload: TaskInput }
  | { type: "update-task"; payload: Partial<Task> & { id: ID } }
  | { type: "toggle-task-done"; payload: ID }
  | { type: "delete-task"; payload: ID }
  | { type: "add-course"; payload: CourseInput }
  | { type: "update-course"; payload: Partial<Course> & { id: ID } }
  | { type: "archive-course"; payload: ID }
  | { type: "delete-course"; payload: ID }
  | { type: "add-work-block"; payload: Omit<WorkBlock, "id" | "createdAt"> & { id?: ID } }
  | { type: "update-work-block"; payload: Partial<WorkBlock> & { id: ID } }
  | { type: "delete-work-block"; payload: ID }
  | { type: "set-alert-offsets"; payload: number[] }
  | {
      type: "add-class-note";
      payload: {
        id?: ID;
        courseId: ID;
        occurredOn: string;
        meetingId?: ID;
        title: string;
        bodyMarkdown?: string;
        status?: ClassNote["status"];
      };
    }
  | { type: "update-class-note"; payload: Partial<ClassNote> & { id: ID } }
  | { type: "delete-class-note"; payload: ID }
  | { type: "publish-class-note"; payload: ID };

interface SchoolStoreValue {
  state: SchoolState;
  ready: boolean;
  dispatch: (action: Action) => void;
  addTask: (input: TaskInput) => void;
  updateTask: (task: Partial<Task> & { id: ID }) => void;
  toggleTaskDone: (id: ID) => void;
  addCourse: (input: CourseInput) => void;
}

const fallback: SchoolState = {
  courses: [],
  tasks: [],
  workBlocks: [],
  classNotes: [],
  reminderSettings: { offsetsHours: [168, 72, 24, 2] },
  ui: {
    activeView: "dashboard",
    selectedCourseId: "all",
    theme: "system",
    showTaskComposer: false,
    showSearch: false
  }
};

const SchoolStoreContext = createContext<SchoolStoreValue | undefined>(undefined);
const PERSIST_DEBOUNCE_MS = 1500;

function normalizeClassNote(note: ClassNote): ClassNote {
  return {
    ...note,
    attachments: note.attachments ?? [],
    editorTextDir: note.editorTextDir ?? "auto"
  };
}

function isTaskAttachmentLike(x: unknown): x is TaskAttachment {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.name === "string" && typeof o.size === "number";
}

function normalizeTask(task: Task): Task {
  const raw = task.attachments as unknown;
  const attachments: TaskAttachment[] = Array.isArray(raw) ? raw.filter(isTaskAttachmentLike) : [];
  return { ...task, attachments };
}

function normalizeState(state: SchoolState): SchoolState {
  return {
    ...state,
    courses: state.courses.map(normalizeCourse),
    tasks: (state.tasks ?? []).map(normalizeTask),
    workBlocks: state.workBlocks ?? [],
    classNotes: (state.classNotes ?? []).map(normalizeClassNote),
    ui: {
      ...state.ui,
      activeView: state.ui?.activeView ?? "dashboard",
      selectedCourseId: state.ui?.selectedCourseId ?? "all",
      theme: state.ui?.theme ?? "system",
      showTaskComposer: state.ui?.showTaskComposer ?? false,
      showSearch: state.ui?.showSearch ?? false,
      focusedTaskId: state.ui?.focusedTaskId,
      onboardingCompletedAt: state.ui?.onboardingCompletedAt,
      catchUpPromptedWeekKey: state.ui?.catchUpPromptedWeekKey
    }
  };
}

function normalizeCourse(course: Course): Course {
  return {
    ...course,
    meetings: course.meetings.map((meeting) => ({
      ...meeting,
      id: meeting.id ?? createId("meeting"),
      anchorDate: meeting.anchorDate,
      title: meeting.title ?? "",
      notes: meeting.notes ?? "",
      type: meeting.type ?? "lecture",
      isAllDay: meeting.isAllDay ?? false,
      recurrence: meeting.recurrence ?? {
        cadence: "weekly",
        interval: 1,
        daysOfWeek: [meeting.day]
      },
      seriesId: meeting.seriesId ?? createId("series")
    }))
  };
}

function reducer(state: SchoolState, action: Action): SchoolState {
  switch (action.type) {
    case "hydrate":
      return normalizeState(action.payload);
    case "restore-calendar":
      return {
        ...state,
        courses: action.payload.courses.map(normalizeCourse),
        workBlocks: action.payload.workBlocks ?? []
      };
    case "replace-course":
      return {
        ...state,
        courses: state.courses.map((course) =>
          course.id === action.payload.id ? normalizeCourse(action.payload) : course
        )
      };
    case "replace-work-block":
      return {
        ...state,
        workBlocks: (state.workBlocks ?? []).map((block) =>
          block.id === action.payload.id ? action.payload : block
        )
      };
    case "insert-work-block":
      return { ...state, workBlocks: [action.payload, ...(state.workBlocks ?? [])] };
    case "set-view":
      return { ...state, ui: { ...state.ui, activeView: action.payload } };
    case "set-theme":
      return { ...state, ui: { ...state.ui, theme: action.payload } };
    case "set-search":
      return { ...state, ui: { ...state.ui, showSearch: action.payload } };
    case "set-composer":
      return { ...state, ui: { ...state.ui, showTaskComposer: action.payload } };
    case "set-focus":
      return { ...state, ui: { ...state.ui, focusedTaskId: action.payload } };
    case "set-course-filter":
      return { ...state, ui: { ...state.ui, selectedCourseId: action.payload } };
    case "set-onboarding-complete":
      return { ...state, ui: { ...state.ui, onboardingCompletedAt: action.payload ?? nowIso() } };
    case "set-catch-up-prompt-week":
      return { ...state, ui: { ...state.ui, catchUpPromptedWeekKey: action.payload } };
    case "add-task": {
      const now = nowIso();
      const newTask: Task = {
        id: action.payload.id ?? createId("task"),
        title: action.payload.title,
        description: action.payload.description ?? "",
        courseId: action.payload.courseId ?? "general",
        status: action.payload.status ?? "next",
        dueAt: action.payload.dueAt,
        priority: action.payload.priority ?? "medium",
        effort: action.payload.effort ?? 1,
        tags: action.payload.tags ?? [],
        attachments: action.payload.attachments ?? [],
        recurring: action.payload.recurring,
        createdAt: now,
        updatedAt: now
      };
      return { ...state, tasks: [normalizeTask(newTask), ...state.tasks] };
    }
    case "update-task":
      return {
        ...state,
        tasks: state.tasks.map((task) =>
          task.id === action.payload.id
            ? normalizeTask({ ...task, ...action.payload, updatedAt: nowIso() })
            : task
        )
      };
    case "toggle-task-done":
      return {
        ...state,
        tasks: state.tasks.map((task) => {
          if (task.id !== action.payload) {
            return task;
          }
          const done = task.status === "done";
          return {
            ...task,
            status: done ? "next" : "done",
            completedAt: done ? undefined : nowIso(),
            updatedAt: nowIso()
          };
        })
      };
    case "delete-task":
      return { ...state, tasks: state.tasks.filter((task) => task.id !== action.payload) };
    case "add-course": {
      const now = nowIso();
      const newCourse: Course = {
        id: action.payload.id ?? createId("course"),
        name: action.payload.name,
        code: action.payload.code,
        source: action.payload.source,
        externalCourseId: action.payload.externalCourseId,
        catalogLastSyncedAt: action.payload.catalogLastSyncedAt,
        color: action.payload.color,
        archived: false,
        instructor: action.payload.instructor,
        notes: action.payload.notes ?? "",
        meetings: (action.payload.meetings ?? []).map((meeting) => ({
          ...meeting,
          id: meeting.id ?? createId("meeting"),
          seriesId: meeting.seriesId ?? createId("series")
        })),
        grading: [],
        progressMode: action.payload.progressMode ?? "manual",
        manualProgress: action.payload.manualProgress ?? 0,
        createdAt: now,
        updatedAt: now
      };

      return { ...state, courses: [newCourse, ...state.courses] };
    }
    case "update-course":
      return {
        ...state,
        courses: state.courses.map((course) =>
          course.id === action.payload.id ? normalizeCourse({ ...course, ...action.payload, updatedAt: nowIso() }) : course
        )
      };
    case "archive-course":
      return {
        ...state,
        courses: state.courses.map((course) =>
          course.id === action.payload ? { ...course, archived: true, updatedAt: nowIso() } : course
        )
      };
    case "delete-course": {
      const deletingCourseId = action.payload;
      const remainingTasks = state.tasks.filter((task) => task.courseId !== deletingCourseId);
      const remainingTaskIds = new Set(remainingTasks.map((task) => task.id));
      return {
        ...state,
        courses: state.courses.filter((course) => course.id !== deletingCourseId),
        tasks: remainingTasks,
        workBlocks: (state.workBlocks ?? []).filter(
          (block) => block.courseId !== deletingCourseId && remainingTaskIds.has(block.taskId)
        ),
        classNotes: (state.classNotes ?? []).filter((note) => note.courseId !== deletingCourseId),
        ui: {
          ...state.ui,
          selectedCourseId: state.ui.selectedCourseId === deletingCourseId ? "all" : state.ui.selectedCourseId,
          focusedTaskId:
            state.ui.focusedTaskId && remainingTaskIds.has(state.ui.focusedTaskId)
              ? state.ui.focusedTaskId
              : undefined
        }
      };
    }
    case "add-work-block": {
      const now = nowIso();
      const block: WorkBlock = {
        id: action.payload.id ?? createId("block"),
        taskId: action.payload.taskId,
        courseId: action.payload.courseId,
        startAt: action.payload.startAt,
        endAt: action.payload.endAt,
        status: action.payload.status,
        titleSnapshot: action.payload.titleSnapshot,
        colorSnapshot: action.payload.colorSnapshot,
        createdAt: now
      };
      return { ...state, workBlocks: [block, ...(state.workBlocks ?? [])] };
    }
    case "update-work-block":
      return {
        ...state,
        workBlocks: (state.workBlocks ?? []).map((block) =>
          block.id === action.payload.id ? { ...block, ...action.payload } : block
        )
      };
    case "delete-work-block":
      return { ...state, workBlocks: (state.workBlocks ?? []).filter((block) => block.id !== action.payload) };
    case "set-alert-offsets":
      return {
        ...state,
        reminderSettings: { offsetsHours: action.payload.sort((a, b) => b - a) }
      };
    case "add-class-note": {
      const now = nowIso();
      const newNote: ClassNote = {
        id: action.payload.id ?? createId("cnote"),
        courseId: action.payload.courseId,
        occurredOn: action.payload.occurredOn,
        meetingId: action.payload.meetingId,
        title: action.payload.title,
        bodyMarkdown: action.payload.bodyMarkdown ?? "",
        status: action.payload.status ?? "draft",
        createdAt: now,
        updatedAt: now,
        attachments: [],
        editorTextDir: "auto"
      };
      return { ...state, classNotes: [newNote, ...(state.classNotes ?? [])] };
    }
    case "update-class-note":
      return {
        ...state,
        classNotes: (state.classNotes ?? []).map((note) =>
          note.id === action.payload.id ? { ...note, ...action.payload, updatedAt: nowIso() } : note
        )
      };
    case "delete-class-note":
      return { ...state, classNotes: (state.classNotes ?? []).filter((note) => note.id !== action.payload) };
    case "publish-class-note": {
      const notes = state.classNotes ?? [];
      const note = notes.find((n) => n.id === action.payload);
      if (!note) return state;
      const now = nowIso();
      return {
        ...state,
        classNotes: notes.map((n) => (n.id === note.id ? { ...n, status: "saved" as const, updatedAt: now } : n))
      };
    }
    default:
      return state;
  }
}

export function SchoolStoreProvider({ children, store }: { children: React.ReactNode; store?: Store }) {
  const [state, dispatch] = useReducer(reducer, fallback);
  const [hydrated, setHydrated] = useState(false);
  const ready = hydrated;
  const storage = useMemo<Store>(() => store ?? new LocalStorageStore(), [store]);
  /** Only true after a successful `getState()` — avoids writing empty/fallback state over cloud data on load failure. */
  const persistAllowedRef = useRef(false);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStateRef = useRef(state);
  const latestStorageRef = useRef(storage);
  const latestReadyRef = useRef(ready);

  useEffect(() => {
    let mounted = true;
    persistAllowedRef.current = false;
    storage
      .getState()
      .then((stored) => {
        if (!mounted) {
          return;
        }
        dispatch({ type: "hydrate", payload: stored });
        persistAllowedRef.current = true;
        setHydrated(true);
      })
      .catch(() => {
        if (!mounted) {
          return;
        }
        console.warn("School OS: could not load saved state; showing local seed. Reload to retry sync.");
        pushSchoolOsToast({
          kind: "error",
          message: "Could not load your saved workspace. Showing a local fallback."
        });
        dispatch({ type: "hydrate", payload: createSeedState() });
        // If cloud load failed, do not push this seed back up and overwrite remote data.
        persistAllowedRef.current = !(storage instanceof SupabaseStateStore);
        setHydrated(true);
      });

    return () => {
      mounted = false;
    };
  }, [storage]);

  useEffect(() => {
    latestStateRef.current = state;
    latestStorageRef.current = storage;
    latestReadyRef.current = ready;
  }, [ready, state, storage]);

  useEffect(() => {
    if (!ready || !persistAllowedRef.current) {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
      return;
    }
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;
    }
    persistTimeoutRef.current = setTimeout(() => {
      persistTimeoutRef.current = null;
      if (!latestReadyRef.current || !persistAllowedRef.current) return;
      void latestStorageRef.current.setState(latestStateRef.current);
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
    };
  }, [state, ready, storage]);

  useEffect(() => {
    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
      if (!latestReadyRef.current || !persistAllowedRef.current) return;
      void latestStorageRef.current.setState(latestStateRef.current);
    };
  }, []);

  const addTask = useCallback((input: TaskInput) => dispatch({ type: "add-task", payload: input }), []);
  const updateTask = useCallback((task: Partial<Task> & { id: ID }) => dispatch({ type: "update-task", payload: task }), []);
  const toggleTaskDone = useCallback((id: ID) => dispatch({ type: "toggle-task-done", payload: id }), []);
  const addCourse = useCallback((input: CourseInput) => dispatch({ type: "add-course", payload: input }), []);

  const value = useMemo(
    () => ({
      state,
      ready,
      dispatch,
      addTask,
      updateTask,
      toggleTaskDone,
      addCourse
    }),
    [state, ready, addTask, updateTask, toggleTaskDone, addCourse]
  );

  return <SchoolStoreContext.Provider value={value}>{children}</SchoolStoreContext.Provider>;
}

export function useSchoolStore(): SchoolStoreValue {
  const context = useContext(SchoolStoreContext);
  if (!context) {
    throw new Error("useSchoolStore must be used inside SchoolStoreProvider");
  }
  return context;
}
