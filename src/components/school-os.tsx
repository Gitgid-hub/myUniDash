"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import type { ComponentType, CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Circle,
  Star,
  StickyNote,
  Command,
  Copy,
  Cog,
  KanbanSquare,
  LayoutDashboard,
  Moon,
  Paperclip,
  Plus,
  Search,
  Sun,
  Timer,
  Trash2,
  TriangleAlert,
  Upload,
  X
} from "lucide-react";
import { ClassNotesPanel, defaultClassNoteTitle } from "@/components/class-notes-panel";
import { ByCourseView } from "@/components/by-course-view";
import { ByPriorityView } from "@/components/by-priority-view";
import { MetricCard } from "@/components/metric-card";
import { OnboardingTour } from "@/components/onboarding-tour";
import { SearchModal } from "@/components/search-modal";
import { usePruneClassNoteAttachmentBlobs } from "@/lib/class-note-attachment-blobs";
import {
  createTaskAttachmentMeta,
  deleteTaskAttachmentBlob,
  deleteTaskAttachmentBlobsForTask,
  getTaskAttachmentBlob,
  saveTaskAttachmentBlob,
  TASK_ATTACHMENT_ACCEPT,
  TASK_ATTACHMENT_MAX_BYTES
} from "@/lib/task-attachment-blobs";
import { formatWeekOfLabel, getWeekKey, isOverdue, isToday, nowIso, startOfDay } from "@/lib/date";
import {
  completedByWeek,
  getOverdueTasks,
  getTodayTasks,
  getUpcomingTasks,
  searchAll,
  workloadByCourse
} from "@/lib/selectors";
import { useSchoolStore } from "@/lib/store";
import { MINIMAL_CORE_ONBOARDING_STEPS } from "@/lib/onboarding-steps";
import type {
  Course,
  CourseMeeting,
  MainView,
  Task,
  TaskAttachment,
  TaskPriority,
  TaskStatus,
  WeekDay,
  WorkBlock
} from "@/lib/types";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { Badge, Button, Panel } from "@/components/ui";
import { createId } from "@/lib/id";
import { useAuth } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import type { CalendarHolidayChip } from "@/lib/calendar-holidays";
import { indexHolidayChipsByDate, readCachedHolidayYear, writeCachedHolidayYear } from "@/lib/calendar-holidays";
import { pushSchoolOsToast } from "@/lib/global-app-toasts";

const navItems: Array<{ id: MainView; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "class-notes", label: "Class Notes", icon: StickyNote },
  { id: "kanban", label: "Kanban", icon: KanbanSquare },
  { id: "courses", label: "Courses", icon: BookOpen },
  { id: "user-requests", label: "User Requests", icon: TriangleAlert },
  { id: "upcoming", label: "Upcoming", icon: CalendarDays },
  { id: "by-course", label: "By Course", icon: BookOpen },
  { id: "by-priority", label: "By Priority", icon: BarChart3 }
];

/** Survives remounts so “Class finished” only nags once per session instance. */
const POST_SESSION_PROMPT_STORAGE_KEY = "school-os-post-session-prompt-dismissed:v1";
const ADMIN_EMAILS = new Set(["gidon.greeblatt@gmail.com", "gidon.greenblatt@gmail.com"]);
const MAX_FEATURE_REQUEST_SCREENSHOTS = 3;
const FEATURE_REQUEST_DONE_STORAGE_KEY = "school-os:feature-requests-done:v1";
const DEGREE_ROADMAP_CACHE_STORAGE_KEY = "school-os:degree-roadmap-cache:v1";
type CatalogDegreeOption = {
  id: string;
  roadmapCode: string;
  label: string;
};
const DEFAULT_CATALOG_DEGREES: CatalogDegreeOption[] = [
  { id: "biology", roadmapCode: "570-4010", label: "Biology (HUJI 570-4010)" },
  { id: "linguistics", roadmapCode: "181-1751", label: "Linguistics (HUJI 181-1751)" }
];
const CATALOG_DEGREE_STORAGE_KEY = "school-os:catalog-degree:v1";

function dedupeLabelSegments(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return cleaned;
  const segments = cleaned
    .split(/\s*[,\-–—|]\s*/g)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const segment of segments) {
    const key = segment.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(segment);
  }
  return out.length > 0 ? out.join(" - ") : cleaned;
}

function loadPostSessionPromptDismissedKeys(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(POST_SESSION_PROMPT_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function persistPostSessionPromptDismissedKey(key: string): void {
  if (typeof window === "undefined") return;
  const keys = loadPostSessionPromptDismissedKeys();
  keys.add(key);
  window.localStorage.setItem(POST_SESSION_PROMPT_STORAGE_KEY, JSON.stringify([...keys]));
}

function classNoteExistsForSession(
  notes: { courseId: string; meetingId?: string; occurredOn: string }[] | undefined,
  courseId: string,
  meetingId: string,
  occurredOn: string
): boolean {
  return (notes ?? []).some(
    (n) => n.courseId === courseId && n.occurredOn === occurredOn && n.meetingId === meetingId
  );
}

const statusColor: Record<TaskStatus, string> = {
  backlog: "text-slate-400 dark:text-slate-500",
  next: "text-slate-600 dark:text-slate-300",
  "in-progress": "text-slate-600 dark:text-slate-300",
  done: "text-emerald-600 dark:text-emerald-400"
};

const priorityColor: Record<TaskPriority, string> = {
  urgent: "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
  high: "border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
  medium: "border border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300",
  low: "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
};

const coursePalette = [
  "#22c55e",
  "#38bdf8",
  "#818cf8",
  "#a78bfa",
  "#f472b6",
  "#fb7185",
  "#f97316",
  "#f59e0b",
  "#14b8a6",
  "#06b6d4",
  "#84cc16",
  "#e879f9",
  "#ef4444",
  "#10b981",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#0ea5e9",
  "#64748b"
];

function hexToRgb(hexColor: string): { r: number; g: number; b: number } | null {
  const hex = hexColor.replace("#", "").trim();
  const normalized = hex.length === 3 ? hex.split("").map((c) => `${c}${c}`).join("") : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function colorDistance(a: string, b: string): number {
  const rgbA = hexToRgb(a);
  const rgbB = hexToRgb(b);
  if (!rgbA || !rgbB) return 0;
  const dr = rgbA.r - rgbB.r;
  const dg = rgbA.g - rgbB.g;
  const db = rgbA.b - rgbB.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function pickDistinctCourseColor(existingColors: string[]): string {
  const normalizedExisting = existingColors
    .map((color) => color.toLowerCase())
    .filter((color) => color.trim().length > 0);

  const paletteUnique = [...new Set(coursePalette.map((color) => color.toLowerCase()))];
  if (normalizedExisting.length === 0) return paletteUnique[0] ?? coursePalette[0];

  let bestColor = paletteUnique[0] ?? coursePalette[0];
  let bestScore = -1;
  for (const candidate of paletteUnique) {
    const nearestDistance = normalizedExisting.reduce((nearest, existing) => {
      const distance = colorDistance(candidate, existing);
      return Math.min(nearest, distance);
    }, Number.POSITIVE_INFINITY);
    if (nearestDistance > bestScore) {
      bestScore = nearestDistance;
      bestColor = candidate;
    }
  }
  return bestColor;
}

const weekDays: WeekDay[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type SessionCadence = "none" | "daily" | "weekly" | "monthly";
type QuickSessionType = "lecture" | "tutorial";

function viewTitle(view: MainView): string {
  switch (view) {
    case "dashboard":
      return "Overview";
    case "courses":
      return "Courses";
    case "user-requests":
      return "User Requests";
    case "today":
      return "Today";
    case "upcoming":
      return "Upcoming";
    case "overdue":
      return "Overdue";
    case "by-course":
      return "By Course";
    case "by-priority":
      return "By Priority";
    case "list":
      return "Task List";
    case "kanban":
      return "Task Board";
    case "calendar":
      return "Calendar";
    case "class-notes":
      return "Class Notes";
    default:
      return "School OS";
  }
}

function taskComparator(a: Task, b: Task): number {
  return (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999");
}

function hebcalPillClasses(subcat?: string): string {
  if (subcat === "modern") {
    return "border border-violet-400/35 bg-violet-600 text-white shadow-sm dark:bg-violet-500";
  }
  if (subcat === "minor") {
    return "border border-amber-500/30 bg-amber-900/85 text-amber-50 shadow-sm dark:bg-amber-900/80";
  }
  return "border border-indigo-400/35 bg-indigo-600 text-white shadow-sm dark:bg-indigo-500";
}

function formatDueDateOnly(dueAt?: string): string {
  if (!dueAt) return "No date";
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function toLocalDateInput(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNextScheduledBlock(taskId: string, workBlocks: WorkBlock[]): WorkBlock | undefined {
  return buildBookedBlockByTaskId(workBlocks).get(taskId);
}

function buildBookedBlockByTaskId(workBlocks: WorkBlock[], nowTs = Date.now()): Map<string, WorkBlock> {
  const nextFutureByTask = new Map<string, WorkBlock>();
  const latestAnyByTask = new Map<string, WorkBlock>();
  for (const block of workBlocks) {
    if (block.status !== "scheduled") continue;
    const startTs = new Date(block.startAt).getTime();
    if (Number.isNaN(startTs)) continue;

    const currentLatest = latestAnyByTask.get(block.taskId);
    if (!currentLatest || startTs > new Date(currentLatest.startAt).getTime()) {
      latestAnyByTask.set(block.taskId, block);
    }

    const endTs = new Date(block.endAt).getTime();
    if (Number.isNaN(endTs) || endTs < nowTs) continue;
    const currentFuture = nextFutureByTask.get(block.taskId);
    if (!currentFuture || startTs < new Date(currentFuture.startAt).getTime()) {
      nextFutureByTask.set(block.taskId, block);
    }
  }

  const resolved = new Map<string, WorkBlock>();
  for (const [taskId, block] of latestAnyByTask) {
    resolved.set(taskId, nextFutureByTask.get(taskId) ?? block);
  }
  return resolved;
}

function formatFileBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

type CalendarUndoEntry =
  | { type: "replace-course"; course: Course }
  | { type: "delete-work-block"; id: string }
  | { type: "replace-work-block"; block: WorkBlock }
  | { type: "insert-work-block"; block: WorkBlock };

type TaskUndoEntry = {
  id: string;
  status: TaskStatus;
  completedAt?: string;
};

type FeatureRequestItem = {
  id: number;
  user_email: string;
  message: string;
  screenshots: Array<{ name: string; mimeType: string; dataUrl: string }>;
  status: string;
  created_at: string;
};

interface CatalogSearchMeeting {
  weekday: WeekDay;
  start_time: string;
  end_time: string;
  meeting_type?: string | null;
  location?: string | null;
  semester?: string | null;
}

interface CatalogSearchCourse {
  source: string;
  externalId: string;
  courseNumber: string;
  title?: string;
  nameHe?: string | null;
  nameEn?: string | null;
  faculty?: string | null;
  department?: string | null;
  credits?: number | null;
  lastSeenAt?: string | null;
  roadmapYearLabel?: string;
  roadmapSectionLabel?: string;
  meetings: CatalogSearchMeeting[];
}

interface ImportedMeetingChoiceOption {
  optionId: string;
  label: string;
  meetings: CatalogSearchMeeting[];
}

interface ImportedMeetingChoiceSet {
  setId: string;
  label: string;
  options: ImportedMeetingChoiceOption[];
}

function getImportedChoiceSetPriority(label: string): number {
  const text = label.toLowerCase();
  if (text.includes("הרצ") || text.includes("lecture") || text.includes("שיעור")) return 0;
  if (text.includes("תרג") || text.includes("tutorial") || text.includes("tirgul")) return 1;
  if (text.includes("מעב") || text.includes("lab")) return 2;
  return 3;
}

const MemoDashboardView = memo(DashboardView);
const MemoKanbanView = memo(KanbanView);
const MemoCalendarView = memo(CalendarView);
const MemoByCourseView = memo(ByCourseView);
const MemoByPriorityView = memo(ByPriorityView);
const MemoTaskList = memo(TaskList);
const MemoClassNotesPanel = memo(ClassNotesPanel);

function isTaskBlockUnderway(taskId: string, workBlocks: WorkBlock[], nowTs = Date.now()): boolean {
  return workBlocks.some((block) => {
    if (block.taskId !== taskId) return false;
    if (block.status !== "scheduled") return false;
    const start = new Date(block.startAt).getTime();
    const end = new Date(block.endAt).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) return false;
    return start <= nowTs && nowTs <= end;
  });
}

export function SchoolOS() {
  const { state, ready, dispatch, addTask, updateTask, toggleTaskDone, addCourse } = useSchoolStore();
  const { user } = useAuth();
  usePruneClassNoteAttachmentBlobs(state.classNotes);
  const [quickTaskSearch, setQuickTaskSearch] = useState("");
  const [kanbanTab, setKanbanTab] = useState<"board" | "completed">("board");
  const [composerInitialCourseId, setComposerInitialCourseId] = useState<string | "general" | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [calendarMode, setCalendarMode] = useState<"month" | "week" | "day">("week");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => new Date());
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseCode, setNewCourseCode] = useState("");
  const [newCourseColor, setNewCourseColor] = useState(coursePalette[0]);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editInstructor, setEditInstructor] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editProgressMode, setEditProgressMode] = useState<"manual" | "computed">("manual");
  const [editManualProgress, setEditManualProgress] = useState(0);
  const [editColor, setEditColor] = useState(coursePalette[0]);
  const [isUtilityOpen, setIsUtilityOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [featureRequestMessage, setFeatureRequestMessage] = useState("");
  const [featureRequestShots, setFeatureRequestShots] = useState<Array<{ name: string; mimeType: string; dataUrl: string }>>([]);
  const [featureRequestSending, setFeatureRequestSending] = useState(false);
  const [featureRequestError, setFeatureRequestError] = useState<string | null>(null);
  const [featureRequestSuccess, setFeatureRequestSuccess] = useState<string | null>(null);
  const [adminFeatureRequests, setAdminFeatureRequests] = useState<FeatureRequestItem[]>([]);
  const [adminRequestsLoading, setAdminRequestsLoading] = useState(false);
  const [adminRequestsError, setAdminRequestsError] = useState<string | null>(null);
  const [deletingRequestId, setDeletingRequestId] = useState<number | null>(null);
  const [selectedRequestScreenshot, setSelectedRequestScreenshot] = useState<{ dataUrl: string; alt: string } | null>(null);
  const [doneFeatureRequestMap, setDoneFeatureRequestMap] = useState<Record<string, string>>({});
  const [gitSyncStatus, setGitSyncStatus] = useState<{ available: boolean; clean: boolean; ahead: number; checking: boolean }>({
    available: false,
    clean: false,
    ahead: 0,
    checking: false
  });
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false);
  const [isCatalogPickerOpen, setIsCatalogPickerOpen] = useState(false);
  const [isCourseActionsOpen, setIsCourseActionsOpen] = useState(false);
  const [courseListMode, setCourseListMode] = useState<"all" | "imported" | "manual" | "archived">("all");
  const [isCourseEditorOpen, setIsCourseEditorOpen] = useState(false);
  const [isSessionEditorOpen, setIsSessionEditorOpen] = useState(false);
  const [endedWorkBlockId, setEndedWorkBlockId] = useState<string | null>(null);
  const promptedWorkBlocksRef = useRef<Set<string>>(new Set());
  const endedWorkBlockPromptCooldownUntilRef = useRef(0);
  const calendarUndoStackRef = useRef<CalendarUndoEntry[]>([]);
  const taskUndoStackRef = useRef<TaskUndoEntry[]>([]);
  const [sessionDraft, setSessionDraft] = useState<{ courseId?: string; meetingId?: string; anchorDate?: Date; start?: string; end?: string } | undefined>();
  const [selectedCalendarSession, setSelectedCalendarSession] = useState<{ courseId: string; meetingId: string; anchorDate: Date } | null>(null);
  const [sessionDeletePrompt, setSessionDeletePrompt] = useState<{ courseId: string; meetingId: string; anchorDate: Date } | null>(null);
  const [classNoteEditorId, setClassNoteEditorId] = useState<string | null>(null);
  const [postSessionPrompt, setPostSessionPrompt] = useState<{
    courseId: string;
    meetingId: string;
    occurredOn: string;
    courseName: string;
    sessionLabel: string;
  } | null>(null);
  const promptedPostSessionRef = useRef<Set<string>>(new Set());
  const postSessionHydratedRef = useRef(false);
  const postSessionPromptRef = useRef(postSessionPrompt);
  postSessionPromptRef.current = postSessionPrompt;

  useEffect(() => {
    if (postSessionHydratedRef.current) return;
    postSessionHydratedRef.current = true;
    loadPostSessionPromptDismissedKeys().forEach((k) => promptedPostSessionRef.current.add(k));
  }, []);
  const [visibleCourseIds, setVisibleCourseIds] = useState<string[]>([]);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogResults, setCatalogResults] = useState<CatalogSearchCourse[]>([]);
  const [catalogFreshness, setCatalogFreshness] = useState<{ lastCompletedAt: string | null; fetchedCount: number } | null>(null);
  const [catalogImportingId, setCatalogImportingId] = useState<string | null>(null);
  const [catalogDegreeImporting, setCatalogDegreeImporting] = useState(false);
  const [catalogViewMode, setCatalogViewMode] = useState<"search" | "roadmap">("search");
  const [catalogDegreeSearchQuery, setCatalogDegreeSearchQuery] = useState("");
  const [isCatalogDegreeOptionsOpen, setIsCatalogDegreeOptionsOpen] = useState(false);
  const [catalogDegreeSearchLoading, setCatalogDegreeSearchLoading] = useState(false);
  const [catalogDegreeOptions, setCatalogDegreeOptions] = useState<CatalogDegreeOption[]>(DEFAULT_CATALOG_DEGREES);
  const degreeLoadRequestSeqRef = useRef(0);
  const [catalogDegree, setCatalogDegree] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_CATALOG_DEGREES[0]?.id ?? "biology";
    const saved = window.localStorage.getItem(CATALOG_DEGREE_STORAGE_KEY);
    return saved && saved.length > 0 ? saved : (DEFAULT_CATALOG_DEGREES[0]?.id ?? "biology");
  });
  const [onboardingActive, setOnboardingActive] = useState(false);
  const [onboardingStepIndex, setOnboardingStepIndex] = useState(0);
  const [onboardingTargetElement, setOnboardingTargetElement] = useState<HTMLElement | null>(null);
  const [onboardingActiveCourseCountAtStart, setOnboardingActiveCourseCountAtStart] = useState(0);
  const [onboardingDemoTaskId, setOnboardingDemoTaskId] = useState<string | null>(null);
  const [freshlyAddedCourseId, setFreshlyAddedCourseId] = useState<string | null>(null);
  const [pendingSessionChoiceFlow, setPendingSessionChoiceFlow] = useState<{
    courseId: string;
    courseName: string;
    courseColor: string;
    sets: Array<{
      setId: string;
      label: string;
      options: Array<{
        optionId: string;
        label: string;
        meetings: CourseMeeting[];
      }>;
    }>;
    activeSetIndex: number;
  } | null>(null);

  const readDegreeRoadmapCache = useCallback((degreeId: string): CatalogSearchCourse[] | null => {
    if (typeof window === "undefined") return null;
    if (!user?.id) return null;
    try {
      const raw = window.localStorage.getItem(DEGREE_ROADMAP_CACHE_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Record<string, Record<string, { courses?: CatalogSearchCourse[] }>>;
      const userBucket = parsed?.[user.id];
      const entry = userBucket?.[degreeId];
      if (!entry?.courses || !Array.isArray(entry.courses) || entry.courses.length === 0) return null;
      return entry.courses;
    } catch {
      return null;
    }
  }, [user?.id]);

  const writeDegreeRoadmapCache = useCallback((degreeId: string, courses: CatalogSearchCourse[]) => {
    if (typeof window === "undefined") return;
    if (!user?.id) return;
    try {
      const raw = window.localStorage.getItem(DEGREE_ROADMAP_CACHE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) as Record<string, Record<string, { courses: CatalogSearchCourse[]; savedAt: string }>> : {};
      const next = {
        ...parsed,
        [user.id]: {
          ...(parsed[user.id] ?? {}),
          [degreeId]: {
            courses,
            savedAt: new Date().toISOString()
          }
        }
      };
      window.localStorage.setItem(DEGREE_ROADMAP_CACHE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Best effort cache only.
    }
  }, [user?.id]);

  const pushCalendarUndoEntry = useCallback((entry: CalendarUndoEntry) => {
    calendarUndoStackRef.current.push(entry);
    if (calendarUndoStackRef.current.length > 80) {
      calendarUndoStackRef.current.shift();
    }
  }, []);

  const undoCalendarChange = useCallback(() => {
    const previous = calendarUndoStackRef.current.pop();
    if (!previous) return;
    switch (previous.type) {
      case "replace-course":
        dispatch({ type: "replace-course", payload: previous.course });
        return;
      case "delete-work-block":
        dispatch({ type: "delete-work-block", payload: previous.id });
        return;
      case "replace-work-block":
        dispatch({ type: "replace-work-block", payload: previous.block });
        return;
      case "insert-work-block":
        dispatch({ type: "insert-work-block", payload: previous.block });
        return;
      default:
        return;
    }
  }, [dispatch]);

  const updateCourseWithUndo = useCallback((course: Partial<Course> & { id: string }) => {
    const previous = state.courses.find((item) => item.id === course.id);
    if (previous) {
      pushCalendarUndoEntry({ type: "replace-course", course: previous });
    }
    dispatch({ type: "update-course", payload: course });
  }, [dispatch, pushCalendarUndoEntry, state.courses]);

  const addWorkBlockWithUndo = useCallback((block: Omit<WorkBlock, "id" | "createdAt">) => {
    const id = createId("block");
    pushCalendarUndoEntry({ type: "delete-work-block", id });
    dispatch({ type: "add-work-block", payload: { ...block, id } });
  }, [dispatch, pushCalendarUndoEntry]);

  const updateWorkBlockWithUndo = useCallback((block: Partial<WorkBlock> & { id: string }) => {
    const previous = state.workBlocks.find((item) => item.id === block.id);
    if (previous) {
      pushCalendarUndoEntry({ type: "replace-work-block", block: previous });
    }
    dispatch({ type: "update-work-block", payload: block });
  }, [dispatch, pushCalendarUndoEntry, state.workBlocks]);

  const deleteWorkBlockWithUndo = useCallback((id: string) => {
    const previous = state.workBlocks.find((item) => item.id === id);
    if (previous) {
      pushCalendarUndoEntry({ type: "insert-work-block", block: previous });
    }
    dispatch({ type: "delete-work-block", payload: id });
  }, [dispatch, pushCalendarUndoEntry, state.workBlocks]);

  const toggleTaskDoneWithUndo = useCallback((id: string) => {
    const previous = state.tasks.find((task) => task.id === id);
    if (!previous) return;
    taskUndoStackRef.current.push({
      id: previous.id,
      status: previous.status,
      completedAt: previous.completedAt
    });
    if (taskUndoStackRef.current.length > 80) {
      taskUndoStackRef.current.shift();
    }
    toggleTaskDone(id);
  }, [state.tasks, toggleTaskDone]);

  const undoTaskToggle = useCallback(() => {
    const previous = taskUndoStackRef.current.pop();
    if (!previous) return;
    dispatch({
      type: "update-task",
      payload: {
        id: previous.id,
        status: previous.status,
        completedAt: previous.completedAt
      }
    });
  }, [dispatch]);

  useKeyboardShortcuts({
    openComposer: () => dispatch({ type: "set-composer", payload: true }),
    openSessionComposer: () => {
      setSessionDraft({ anchorDate: selectedCalendarDate });
      setIsSessionEditorOpen(true);
    },
    openSearch: () => dispatch({ type: "set-search", payload: true }),
    undoCalendarChange,
    undoTaskToggle,
    markFocusedDone: () => {
      if (state.ui.focusedTaskId) {
        toggleTaskDoneWithUndo(state.ui.focusedTaskId);
      }
    },
    switchView: (view) => dispatch({ type: "set-view", payload: view }),
    setFocusedTask: (id) => dispatch({ type: "set-focus", payload: id }),
    getActiveView: () => state.ui.activeView
  });

  useEffect(() => {
    const root = document.documentElement;
    const darkPreferred = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = state.ui.theme === "dark" || (state.ui.theme === "system" && darkPreferred);
    root.classList.toggle("dark", dark);
  }, [state.ui.theme]);
  const activeCourses = useMemo(() => state.courses.filter((course) => !course.archived), [state.courses]);
  const archivedCourses = useMemo(() => state.courses.filter((course) => course.archived), [state.courses]);
  const importedCoursesCount = useMemo(() => activeCourses.filter((course) => !!course.source).length, [activeCourses]);
  const manualCoursesCount = useMemo(() => activeCourses.filter((course) => !course.source).length, [activeCourses]);
  const visibleCoursesInSidebar = useMemo(() => {
    if (courseListMode === "archived") return archivedCourses;
    if (courseListMode === "imported") return activeCourses.filter((course) => !!course.source);
    if (courseListMode === "manual") return activeCourses.filter((course) => !course.source);
    return activeCourses;
  }, [activeCourses, archivedCourses, courseListMode]);
  const onboardingStep = onboardingActive ? MINIMAL_CORE_ONBOARDING_STEPS[onboardingStepIndex] ?? null : null;
  const onboardingCourseGlowId =
    onboardingActive && onboardingStep?.id === "calendar-hours" ? freshlyAddedCourseId : null;
  const selectedCourse =
    state.ui.selectedCourseId === "all"
      ? undefined
      : state.courses.find((course) => course.id === state.ui.selectedCourseId);

  const resolveOnboardingTarget = useCallback((): HTMLElement | null => {
    if (!onboardingStep?.targetSelector) return null;
    if (onboardingStep.id === "add-course" && isCatalogPickerOpen) {
      const catalogPanel = document.querySelector("[data-onboarding='catalog-import-panel']");
      if (catalogPanel instanceof HTMLElement) return catalogPanel;
    }
    const target = document.querySelector(onboardingStep.targetSelector);
    return target instanceof HTMLElement ? target : null;
  }, [isCatalogPickerOpen, onboardingStep]);

  const beginOnboarding = useCallback(() => {
    const activeCourseCount = state.courses.filter((course) => !course.archived).length;
    setOnboardingActiveCourseCountAtStart(activeCourseCount);
    setOnboardingStepIndex(0);
    setOnboardingTargetElement(null);
    setOnboardingActive(true);
  }, [state.courses]);

  const finishOnboarding = useCallback((markComplete = true) => {
    setOnboardingActive(false);
    setOnboardingTargetElement(null);
    if (markComplete) {
      dispatch({ type: "set-onboarding-complete", payload: nowIso() });
    }
  }, [dispatch]);

  const advanceOnboarding = useCallback(() => {
    if (!onboardingActive) return;
    const step = MINIMAL_CORE_ONBOARDING_STEPS[onboardingStepIndex];
    const hasAddedCourseDuringOnboarding = state.courses.filter((course) => !course.archived).length > onboardingActiveCourseCountAtStart;
    const hasAtLeastOneScheduledMeeting = state.courses.some((course) => !course.archived && course.meetings.length > 0);
    if (step?.id === "add-course" && !hasAddedCourseDuringOnboarding) {
      pushSchoolOsToast({
        kind: "error",
        message: "Add one course from the roadmap list to continue onboarding."
      });
      return;
    }
    if (step?.id === "calendar-hours" && !hasAtLeastOneScheduledMeeting) {
      pushSchoolOsToast({
        kind: "error",
        message: "Choose class hours in Calendar to continue onboarding."
      });
      return;
    }
    if (step?.id === "calendar-hours" && pendingSessionChoiceFlow) {
      pushSchoolOsToast({
        kind: "error",
        message: "Pick one Tirgul option in Calendar to continue onboarding."
      });
      return;
    }
    const lastIdx = MINIMAL_CORE_ONBOARDING_STEPS.length - 1;
    if (onboardingStepIndex >= lastIdx) {
      finishOnboarding(true);
      return;
    }
    setOnboardingStepIndex((n) => Math.min(lastIdx, n + 1));
  }, [finishOnboarding, onboardingActive, onboardingActiveCourseCountAtStart, onboardingStepIndex, pendingSessionChoiceFlow, state.courses]);

  const retreatOnboarding = useCallback(() => {
    if (!onboardingActive) return;
    setOnboardingStepIndex((n) => Math.max(0, n - 1));
  }, [onboardingActive]);

  const getAuthHeader = useCallback(async (): Promise<Record<string, string>> => {
    const supabase = getSupabaseClient();
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, []);

  const handleSignOut = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setIsSigningOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setIsSigningOut(false);
      setIsSettingsOpen(false);
    }
  }, []);

  const isAdmin = useMemo(() => {
    const email = user?.email?.toLowerCase();
    if (!email) return false;
    return ADMIN_EMAILS.has(email);
  }, [user?.email]);
  const visibleNavItems = useMemo(
    () => navItems.filter((item) => (item.id === "user-requests" ? isAdmin : true)),
    [isAdmin]
  );

  const loadAdminFeatureRequests = useCallback(async () => {
    if (!isAdmin) return;
    setAdminRequestsLoading(true);
    setAdminRequestsError(null);
    try {
      const headers = await getAuthHeader();
      const res = await fetch("/api/feature-requests", { headers, cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? "Failed to load feature requests.");
      }
      setAdminFeatureRequests(payload.requests ?? []);
    } catch (error) {
      setAdminRequestsError(error instanceof Error ? error.message : "Failed to load feature requests.");
    } finally {
      setAdminRequestsLoading(false);
    }
  }, [getAuthHeader, isAdmin]);

  const deleteAdminFeatureRequest = useCallback(async (requestId: number) => {
    if (!isAdmin) return;
    const confirmed = window.confirm("Delete this user request permanently?");
    if (!confirmed) return;
    setDeletingRequestId(requestId);
    setAdminRequestsError(null);
    try {
      const headers = {
        "Content-Type": "application/json",
        ...(await getAuthHeader())
      };
      const res = await fetch("/api/feature-requests", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ id: requestId })
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? "Failed to delete request.");
      }
      setAdminFeatureRequests((prev) => prev.filter((item) => item.id !== requestId));
      setDoneFeatureRequestMap((prev) => {
        const key = String(requestId);
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch (error) {
      setAdminRequestsError(error instanceof Error ? error.message : "Failed to delete request.");
    } finally {
      setDeletingRequestId(null);
    }
  }, [getAuthHeader, isAdmin]);

  const submitFeatureRequest = useCallback(async () => {
    const message = featureRequestMessage.trim();
    if (!message) {
      setFeatureRequestError("Please describe what is missing.");
      return;
    }
    setFeatureRequestSending(true);
    setFeatureRequestError(null);
    setFeatureRequestSuccess(null);
    try {
      const headers = {
        "Content-Type": "application/json",
        ...(await getAuthHeader())
      };
      const res = await fetch("/api/feature-requests", {
        method: "POST",
        headers,
        body: JSON.stringify({
          message,
          screenshots: featureRequestShots
        })
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? "Failed to send request.");
      }
      setFeatureRequestMessage("");
      setFeatureRequestShots([]);
      setFeatureRequestSuccess("Request sent. Thanks for the feedback.");
      if (isAdmin) {
        await loadAdminFeatureRequests();
      }
    } catch (error) {
      setFeatureRequestError(error instanceof Error ? error.message : "Failed to send request.");
    } finally {
      setFeatureRequestSending(false);
    }
  }, [featureRequestMessage, featureRequestShots, getAuthHeader, isAdmin, loadAdminFeatureRequests]);

  const onFeatureRequestPaste = useCallback(async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (imageFiles.length === 0) return;
    event.preventDefault();
    try {
      const remaining = Math.max(0, MAX_FEATURE_REQUEST_SCREENSHOTS - featureRequestShots.length);
      if (remaining <= 0) {
        setFeatureRequestError(`You can attach up to ${MAX_FEATURE_REQUEST_SCREENSHOTS} screenshots.`);
        return;
      }
      const toAttach = imageFiles.slice(0, remaining);
      const encoded = await Promise.all(
        toAttach.map(async (file, idx) => ({
          name: file.name || `pasted-screenshot-${Date.now()}-${idx + 1}.png`,
          mimeType: file.type || "image/png",
          dataUrl: await fileToDataUrl(file)
        }))
      );
      setFeatureRequestShots((prev) => [...prev, ...encoded].slice(0, MAX_FEATURE_REQUEST_SCREENSHOTS));
      setFeatureRequestError(null);
    } catch {
      setFeatureRequestError("Could not paste screenshot.");
    }
  }, [featureRequestShots.length]);

  useEffect(() => {
    if (!isSettingsOpen || !isAdmin) return;
    void loadAdminFeatureRequests();
  }, [isAdmin, isSettingsOpen, loadAdminFeatureRequests]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(FEATURE_REQUEST_DONE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return;
      const next: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === "string") next[key] = value;
      }
      setDoneFeatureRequestMap(next);
    } catch {
      setDoneFeatureRequestMap({});
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(FEATURE_REQUEST_DONE_STORAGE_KEY, JSON.stringify(doneFeatureRequestMap));
  }, [doneFeatureRequestMap]);

  useEffect(() => {
    if (!isAdmin && state.ui.activeView === "user-requests") {
      dispatch({ type: "set-view", payload: "dashboard" });
    }
  }, [dispatch, isAdmin, state.ui.activeView]);

  useEffect(() => {
    if (!isAdmin || state.ui.activeView !== "user-requests") return;
    void loadAdminFeatureRequests();
  }, [isAdmin, loadAdminFeatureRequests, state.ui.activeView]);

  useEffect(() => {
    if (!isAdmin || state.ui.activeView !== "user-requests") return;
    let cancelled = false;
    const checkGitSync = async () => {
      setGitSyncStatus((prev) => ({ ...prev, checking: true }));
      try {
        const headers = await getAuthHeader();
        const res = await fetch("/api/dev/git-sync-status", { headers, cache: "no-store" });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error ?? "Failed to read git sync status.");
        if (cancelled) return;
        setGitSyncStatus({
          available: Boolean(payload.available),
          clean: Boolean(payload.clean),
          ahead: typeof payload.ahead === "number" ? payload.ahead : 0,
          checking: false
        });
      } catch {
        if (cancelled) return;
        setGitSyncStatus({ available: false, clean: false, ahead: 0, checking: false });
      }
    };
    void checkGitSync();
    const id = window.setInterval(() => {
      void checkGitSync();
    }, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [getAuthHeader, isAdmin, state.ui.activeView]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CATALOG_DEGREE_STORAGE_KEY, catalogDegree);
  }, [catalogDegree]);

  const selectedCatalogDegreeOption = useMemo(
    () => catalogDegreeOptions.find((degree) => degree.id === catalogDegree) ?? null,
    [catalogDegree, catalogDegreeOptions]
  );

  const searchCatalogDegrees = useCallback(async (query: string) => {
    setCatalogDegreeSearchLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim().length > 0) params.set("q", query.trim());
      params.set("limit", "200");
      const res = await fetch(`/api/catalog/degrees/search?${params.toString()}`);
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? "Degree search failed");
      }
      const remote: unknown[] = Array.isArray(payload.degrees) ? payload.degrees : [];
      const normalized: CatalogDegreeOption[] = remote
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const rowObj = row as { roadmapCode?: unknown; label?: unknown };
          const roadmapCode = typeof rowObj.roadmapCode === "string" ? rowObj.roadmapCode.trim() : "";
          if (!roadmapCode) return null;
          const labelRaw = typeof rowObj.label === "string" ? rowObj.label.trim() : "";
          return {
            id: roadmapCode,
            roadmapCode,
            label: labelRaw || roadmapCode
          } satisfies CatalogDegreeOption;
        })
        .filter((row): row is CatalogDegreeOption => Boolean(row));
      const trimmedQuery = query.trim();
      if (trimmedQuery.length > 0) {
        setCatalogDegreeOptions(normalized);
      } else {
        const mergedMap = new Map<string, CatalogDegreeOption>();
        for (const base of DEFAULT_CATALOG_DEGREES) mergedMap.set(base.id, base);
        for (const degree of normalized) mergedMap.set(degree.id, degree);
        setCatalogDegreeOptions([...mergedMap.values()]);
        if (![...mergedMap.keys()].includes(catalogDegree)) {
          setCatalogDegree(DEFAULT_CATALOG_DEGREES[0]?.id ?? "biology");
        }
      }
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Degree search failed");
    } finally {
      setCatalogDegreeSearchLoading(false);
    }
  }, [catalogDegree]);

  useEffect(() => {
    if (!isSettingsOpen && !isCatalogPickerOpen) return;
    void searchCatalogDegrees(catalogDegreeSearchQuery);
  }, [catalogDegreeSearchQuery, isCatalogPickerOpen, isSettingsOpen, searchCatalogDegrees]);

  useEffect(() => {
    if (!onboardingActive) return;

    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        advanceOnboarding();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        retreatOnboarding();
      }
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [advanceOnboarding, onboardingActive, retreatOnboarding]);

  const skipOnboarding = useCallback(() => {
    const hasAtLeastOneActiveCourse = state.courses.some((course) => !course.archived);
    const hasAtLeastOneScheduledMeeting = state.courses.some((course) => !course.archived && course.meetings.length > 0);
    if (!hasAtLeastOneActiveCourse) {
      const coursesStepIndex = MINIMAL_CORE_ONBOARDING_STEPS.findIndex((step) => step.id === "add-course");
      setOnboardingStepIndex(coursesStepIndex >= 0 ? coursesStepIndex : 0);
      pushSchoolOsToast({
        kind: "error",
        message: "Add your first course before finishing onboarding."
      });
      return;
    }
    if (!hasAtLeastOneScheduledMeeting) {
      const chooseHoursStepIndex = MINIMAL_CORE_ONBOARDING_STEPS.findIndex((step) => step.id === "calendar-hours");
      setOnboardingStepIndex(chooseHoursStepIndex >= 0 ? chooseHoursStepIndex : 0);
      pushSchoolOsToast({
        kind: "error",
        message: "Confirm at least one class hour in Calendar before finishing onboarding."
      });
      return;
    }
    if (pendingSessionChoiceFlow) {
      const chooseHoursStepIndex = MINIMAL_CORE_ONBOARDING_STEPS.findIndex((step) => step.id === "calendar-hours");
      setOnboardingStepIndex(chooseHoursStepIndex >= 0 ? chooseHoursStepIndex : 0);
      pushSchoolOsToast({
        kind: "error",
        message: "Choose a Tirgul option in Calendar before finishing onboarding."
      });
      return;
    }
    finishOnboarding(true);
  }, [finishOnboarding, pendingSessionChoiceFlow, state.courses]);

  useEffect(() => {
    if (!onboardingActive || onboardingStep?.id !== "add-course") return;
    const hasAddedCourseDuringOnboarding = state.courses.filter((course) => !course.archived).length > onboardingActiveCourseCountAtStart;
    if (!hasAddedCourseDuringOnboarding) return;
    const chooseHoursStepIndex = MINIMAL_CORE_ONBOARDING_STEPS.findIndex((step) => step.id === "calendar-hours");
    setCalendarMode("week");
    dispatch({ type: "set-view", payload: "calendar" });
    if (chooseHoursStepIndex >= 0) {
      setOnboardingStepIndex(chooseHoursStepIndex);
    }
  }, [dispatch, onboardingActive, onboardingActiveCourseCountAtStart, onboardingStep?.id, state.courses]);

  useEffect(() => {
    if (!onboardingActive || onboardingStep?.id !== "calendar-day") return;
    setCalendarMode("day");
    const primaryCourse = activeCourses[0];
    if (!primaryCourse) return;
    const hasBookableTaskForCourse = state.tasks.some(
      (task) => task.courseId === primaryCourse.id && task.status !== "done"
    );
    if (hasBookableTaskForCourse) return;
    const demoTaskId = onboardingDemoTaskId ?? createId("task");
    if (!state.tasks.some((task) => task.id === demoTaskId)) {
      dispatch({
        type: "add-task",
        payload: {
          id: demoTaskId,
          title: "Drag me into your day plan",
          description: "Drop this task into a time slot to create a booked work block.",
          courseId: primaryCourse.id,
          status: "next",
          priority: "medium",
          effort: 1
        }
      });
    }
    setOnboardingDemoTaskId(demoTaskId);
  }, [activeCourses, dispatch, onboardingActive, onboardingDemoTaskId, onboardingStep?.id, state.tasks]);

  useEffect(() => {
    if (!selectedCourse) {
      return;
    }
    setEditName(selectedCourse.name);
    setEditCode(selectedCourse.code);
    setEditInstructor(selectedCourse.instructor ?? "");
    setEditNotes(selectedCourse.notes ?? "");
    setEditProgressMode(selectedCourse.progressMode);
    setEditManualProgress(selectedCourse.manualProgress);
    setEditColor(selectedCourse.color);
  }, [selectedCourse]);

  useEffect(() => {
    if (!ready || onboardingActive) return;
    if (state.ui.onboardingCompletedAt) return;
    if (state.courses.length > 0) return;
    beginOnboarding();
  }, [beginOnboarding, onboardingActive, ready, state.courses.length, state.ui.onboardingCompletedAt]);

  useEffect(() => {
    if (!onboardingActive || !onboardingStep) return;
    if (onboardingStep.ensureView && state.ui.activeView !== onboardingStep.ensureView) {
      dispatch({ type: "set-view", payload: onboardingStep.ensureView });
    }
    if (typeof onboardingStep.ensureUtilityOpen === "boolean") {
      setIsUtilityOpen(onboardingStep.ensureUtilityOpen);
    }
    setIsSettingsOpen(onboardingStep.ensureSettingsOpen === true);
    setIsCatalogPickerOpen(onboardingStep.ensureCatalogPickerOpen === true);
  }, [dispatch, onboardingActive, onboardingStep, state.ui.activeView]);

  useEffect(() => {
    if (!onboardingActive || onboardingStep?.id !== "class-notes" || !state.ui.showTaskComposer) return;
    dispatch({ type: "set-composer", payload: false });
  }, [dispatch, onboardingActive, onboardingStep?.id, state.ui.showTaskComposer]);

  useEffect(() => {
    if (!onboardingActive) {
      setOnboardingTargetElement(null);
      return;
    }
    const refresh = () => setOnboardingTargetElement(resolveOnboardingTarget());
    refresh();
    const id = window.setInterval(refresh, 250);
    return () => window.clearInterval(id);
  }, [onboardingActive, onboardingStepIndex, resolveOnboardingTarget, state.ui.activeView, isUtilityOpen, isSettingsOpen, isCatalogPickerOpen]);

  useEffect(() => {
    setVisibleCourseIds((current) => {
      const activeIds = activeCourses.map((course) => course.id);
      if (current.length === 0) {
        return activeIds;
      }
      const existingVisible = current.filter((id) => activeIds.includes(id));
      const newlyAdded = activeIds.filter((id) => !existingVisible.includes(id));
      const next = [...existingVisible, ...newlyAdded];
      return next.length === 0 ? activeIds : next;
    });
  }, [activeCourses]);

  const filteredTasks = useMemo(() => {
    const base = state.ui.selectedCourseId === "all"
      ? state.tasks
      : state.tasks.filter((task) => task.courseId === state.ui.selectedCourseId);

    switch (state.ui.activeView) {
      case "today":
        return getTodayTasks(base).sort(taskComparator);
      case "upcoming":
        return getUpcomingTasks(base).sort(taskComparator);
      case "overdue":
        return getOverdueTasks(base).sort(taskComparator);
      default:
        return [...base].sort(taskComparator);
    }
  }, [state.tasks, state.ui.activeView, state.ui.selectedCourseId]);

  // Old saved states may still point to removed sidebar tabs.
  useEffect(() => {
    if (!["today", "overdue", "list"].includes(state.ui.activeView)) return;
    dispatch({ type: "set-view", payload: "dashboard" });
  }, [state.ui.activeView, dispatch]);

  const searchResults = useMemo(
    () => {
      const base = searchAll(searchQuery, state.tasks, state.courses);
      const q = searchQuery.trim().toLowerCase();
      if (!q) return base;

      const noteResults = (state.classNotes ?? [])
        .map((note) => {
          const course = state.courses.find((c) => c.id === note.courseId);
          const bodyPreview = note.bodyMarkdown.replace(/<[^>]+>/g, " ").slice(0, 240);
          const haystack = `${note.title} ${bodyPreview} ${note.occurredOn} ${course?.name ?? ""} ${course?.code ?? ""}`.toLowerCase();
          const score = haystack.includes(q) ? 7 + Number(note.title.toLowerCase().includes(q)) : 0;
          return {
            id: note.id,
            kind: "note" as const,
            title: note.title || "Class note",
            subtitle: `${course ? `${course.code} · ${course.name}` : "Class note"} · ${note.occurredOn}`,
            score
          };
        })
        .filter((result) => result.score > 0);

      const featureCatalog: Array<{ id: string; title: string; subtitle: string; terms: string; score: number }> = [
        {
          id: "feature-request-panel",
          title: "Request a missing feature",
          subtitle: "Settings → feedback request box",
          terms: "feature request feedback bug report suggestion request box",
          score: 11
        },
        {
          id: "user-requests-tab",
          title: "User Requests",
          subtitle: "Sidebar → user feature requests list",
          terms: "user requests feature requests admin requests inbox",
          score: 10
        },
        {
          id: "settings-degree-panel",
          title: "Degree roadmap import",
          subtitle: "Settings → degree search and load roadmap",
          terms: "degree roadmap catalog huji courses import settings",
          score: 9
        }
      ];

      const featureResults = featureCatalog
        .filter((item) => `${item.title} ${item.subtitle} ${item.terms}`.toLowerCase().includes(q))
        .map((item) => ({
          id: item.id,
          kind: "feature" as const,
          title: item.title,
          subtitle: item.subtitle,
          score: item.score + Number(item.title.toLowerCase().includes(q))
        }));

      return [...base, ...noteResults, ...featureResults]
        .sort((a, b) => b.score - a.score)
        .slice(0, 16);
    },
    [searchQuery, state.tasks, state.courses, state.classNotes]
  );
  const focusedTask = state.ui.focusedTaskId
    ? state.tasks.find((task) => task.id === state.ui.focusedTaskId)
    : undefined;

  const endedWorkBlock = endedWorkBlockId ? state.workBlocks.find((block) => block.id === endedWorkBlockId) : undefined;
  const endedWorkBlockTask = endedWorkBlock ? state.tasks.find((task) => task.id === endedWorkBlock.taskId) : undefined;
  const closeEndedWorkBlockPrompt = useCallback(() => {
    endedWorkBlockPromptCooldownUntilRef.current = Date.now() + 5000;
    setEndedWorkBlockId(null);
  }, []);

  useEffect(() => {
    if (!ready) return;

    const syncInProgressFromRunningBlocks = () => {
      const nowTs = Date.now();
      state.tasks.forEach((task) => {
        if (task.status === "done" || task.status === "in-progress") return;
        if (isTaskBlockUnderway(task.id, state.workBlocks, nowTs)) {
          dispatch({ type: "update-task", payload: { id: task.id, status: "in-progress" } });
        }
      });
    };

    syncInProgressFromRunningBlocks();
    const interval = window.setInterval(syncInProgressFromRunningBlocks, 60_000);
    window.addEventListener("focus", syncInProgressFromRunningBlocks);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncInProgressFromRunningBlocks);
    };
  }, [dispatch, ready, state.tasks, state.workBlocks]);

  useEffect(() => {
    if (!ready) return;

    const checkEndedBlocks = () => {
      if (Date.now() < endedWorkBlockPromptCooldownUntilRef.current) return;
      if (endedWorkBlockId) return;
      const nowTs = Date.now();
      const next = state.workBlocks.find((block) => {
        if (block.status !== "scheduled") return false;
        if (promptedWorkBlocksRef.current.has(block.id)) return false;
        return new Date(block.endAt).getTime() <= nowTs;
      });
      if (next) {
        promptedWorkBlocksRef.current.add(next.id);
        setEndedWorkBlockId(next.id);
      }
    };

    checkEndedBlocks();
    const interval = window.setInterval(checkEndedBlocks, 30_000);
    window.addEventListener("focus", checkEndedBlocks);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", checkEndedBlocks);
    };
  }, [endedWorkBlockId, ready, state.workBlocks]);

  const overdueCount = useMemo(() => getOverdueTasks(state.tasks).length, [state.tasks]);
  const dueTodayCount = useMemo(() => getTodayTasks(state.tasks).filter((task) => task.status !== "done").length, [state.tasks]);
  const upcomingClass = useMemo(() => {
    const now = new Date();
    const occurrences = expandMeetingOccurrences(activeCourses, now, addDays(now, 14));
      const next = occurrences
      .map((occurrence) => {
        const [hour, minute] = occurrence.meeting.start.split(":").map((part) => Number(part));
        const startAt = new Date(occurrence.date);
        startAt.setHours(Number.isFinite(hour) ? hour : 0, Number.isFinite(minute) ? minute : 0, 0, 0);
        return { occurrence, startAt };
      })
      .filter((item) => item.startAt.getTime() >= now.getTime())
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
    if (!next) return null;
    const startLabel = next.startAt.toLocaleString(undefined, {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
    return {
      code: next.occurrence.course.code || next.occurrence.course.name,
      name: next.occurrence.course.name,
      detail: startLabel,
      color: next.occurrence.course.color
    };
  }, [activeCourses]);
  const topPriorityTask = useMemo(() => {
    const priorityRank: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    const candidates = state.tasks.filter((task) => task.status !== "done");
    if (candidates.length === 0) return null;
    const sorted = [...candidates].sort((a, b) => {
      const rankDiff = priorityRank[a.priority] - priorityRank[b.priority];
      if (rankDiff !== 0) return rankDiff;
      const dueA = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const dueB = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      return dueA - dueB;
    });
    return sorted[0] ?? null;
  }, [state.tasks]);
  const completedThisWeek = useMemo(() => {
    const map = completedByWeek(state.tasks);
    const key = getWeekKey(nowIso());
    return map[key] ?? 0;
  }, [state.tasks]);

  const kanbanWeeklyBuckets = useMemo(() => {
    const map = completedByWeek(state.tasks);
    return Object.keys(map)
      .sort()
      .reverse()
      .slice(0, 12)
      .map((weekKey) => ({ weekKey, count: map[weekKey] ?? 0 }));
  }, [state.tasks]);

  const analytics = useMemo(() => {
    const completed = completedByWeek(state.tasks);
    const workload = workloadByCourse(state.tasks, activeCourses);
    return { completed, workload };
  }, [state.tasks, activeCourses]);

  const handleCreateTask = useCallback(
    (input: {
      id?: string;
      title: string;
      description?: string;
      courseId?: string | "general";
      status?: TaskStatus;
      dueAt?: string;
      priority?: TaskPriority;
      effort?: number;
      tags?: string[];
      attachments?: TaskAttachment[];
      recurring?: Task["recurring"];
    }) => {
      addTask(input);
      // Ensure the just-created task is visible immediately in filtered views.
      dispatch({ type: "set-course-filter", payload: "all" });
    },
    [addTask, dispatch]
  );

  const kanbanTasks = useMemo(() => {
    const query = quickTaskSearch.trim().toLowerCase();
    const baseTasks = [...state.tasks].sort(taskComparator);
    if (!query) return baseTasks;
    return baseTasks.filter((task) => {
      const course = state.courses.find((item) => item.id === task.courseId);
      const haystack = [task.title, task.description, task.status, task.priority, course?.name ?? "", course?.code ?? "", ...(task.tags ?? [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [quickTaskSearch, state.courses, state.tasks]);

  const kanbanBoardTasks = useMemo(() => kanbanTasks.filter((task) => task.status !== "done"), [kanbanTasks]);
  const kanbanCompletedTasks = useMemo(() => kanbanTasks.filter((task) => task.status === "done"), [kanbanTasks]);
  const kanbanBoardTotal = useMemo(() => state.tasks.filter((task) => task.status !== "done").length, [state.tasks]);
  const kanbanCompletedTotal = useMemo(() => state.tasks.filter((task) => task.status === "done").length, [state.tasks]);

  const handleKanbanToggleDone = useCallback(
    (id: string) => {
      const task = state.tasks.find((t) => t.id === id);
      if (!task) {
        return;
      }
      toggleTaskDoneWithUndo(id);
    },
    [state.tasks, toggleTaskDoneWithUndo]
  );
  const handleFocusTask = useCallback((id: string) => {
    dispatch({ type: "set-focus", payload: id });
  }, [dispatch]);
  const handleDeleteTask = useCallback(
    (id: string) => {
      const task = state.tasks.find((t) => t.id === id);
      if (task?.attachments?.length) {
        void deleteTaskAttachmentBlobsForTask(user?.id, id).catch(() => {});
      }
      dispatch({ type: "delete-task", payload: id });
    },
    [dispatch, state.tasks]
  );
  const handleOpenComposer = useCallback((courseId?: string | "general") => {
    setComposerInitialCourseId(courseId);
    dispatch({ type: "set-composer", payload: true });
  }, [dispatch]);
  const handleCalendarSessionClick = useCallback((courseId: string, meetingId: string, anchorDate?: Date) => {
    setSelectedCalendarSession({
      courseId,
      meetingId,
      anchorDate: anchorDate ?? selectedCalendarDate
    });
  }, [selectedCalendarDate]);
  const handleCalendarSessionDoubleClick = useCallback((courseId: string, meetingId: string, anchorDate?: Date) => {
    const target = {
      courseId,
      meetingId,
      anchorDate: anchorDate ?? selectedCalendarDate
    };
    setSelectedCalendarSession(target);
  }, [selectedCalendarDate]);

  const openClassNoteDraftForSession = useCallback(
    (courseId: string, meetingId: string, anchorDate: Date) => {
      const course = activeCourses.find((c) => c.id === courseId);
      const meeting = course?.meetings.find((m) => m.id === meetingId);
      const occurredOn = formatDateKey(anchorDate);
      const drafts = (state.classNotes ?? []).filter(
        (n) => n.courseId === courseId && n.occurredOn === occurredOn && n.status === "draft"
      );
      let noteId: string;
      if (drafts[0]) {
        noteId = drafts[0].id;
      } else {
        noteId = createId("cnote");
        dispatch({
          type: "add-class-note",
          payload: {
            id: noteId,
            courseId,
            occurredOn,
            meetingId,
            title: defaultClassNoteTitle(occurredOn, meeting?.title),
            bodyMarkdown: "",
            status: "draft"
          }
        });
      }
      dispatch({ type: "set-view", payload: "class-notes" });
      setClassNoteEditorId(noteId);
    },
    [activeCourses, dispatch, state.classNotes]
  );

  const dismissPostSessionPrompt = useCallback(() => {
    setPostSessionPrompt(null);
  }, []);

  const selectedSessionCourse = selectedCalendarSession ? activeCourses.find((c) => c.id === selectedCalendarSession.courseId) : undefined;
  const selectedSessionMeeting =
    selectedSessionCourse && selectedCalendarSession
      ? selectedSessionCourse.meetings.find((m) => m.id === selectedCalendarSession.meetingId)
      : undefined;

  useEffect(() => {
    if (selectedCalendarSession && (!selectedSessionCourse || !selectedSessionMeeting)) {
      setSelectedCalendarSession(null);
    }
  }, [selectedCalendarSession, selectedSessionCourse, selectedSessionMeeting]);

  const deleteSelectedSession = useCallback((scope: "single" | "series") => {
    if (!selectedCalendarSession || !selectedSessionCourse || !selectedSessionMeeting) return;
    if (scope === "series" || (selectedSessionMeeting.recurrence?.cadence ?? "weekly") === "none") {
      updateCourseWithUndo({
        id: selectedSessionCourse.id,
        meetings: selectedSessionCourse.meetings.filter((meeting) => meeting.id !== selectedSessionMeeting.id)
      });
      setSelectedCalendarSession(null);
      return;
    }
    const dateKey = formatDateKey(selectedCalendarSession.anchorDate);
    const recurrence = selectedSessionMeeting.recurrence ?? { cadence: "weekly" as const, interval: 1, daysOfWeek: [selectedSessionMeeting.day] };
    const nextExceptions = Array.from(new Set([...(recurrence.exceptions ?? []), dateKey]));
    updateCourseWithUndo({
      id: selectedSessionCourse.id,
      meetings: selectedSessionCourse.meetings.map((meeting) =>
        meeting.id === selectedSessionMeeting.id
          ? { ...meeting, recurrence: { ...recurrence, exceptions: nextExceptions } }
          : meeting
      )
    });
    setSelectedCalendarSession(null);
  }, [selectedCalendarSession, selectedSessionCourse, selectedSessionMeeting, updateCourseWithUndo]);

  const deleteSelectedSessionFuture = useCallback(() => {
    if (!selectedCalendarSession || !selectedSessionCourse || !selectedSessionMeeting) return;
    const recurrence = selectedSessionMeeting.recurrence;
    if (!recurrence || recurrence.cadence === "none") {
      deleteSelectedSession("single");
      return;
    }
    const untilDate = new Date(selectedCalendarSession.anchorDate);
    untilDate.setDate(untilDate.getDate() - 1);
    const untilIso = new Date(`${formatDateKey(untilDate)}T23:59:59`).toISOString();
    updateCourseWithUndo({
      id: selectedSessionCourse.id,
      meetings: selectedSessionCourse.meetings.map((meeting) =>
        meeting.id === selectedSessionMeeting.id
          ? { ...meeting, recurrence: { ...recurrence, until: untilIso } }
          : meeting
      )
    });
    setSelectedCalendarSession(null);
  }, [deleteSelectedSession, selectedCalendarSession, selectedSessionCourse, selectedSessionMeeting, updateCourseWithUndo]);

  const [copiedSessionMeeting, setCopiedSessionMeeting] = useState<CourseMeeting | null>(null);

  useEffect(() => {
    const onCalendarKeyDown = (event: KeyboardEvent) => {
      if (state.ui.activeView !== "calendar") return;
      if (!selectedCalendarSession || !selectedSessionCourse || !selectedSessionMeeting) return;
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (typing) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        event.stopPropagation();
        setSessionDeletePrompt({
          courseId: selectedCalendarSession.courseId,
          meetingId: selectedCalendarSession.meetingId,
          anchorDate: selectedCalendarSession.anchorDate
        });
        return;
      }
      if (!event.metaKey && !event.ctrlKey && (event.key.toLowerCase() === "n" || event.key === "מ")) {
        event.preventDefault();
        event.stopPropagation();
        openClassNoteDraftForSession(selectedCalendarSession.courseId, selectedCalendarSession.meetingId, selectedCalendarSession.anchorDate);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        event.stopPropagation();
        setCopiedSessionMeeting({ ...selectedSessionMeeting });
        pushSchoolOsToast({ kind: "success", message: "Session copied." });
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v" && copiedSessionMeeting) {
        event.preventDefault();
        event.stopPropagation();
        const day = getWeekDayFromDate(selectedCalendarDate);
        const pasted: CourseMeeting = {
          ...copiedSessionMeeting,
          id: createId("meeting"),
          day,
          anchorDate: new Date(`${formatDateKey(selectedCalendarDate)}T12:00:00`).toISOString(),
          recurrence:
            copiedSessionMeeting.recurrence?.cadence === "weekly"
              ? { ...copiedSessionMeeting.recurrence, daysOfWeek: [day] }
              : copiedSessionMeeting.recurrence
        };
        updateCourseWithUndo({
          id: selectedSessionCourse.id,
          meetings: [...selectedSessionCourse.meetings, pasted]
        });
        pushSchoolOsToast({ kind: "success", message: "Session duplicated." });
      }
    };
    window.addEventListener("keydown", onCalendarKeyDown, true);
    return () => window.removeEventListener("keydown", onCalendarKeyDown, true);
  }, [
    copiedSessionMeeting,
    deleteSelectedSession,
    deleteSelectedSessionFuture,
    openClassNoteDraftForSession,
    selectedCalendarDate,
    selectedCalendarSession,
    selectedSessionCourse,
    selectedSessionMeeting,
    state.ui.activeView,
    updateCourseWithUndo
  ]);

  const todaysSessionOccurrences = useMemo(() => {
    const day = new Date();
    const start = startOfDay(day);
    const end = startOfDay(day);
    return expandMeetingOccurrences(activeCourses, start, end);
  }, [activeCourses]);

  useEffect(() => {
    if (!ready) return;

    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }
      if (postSessionPromptRef.current) return;
      const now = new Date();
      const todayKey = formatDateKey(now);
      const nowMin = now.getHours() * 60 + now.getMinutes();
      for (const occ of todaysSessionOccurrences) {
        if (occ.meeting.isAllDay) continue;
        const meetingId = occ.meeting.id;
        if (!meetingId) continue;
        const key = formatDateKey(occ.date);
        if (key !== todayKey) continue;
        const endM = Math.round(parseTimeValue(occ.meeting.end) * 60);
        const startM = Math.round(parseTimeValue(occ.meeting.start) * 60);
        if (nowMin <= endM) continue;
        if (nowMin > endM + 240) continue;
        if (nowMin < startM) continue;
        const promptKey = `${occ.course.id}-${meetingId}-${key}`;
        if (promptedPostSessionRef.current.has(promptKey)) continue;

        if (classNoteExistsForSession(state.classNotes, occ.course.id, meetingId, key)) {
          promptedPostSessionRef.current.add(promptKey);
          persistPostSessionPromptDismissedKey(promptKey);
          continue;
        }

        promptedPostSessionRef.current.add(promptKey);
        persistPostSessionPromptDismissedKey(promptKey);
        setPostSessionPrompt({
          courseId: occ.course.id,
          meetingId,
          occurredOn: key,
          courseName: occ.course.name,
          sessionLabel: occ.meeting.title?.trim() || formatSessionType(occ.meeting.type)
        });
        break;
      }
    };

    tick();
    const id = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    window.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
      window.removeEventListener("visibilitychange", tick);
    };
  }, [ready, state.classNotes, todaysSessionOccurrences]);

  useEffect(() => {
    if (state.ui.activeView !== "kanban") {
      return;
    }
    if (state.ui.selectedCourseId !== "all") {
      dispatch({ type: "set-course-filter", payload: "all" });
    }
  }, [dispatch, state.ui.activeView, state.ui.selectedCourseId]);

  const onCreateCourse = () => {
    const trimmedName = newCourseName.trim();
    if (!trimmedName) {
      return;
    }
    const normalizedCode = newCourseCode.trim() || trimmedName;
    const newCourseId = createId("course");
    addCourse({
      id: newCourseId,
      name: trimmedName,
      code: normalizedCode,
      color: newCourseColor,
      progressMode: "manual"
    });
    setFreshlyAddedCourseId(newCourseId);
    setNewCourseName("");
    setNewCourseCode("");
    setNewCourseColor(coursePalette[0]);
    setIsAddCourseOpen(false);
    setIsCourseActionsOpen(false);
  };

  const runCatalogSearch = useCallback(async (query: string) => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const url = `/api/catalog/search?q=${encodeURIComponent(query)}&limit=20`;
      const res = await fetch(url, { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? "Failed to search catalog");
      }
      setCatalogViewMode("search");
      setCatalogResults(payload.courses ?? []);
      setCatalogFreshness(payload.freshness ?? null);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Failed to search catalog");
      setCatalogResults([]);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isCatalogPickerOpen) return;
    const trimmed = catalogQuery.trim();
    if (!trimmed) return;
    const handle = window.setTimeout(() => {
      runCatalogSearch(trimmed);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [catalogQuery, isCatalogPickerOpen, runCatalogSearch]);

  const refreshCatalog = useCallback(async () => {
    setCatalogRefreshing(true);
    setCatalogError(null);
    try {
      const headers = await getAuthHeader();
      const res = await fetch("/api/catalog/refresh", {
        method: "POST",
        headers
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? "Catalog refresh failed");
      }
      const trimmed = catalogQuery.trim();
      if (!(catalogViewMode === "roadmap" && !trimmed)) {
        await runCatalogSearch(trimmed);
      }
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Catalog refresh failed");
    } finally {
      setCatalogRefreshing(false);
    }
  }, [catalogQuery, catalogViewMode, getAuthHeader, runCatalogSearch]);

  const importCatalogCourse = useCallback(async (course: CatalogSearchCourse) => {
    const alreadyLocal = state.courses.some(
      (item) => item.source === course.source && item.externalCourseId === course.externalId
    );
    if (alreadyLocal) {
      setCatalogError("Course already exists in your courses.");
      return;
    }
    setCatalogImportingId(course.externalId);
    setCatalogError(null);
    try {
      const headers = {
        "Content-Type": "application/json",
        ...(await getAuthHeader())
      };
      const res = await fetch("/api/catalog/import", {
        method: "POST",
        headers,
        body: JSON.stringify({ source: course.source, externalId: course.externalId })
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? "Import failed");
      }
      const imported = payload.course as CatalogSearchCourse & { updatedAt?: string };
      const meetings = (payload.meetings ?? []) as CatalogSearchMeeting[];
      const meetingChoices = (payload.meetingChoices ?? []) as ImportedMeetingChoiceSet[];
      const inferMeetingKind = (meetingType?: string | null): CourseMeeting["type"] => {
        const text = (meetingType ?? "").toLowerCase();
        if (text.includes("תרגיל") || text.includes("tutorial")) return "tutorial";
        if (text.includes("מעבדה") || text.includes("lab")) return "lab";
        if (text.includes("office")) return "office-hours";
        return "lecture";
      };
      const mappedMeetings: CourseMeeting[] = meetings
        .filter((m) => m.weekday && m.start_time && m.end_time)
        .map((m) => ({
          day: m.weekday,
          start: m.start_time,
          end: m.end_time,
          title: m.meeting_type ?? "Lecture",
          location: m.location ?? undefined,
          type: inferMeetingKind(m.meeting_type),
          recurrence: { cadence: "weekly" as const, interval: 1, daysOfWeek: [m.weekday] }
        }));

      const normalizedImportedTitle = (imported.nameHe || imported.nameEn || imported.courseNumber)
        .replace(/^Syllabus\s*-\s*/i, "")
        .replace(/\s+/g, " ")
        .trim();
      const dedupedImportedTitle = dedupeLabelSegments(normalizedImportedTitle);

      const newCourseId = createId("course");
      const selectedColor = pickDistinctCourseColor(state.courses.map((item) => item.color));
      addCourse({
        id: newCourseId,
        name: dedupedImportedTitle,
        code: imported.courseNumber,
        source: imported.source,
        externalCourseId: imported.externalId,
        catalogLastSyncedAt: imported.updatedAt ?? new Date().toISOString(),
        color: selectedColor,
        progressMode: "manual",
        meetings: mappedMeetings
      });
      setFreshlyAddedCourseId(newCourseId);
      setVisibleCourseIds((current) => (current.includes(newCourseId) ? current : [...current, newCourseId]));
      if (meetingChoices.length > 0) {
        const mappedChoiceSets = meetingChoices
          .filter((set) => (set.options ?? []).length > 1)
          .map((set) => ({
            setId: set.setId,
            label: set.label,
            options: set.options.map((option) => ({
              optionId: option.optionId,
              label: option.label,
              meetings: (option.meetings ?? [])
                .filter((m) => m.weekday && m.start_time && m.end_time)
                .map((m) => ({
                  id: createId("meeting"),
                  day: m.weekday,
                  start: m.start_time,
                  end: m.end_time,
                  title: m.meeting_type ?? set.label,
                  location: m.location ?? undefined,
                  type: inferMeetingKind(m.meeting_type),
                  recurrence: { cadence: "weekly" as const, interval: 1, daysOfWeek: [m.weekday] }
                }))
            }))
          }))
          .filter((set) => set.options.some((option) => option.meetings.length > 0))
          .sort((a, b) => getImportedChoiceSetPriority(a.label) - getImportedChoiceSetPriority(b.label));
        if (mappedChoiceSets.length > 0) {
          setPendingSessionChoiceFlow({
          courseId: newCourseId,
          courseName: dedupedImportedTitle,
          courseColor: selectedColor,
          activeSetIndex: 0,
          sets: mappedChoiceSets
          });
          dispatch({ type: "set-view", payload: "calendar" });
          setCalendarMode("week");
        }
      }
      setIsCatalogPickerOpen(false);
      setIsSettingsOpen(false);
      setCatalogQuery("");
      setIsCourseActionsOpen(false);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : "Import failed");
    } finally {
      setCatalogImportingId(null);
    }
  }, [addCourse, dispatch, getAuthHeader, state.courses]);

  const loadDegreeRoadmapCourses = useCallback(async (degreeId: string, showToast = true): Promise<boolean> => {
    const requestSeq = degreeLoadRequestSeqRef.current + 1;
    degreeLoadRequestSeqRef.current = requestSeq;
    setCatalogDegreeImporting(true);
    setCatalogError(null);
    const cachedCourses = !showToast ? readDegreeRoadmapCache(degreeId) : null;
    if (cachedCourses && degreeLoadRequestSeqRef.current === requestSeq) {
      setCatalogViewMode("roadmap");
      setCatalogResults(cachedCourses);
      setCatalogQuery("");
      setIsCatalogPickerOpen(true);
      setIsCourseActionsOpen(false);
      setCatalogDegreeImporting(false);
      return true;
    }
    setCatalogResults([]);
    try {
      const headers = {
        "Content-Type": "application/json",
        ...(await getAuthHeader())
      };
      const res = await fetch("/api/catalog/import-degree", {
        method: "POST",
        headers,
        body: JSON.stringify({
          degreeId,
          roadmapCode: catalogDegreeOptions.find((degree) => degree.id === degreeId)?.roadmapCode ?? degreeId
        })
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? "Degree import failed");
      }
      if (degreeLoadRequestSeqRef.current !== requestSeq) {
        return false;
      }
      const courses = (payload.courses ?? []) as Array<CatalogSearchCourse & { updatedAt?: string }>;
      const roadmapCode = typeof payload.roadmapCode === "string" ? payload.roadmapCode : null;
      writeDegreeRoadmapCache(degreeId, courses);
      setCatalogViewMode("roadmap");
      setCatalogResults(courses);
      setCatalogQuery("");
      setIsCatalogPickerOpen(true);
      setIsCourseActionsOpen(false);
      if (showToast) {
        pushSchoolOsToast({
          kind: "success",
          message: courses.length > 0
            ? `Loaded ${courses.length} roadmap courses${roadmapCode ? ` (${roadmapCode})` : ""}. Use Add course to pick this semester.`
            : "No roadmap courses found for this degree."
        });
      }
      return true;
    } catch (error) {
      if (degreeLoadRequestSeqRef.current !== requestSeq) {
        return false;
      }
      setCatalogError(error instanceof Error ? error.message : "Degree import failed");
      return false;
    } finally {
      if (degreeLoadRequestSeqRef.current === requestSeq) {
        setCatalogDegreeImporting(false);
      }
    }
  }, [catalogDegreeOptions, getAuthHeader, readDegreeRoadmapCache, writeDegreeRoadmapCache]);

  const importFullDegreePlan = useCallback(async () => {
    const loaded = await loadDegreeRoadmapCourses(catalogDegree, true);
    if (!loaded) return;
    dispatch({ type: "set-view", payload: "courses" });
    setIsSettingsOpen(false);
    if (onboardingActive) {
      const addCourseStepIndex = MINIMAL_CORE_ONBOARDING_STEPS.findIndex((step) => step.id === "add-course");
      if (addCourseStepIndex >= 0) {
        setOnboardingStepIndex(addCourseStepIndex);
      }
    }
  }, [catalogDegree, dispatch, loadDegreeRoadmapCourses, onboardingActive]);

  const selectCatalogDegreeOption = useCallback((degree: CatalogDegreeOption) => {
    setCatalogDegree(degree.id);
    setCatalogDegreeSearchQuery(degree.label);
    setIsCatalogDegreeOptionsOpen(false);
    setCatalogQuery("");
  }, []);

  useEffect(() => {
    if (!isCatalogPickerOpen) return;
    if (catalogQuery.trim().length > 0) return;
    void loadDegreeRoadmapCourses(catalogDegree, false);
  }, [catalogDegree, catalogQuery, isCatalogPickerOpen, loadDegreeRoadmapCourses]);

  const groupedRoadmapCourses = useMemo(() => {
    if (catalogViewMode !== "roadmap") return [];
    const groups = new Map<string, CatalogSearchCourse[]>();
    for (const course of catalogResults) {
      const year = (course.roadmapYearLabel ?? "").trim() || "Other roadmap courses";
      const section = (course.roadmapSectionLabel ?? "").trim();
      const key = section ? `${year} · ${section}` : year;
      const list = groups.get(key) ?? [];
      list.push(course);
      groups.set(key, list);
    }
    const ordered = [...groups.entries()]
      .map(([label, courses]) => ({
        label,
        courses: [...courses].sort((a, b) => a.courseNumber.localeCompare(b.courseNumber))
      }))
      .sort((a, b) => {
        const aYear = Number((a.label.match(/Year\s+(\d+)/i) ?? [])[1] ?? Number.POSITIVE_INFINITY);
        const bYear = Number((b.label.match(/Year\s+(\d+)/i) ?? [])[1] ?? Number.POSITIVE_INFINITY);
        if (aYear !== bYear) return aYear - bYear;
        return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });
      });
    return ordered;
  }, [catalogResults, catalogViewMode]);

  const activeChoiceSet = useMemo(() => {
    if (!pendingSessionChoiceFlow) return null;
    return pendingSessionChoiceFlow.sets[pendingSessionChoiceFlow.activeSetIndex] ?? null;
  }, [pendingSessionChoiceFlow]);

  const tentativeCalendarOptions = useMemo(() => {
    if (!pendingSessionChoiceFlow || !activeChoiceSet) return [];
    return activeChoiceSet.options.map((option, index) => ({
      optionId: option.optionId,
      optionIndex: index + 1,
      displayLabel: `Option ${index + 1}`,
      label: option.label,
      courseId: pendingSessionChoiceFlow.courseId,
      courseName: pendingSessionChoiceFlow.courseName,
      courseColor: pendingSessionChoiceFlow.courseColor,
      meetings: option.meetings
    }));
  }, [activeChoiceSet, pendingSessionChoiceFlow]);

  const selectTentativeCalendarOption = useCallback((optionId: string) => {
    if (!pendingSessionChoiceFlow) return;
    const currentSet = pendingSessionChoiceFlow.sets[pendingSessionChoiceFlow.activeSetIndex];
    if (!currentSet) return;
    const picked = currentSet.options.find((option) => option.optionId === optionId);
    if (!picked) return;
    const course = state.courses.find((item) => item.id === pendingSessionChoiceFlow.courseId);
    if (!course) return;
    const existingKeys = new Set(
      course.meetings.map((meeting) => `${meeting.day}-${meeting.start}-${meeting.end}-${meeting.title ?? ""}-${meeting.location ?? ""}`)
    );
    const nextMeetings = [...course.meetings];
    for (const meeting of picked.meetings) {
      const key = `${meeting.day}-${meeting.start}-${meeting.end}-${meeting.title ?? ""}-${meeting.location ?? ""}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      nextMeetings.push(meeting);
    }
    dispatch({
      type: "update-course",
      payload: {
        id: course.id,
        meetings: nextMeetings
      }
    });
    if (pendingSessionChoiceFlow.activeSetIndex >= pendingSessionChoiceFlow.sets.length - 1) {
      setPendingSessionChoiceFlow(null);
      pushSchoolOsToast({
        kind: "success",
        message: "Session choice saved. Other options were removed."
      });
      return;
    }
    setPendingSessionChoiceFlow((current) => current
      ? { ...current, activeSetIndex: current.activeSetIndex + 1 }
      : current);
  }, [dispatch, pendingSessionChoiceFlow, state.courses]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="animate-pulse text-lg">Booting School OS...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f8fa_0%,#f4f5f7_100%)] text-slate-900 dark:bg-[linear-gradient(180deg,#090b0d_0%,#0d1014_100%)] dark:text-slate-100">
      <div className="mx-auto grid h-[100dvh] max-w-[1560px] grid-cols-1 gap-5 overflow-hidden p-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:grid-rows-1">
        <aside className="animate-fadeSlide space-y-4 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">
          <Panel className="bg-white/88 dark:bg-[#101317]/90">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-2">
                <h1 className="text-[18px] font-semibold tracking-tight">School OS</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">7-course command center</p>
              </div>
              <Button variant="outline" className="h-8 px-2.5 text-xs" onClick={() => setIsSettingsOpen(true)} data-onboarding="settings-button">
                <Cog className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="mt-5 space-y-1">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = state.ui.activeView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => dispatch({ type: "set-view", payload: item.id })}
                    data-onboarding={`nav-${item.id}`}
                    className={`flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-[15px] transition ${active ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-500 hover:bg-slate-100/80 dark:text-slate-400 dark:hover:bg-white/[0.04]"}`}
                  >
                    <Icon className="h-[15px] w-[15px]" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel className="bg-white/88 dark:bg-[#101317]/90">
            <div className="flex items-center justify-between text-sm">
              <span>Theme</span>
              <div className="flex gap-1">
                <button onClick={() => dispatch({ type: "set-theme", payload: "light" })} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-white/10"><Sun className="h-4 w-4" /></button>
                <button onClick={() => dispatch({ type: "set-theme", payload: "dark" })} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-white/10"><Moon className="h-4 w-4" /></button>
              </div>
            </div>
          </Panel>
        </aside>

        <main
          className={
            state.ui.activeView === "kanban" || state.ui.activeView === "calendar" || state.ui.activeView === "class-notes"
              ? "animate-fadeSlide flex h-full min-h-0 flex-col gap-5 overflow-hidden"
              : "animate-fadeSlide space-y-5"
          }
        >
          {state.ui.activeView !== "calendar" && (
            <Panel className="shrink-0 bg-white/90 dark:bg-[#101317]/90">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-[34px] font-semibold tracking-[-0.03em]">{viewTitle(state.ui.activeView)}</h2>
                  <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">One month to launch. Everything in one place.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {state.ui.activeView === "kanban" && (
                    <div className="relative min-w-[260px]">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={quickTaskSearch}
                        onChange={(event) => setQuickTaskSearch(event.target.value)}
                        placeholder="Quick search tasks..."
                        className="w-full rounded-full border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04]"
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "set-search", payload: true })}
                    className="inline-flex h-10 min-w-[260px] items-center justify-between rounded-full border border-slate-200 bg-slate-50 px-4 text-sm text-slate-600 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Search className="h-4 w-4 text-slate-400" />
                      Search tasks, notes, features...
                    </span>
                    <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-500 dark:border-white/15 dark:bg-white/[0.06] dark:text-slate-300">
                      <Command className="mr-1 h-3 w-3" />
                      K
                    </span>
                  </button>
                  <Button variant="outline" onClick={() => setIsUtilityOpen(true)} data-onboarding="guide-button">
                    <BookOpen className="mr-1 h-4 w-4" />
                    Guide
                  </Button>
                </div>
              </div>
            </Panel>
          )}

          {state.ui.activeView === "dashboard" && (
            <>
              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard title="Due Today" value={`${dueTodayCount}`} note="Tasks still open for today." icon={Timer} />
                <MetricCard title="Overdue" value={`${overdueCount}`} icon={TriangleAlert} tone="warn" />
                <Panel
                  className="bg-white/90 dark:bg-[#101317]/90"
                  style={
                    upcomingClass
                      ? {
                          borderColor: `${upcomingClass.color}66`,
                          boxShadow: `inset 0 0 0 1px ${upcomingClass.color}33`
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Upcoming Class</p>
                    <CalendarDays className="h-4 w-4 text-slate-400" />
                  </div>
                  <p className="mt-3 line-clamp-1 text-base font-semibold tracking-[-0.01em]">
                    {upcomingClass ? upcomingClass.name : "No classes scheduled soon."}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{upcomingClass ? upcomingClass.code : ""}</p>
                  {upcomingClass ? (
                    <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-300">{upcomingClass.detail}</p>
                  ) : null}
                </Panel>
                <MetricCard
                  title="Top Priority"
                  value={topPriorityTask ? topPriorityTask.priority.toUpperCase() : "NONE"}
                  note={topPriorityTask ? topPriorityTask.title : "No pending tasks right now."}
                  icon={Star}
                />
              </section>
              <MemoDashboardView
                courses={activeCourses}
                tasks={filteredTasks.filter((task) => task.status !== "done")}
                workBlocks={state.workBlocks}
                onToggleDone={toggleTaskDoneWithUndo}
                onFocus={handleFocusTask}
                focusedTaskId={state.ui.focusedTaskId}
                analytics={analytics}
              />
            </>
          )}
          {state.ui.activeView === "kanban" && (
            <div className="flex min-h-0 flex-1 flex-col">
              <MemoKanbanView
                tasks={kanbanTab === "board" ? kanbanBoardTasks : kanbanCompletedTasks}
                tab={kanbanTab}
                onTabChange={setKanbanTab}
                boardCount={kanbanBoardTotal}
                completedCount={kanbanCompletedTotal}
                thisWeekCompletedCount={completedThisWeek}
                weeklyCompletedBuckets={kanbanWeeklyBuckets}
                courses={state.courses}
                workBlocks={state.workBlocks}
                quickSearchQuery={quickTaskSearch}
                onUpdate={updateTask}
                onDelete={handleDeleteTask}
                onFocus={handleFocusTask}
                onToggleDone={handleKanbanToggleDone}
                onOpenComposer={handleOpenComposer}
              />
            </div>
          )}
          {state.ui.activeView === "calendar" && (
            <MemoCalendarView
              tasks={state.tasks}
              workBlocks={state.workBlocks}
              courses={activeCourses}
              mode={calendarMode}
              onMode={setCalendarMode}
              selectedDate={selectedCalendarDate}
              onSelectDate={setSelectedCalendarDate}
              visibleCourseIds={visibleCourseIds}
              onSessionClick={handleCalendarSessionClick}
              onSessionDoubleClick={handleCalendarSessionDoubleClick}
              onClearSessionSelection={() => setSelectedCalendarSession(null)}
              selectedSession={
                selectedCalendarSession
                  ? {
                      courseId: selectedCalendarSession.courseId,
                      meetingId: selectedCalendarSession.meetingId,
                      anchorDate: selectedCalendarSession.anchorDate
                    }
                  : undefined
              }
              onUpdateCourse={updateCourseWithUndo}
              onAddWorkBlock={addWorkBlockWithUndo}
              onUpdateWorkBlock={updateWorkBlockWithUndo}
              onDeleteWorkBlock={deleteWorkBlockWithUndo}
              onOpenTask={handleFocusTask}
              tentativeOptions={tentativeCalendarOptions}
              tentativeChoiceTitle={activeChoiceSet?.label}
              onPickTentativeOption={selectTentativeCalendarOption}
              newlyAddedCourseId={onboardingCourseGlowId}
            />
          )}
          {state.ui.activeView === "courses" && (
            <Panel className="bg-white/90 dark:bg-[#101317]/90">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold tracking-tight">Courses</h3>
                <div className="relative flex items-center gap-2">
                  <Badge>{activeCourses.length} active</Badge>
                  <Button
                    variant="outline"
                    onClick={() => setIsCourseActionsOpen((v) => !v)}
                    className="h-8 px-3 text-xs"
                    data-onboarding="courses-add-button"
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Add
                  </Button>
                  {isCourseActionsOpen && (
                    <div className="absolute right-0 top-9 z-20 w-40 rounded-xl border border-slate-200/80 bg-white/95 p-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.14)] dark:border-white/10 dark:bg-[#0f1217]/95">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddCourseOpen(true);
                          setIsCourseActionsOpen(false);
                        }}
                        className="w-full rounded-lg px-2.5 py-2 text-left text-xs text-slate-600 transition hover:bg-slate-100/80 dark:text-slate-300 dark:hover:bg-white/[0.06]"
                      >
                        Add manually
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCatalogPickerOpen(true);
                          setIsCourseActionsOpen(false);
                        }}
                        className="w-full rounded-lg px-2.5 py-2 text-left text-xs text-slate-600 transition hover:bg-slate-100/80 dark:text-slate-300 dark:hover:bg-white/[0.06]"
                      >
                        Import from HUJI
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCourseListMode("all")}
                  className={`rounded-full border px-2.5 py-1 text-left transition ${courseListMode === "all" ? "border-slate-300 bg-slate-100 text-slate-900 dark:border-white/20 dark:bg-white/10 dark:text-white" : "border-slate-200/70 text-slate-500 hover:bg-slate-100/70 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/[0.04]"}`}
                >
                  <p className="text-[11px] font-medium">All <span className="opacity-80">{activeCourses.length}</span></p>
                </button>
                <button
                  type="button"
                  onClick={() => setCourseListMode("imported")}
                  className={`rounded-full border px-2.5 py-1 text-left transition ${courseListMode === "imported" ? "border-slate-300 bg-slate-100 text-slate-900 dark:border-white/20 dark:bg-white/10 dark:text-white" : "border-slate-200/70 text-slate-500 hover:bg-slate-100/70 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/[0.04]"}`}
                >
                  <p className="text-[11px] font-medium">Imported <span className="opacity-80">{importedCoursesCount}</span></p>
                </button>
                <button
                  type="button"
                  onClick={() => setCourseListMode("manual")}
                  className={`rounded-full border px-2.5 py-1 text-left transition ${courseListMode === "manual" ? "border-slate-300 bg-slate-100 text-slate-900 dark:border-white/20 dark:bg-white/10 dark:text-white" : "border-slate-200/70 text-slate-500 hover:bg-slate-100/70 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/[0.04]"}`}
                >
                  <p className="text-[11px] font-medium">Manual <span className="opacity-80">{manualCoursesCount}</span></p>
                </button>
                <button
                  type="button"
                  onClick={() => setCourseListMode("archived")}
                  className={`rounded-full border px-2.5 py-1 text-left transition ${courseListMode === "archived" ? "border-slate-300 bg-slate-100 text-slate-900 dark:border-white/20 dark:bg-white/10 dark:text-white" : "border-slate-200/70 text-slate-500 hover:bg-slate-100/70 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/[0.04]"}`}
                >
                  <p className="text-[11px] font-medium">Archived <span className="opacity-80">{archivedCourses.length}</span></p>
                </button>
              </div>
              <div className="max-h-[68vh] space-y-1.5 overflow-auto pr-1">
                {visibleCoursesInSidebar.map((course) => {
                  const isActive = state.ui.selectedCourseId === course.id;
                  return (
                    <div
                      key={course.id}
                      className={`group flex items-center gap-2 rounded-xl border px-2 py-1 transition ${
                        isActive
                          ? "border-slate-300/80 bg-transparent dark:border-white/20"
                          : "border-transparent hover:bg-slate-100/70 dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      <button
                        onClick={() => {
                          dispatch({ type: "set-course-filter", payload: course.id });
                          setIsCourseEditorOpen(true);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: course.color }} />
                        <div className="min-w-0">
                          <p dir="auto" className="truncate text-sm font-medium text-start">
                            {course.code ? `${course.code} · ` : ""}{course.name}
                          </p>
                          <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                            {course.source ? "Imported from HUJI" : "Manual course"} · {course.meetings.length} meetings
                          </p>
                        </div>
                      </button>
                      <div className={`flex items-center gap-1 transition ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                        <button
                          type="button"
                          aria-label="Archive course"
                          onClick={() => {
                            dispatch({ type: "archive-course", payload: course.id });
                            dispatch({ type: "set-course-filter", payload: "all" });
                          }}
                          className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-white/10"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete course"
                          onClick={() => {
                            const confirmed = window.confirm(
                              "Delete this course permanently? This will also delete related tasks, work blocks, and class notes."
                            );
                            if (!confirmed) return;
                            dispatch({ type: "delete-course", payload: course.id });
                            dispatch({ type: "set-course-filter", payload: "all" });
                          }}
                          className="rounded-md p-1.5 text-rose-500 transition hover:bg-rose-100/70 dark:text-rose-400 dark:hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
          {state.ui.activeView === "user-requests" && isAdmin && (
            <Panel className="bg-white/90 dark:bg-[#101317]/90">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold tracking-tight">User feature requests</h3>
                <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => void loadAdminFeatureRequests()} disabled={adminRequestsLoading}>
                  {adminRequestsLoading ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
              <div className="mb-3 rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
                {gitSyncStatus.available
                  ? (gitSyncStatus.clean && gitSyncStatus.ahead === 0
                      ? "Git sync status: committed and pushed. Done requests are auto-hidden."
                      : `Git sync status: waiting for commit/push (clean: ${gitSyncStatus.clean ? "yes" : "no"}, ahead: ${gitSyncStatus.ahead}).`)
                  : (gitSyncStatus.checking ? "Checking git sync status..." : "Git sync status unavailable in this environment.")}
              </div>
              {adminRequestsError && (
                <div className="mb-3 rounded-xl border border-rose-200/70 bg-rose-50/80 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  {adminRequestsError}
                </div>
              )}
              <div className="max-h-[74vh] space-y-3 overflow-auto pr-1">
                {(() => {
                  const gitSynced = gitSyncStatus.available && gitSyncStatus.clean && gitSyncStatus.ahead === 0;
                  const visibleRequests = adminFeatureRequests.filter((request) => !(doneFeatureRequestMap[String(request.id)] && gitSynced));
                  if (adminRequestsLoading && adminFeatureRequests.length === 0) {
                    return <p className="text-sm text-slate-500 dark:text-slate-400">Loading requests...</p>;
                  }
                  if (visibleRequests.length === 0) {
                    return <p className="text-sm text-slate-500 dark:text-slate-400">No user requests pending.</p>;
                  }
                  return visibleRequests.map((request) => {
                    const requestKey = String(request.id);
                    const isDone = Boolean(doneFeatureRequestMap[requestKey]);
                    return (
                    <article key={request.id} className="rounded-2xl border border-slate-200/80 p-3.5 dark:border-white/10">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {request.user_email} · {new Date(request.created_at).toLocaleString()}
                        </p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDoneFeatureRequestMap((prev) => {
                              const next = { ...prev };
                              if (next[requestKey]) {
                                delete next[requestKey];
                              } else {
                                next[requestKey] = new Date().toISOString();
                              }
                              return next;
                            })}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                              isDone
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
                            }`}
                          >
                            {isDone ? "Done" : "Mark done"}
                          </button>
                          <button
                            type="button"
                            aria-label="Delete request"
                            onClick={() => void deleteAdminFeatureRequest(request.id)}
                            disabled={deletingRequestId === request.id}
                            className="rounded-md p-1.5 text-rose-500 transition hover:bg-rose-100/70 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-400 dark:hover:bg-rose-500/10"
                          >
                            <Trash2 className={`h-3.5 w-3.5 ${deletingRequestId === request.id ? "animate-pulse" : ""}`} />
                          </button>
                        </div>
                      </div>
                      {isDone ? (
                        <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                          Waiting for git commit + push before auto-hiding.
                        </p>
                      ) : null}
                      <p dir="auto" className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-slate-800 dark:text-slate-100">
                        {request.message}
                      </p>
                      {request.screenshots?.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {request.screenshots.map((shot, idx) => (
                            <button
                              key={`${request.id}-${idx}`}
                              type="button"
                              onClick={() => setSelectedRequestScreenshot({ dataUrl: shot.dataUrl, alt: shot.name || `screenshot ${idx + 1}` })}
                              className="overflow-hidden rounded-xl border border-slate-200/80 text-left transition hover:ring-2 hover:ring-slate-300 dark:border-white/10 dark:hover:ring-white/30"
                            >
                              <img src={shot.dataUrl} alt={shot.name || "feature request screenshot"} className="h-28 w-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                    </article>
                    );
                  });
                })()}
              </div>
            </Panel>
          )}
          {state.ui.activeView === "by-course" && <MemoByCourseView tasks={filteredTasks} courses={activeCourses} onToggleDone={toggleTaskDoneWithUndo} onFocus={handleFocusTask} />}
          {state.ui.activeView === "by-priority" && <MemoByPriorityView tasks={filteredTasks} onToggleDone={toggleTaskDoneWithUndo} onFocus={handleFocusTask} />}
          {state.ui.activeView === "class-notes" && (
            <div className="min-h-0 flex-1 overflow-auto pr-1">
              <MemoClassNotesPanel
                courses={state.courses}
                classNotes={state.classNotes ?? []}
                openNoteId={classNoteEditorId}
                onOpenNote={setClassNoteEditorId}
                onCreateNote={(input) => dispatch({ type: "add-class-note", payload: input })}
                onUpdateNote={(payload) => dispatch({ type: "update-class-note", payload })}
                onDeleteNote={(id) => dispatch({ type: "delete-class-note", payload: id })}
                onPublishNote={(id) => dispatch({ type: "publish-class-note", payload: id })}
              />
            </div>
          )}
          {state.ui.activeView === "upcoming" && (
            <MemoTaskList
              tasks={filteredTasks}
              courses={state.courses}
              workBlocks={state.workBlocks}
              onToggleDone={toggleTaskDoneWithUndo}
              onFocus={handleFocusTask}
              focusedTaskId={state.ui.focusedTaskId}
              title={viewTitle(state.ui.activeView)}
            />
          )}
        </main>
      </div>

      {isUtilityOpen && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close utility drawer"
            className="absolute inset-0 bg-slate-950/18 backdrop-blur-[1px] dark:bg-black/35"
            onClick={() => setIsUtilityOpen(false)}
          />
          <aside className="absolute inset-y-4 right-4 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-4 overflow-y-auto rounded-[32px] border border-slate-200/80 bg-[#f7f8fa]/96 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.16)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#0f1115]/96 dark:shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
            <div className="flex items-center justify-between px-1">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">Guide</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Shortcuts and onboarding in one place.</p>
              </div>
              <Button variant="ghost" onClick={() => setIsUtilityOpen(false)} className="h-10 w-10 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <Panel className="bg-white/92 dark:bg-[#101317]/92">
              <h3 className="mb-2 font-semibold">Keyboard</h3>
              <ul className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                <li>`N` or Hebrew `מ` add task</li>
                <li>`Cmd/Ctrl + K` search</li>
                <li>`X` mark focused task done</li>
                <li>`1`-`7` switch views without ⌘/Ctrl — same order as the sidebar (⌘+digit is left to the browser for tabs)</li>
              </ul>
              <div className="mt-3 border-t border-slate-200/80 pt-3 dark:border-white/10">
                <Button
                  variant="outline"
                  className="w-full justify-center"
                  onClick={() => {
                    setIsUtilityOpen(false);
                    beginOnboarding();
                  }}
                  data-onboarding="replay-onboarding"
                >
                  Replay onboarding
                </Button>
              </div>
            </Panel>
          </aside>
        </div>
      )}

      {isSettingsOpen && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close settings drawer"
            className="absolute inset-0 bg-slate-950/18 backdrop-blur-[1px] dark:bg-black/35"
            onClick={() => setIsSettingsOpen(false)}
          />
          <aside className="absolute inset-y-4 right-4 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-4 overflow-y-auto rounded-[32px] border border-slate-200/80 bg-[#f7f8fa]/96 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.16)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#0f1115]/96 dark:shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
            <div className="flex items-center justify-between px-1">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">Settings</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Account and essential preferences.</p>
              </div>
              <Button variant="ghost" onClick={() => setIsSettingsOpen(false)} className="h-10 w-10 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <Panel className="bg-white/92 dark:bg-[#101317]/92" data-onboarding="account-panel">
              <h3 className="mb-2 font-semibold">Account</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">{user?.email ?? "Signed in"}</p>
              <Button variant="outline" className="mt-3 w-full justify-center" onClick={() => void handleSignOut()} disabled={isSigningOut}>
                {isSigningOut ? "Signing out..." : "Sign out"}
              </Button>
            </Panel>

            <Panel className="bg-white/92 dark:bg-[#101317]/92" data-onboarding="settings-degree-panel">
              <h3 className="mb-2 font-semibold">Degree</h3>
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Choose your degree, load roadmap courses, then quick-add only this semester.</p>
              <input
                value={catalogDegreeSearchQuery}
                onChange={(event) => {
                  setCatalogDegreeSearchQuery(event.target.value);
                  setIsCatalogDegreeOptionsOpen(true);
                }}
                onFocus={() => setIsCatalogDegreeOptionsOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setIsCatalogDegreeOptionsOpen(false);
                }}
                placeholder="Search degree (e.g. 181, biology, linguistics)..."
                data-onboarding="degree-select"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04]"
              />
              {isCatalogDegreeOptionsOpen && catalogDegreeSearchQuery.trim().length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white/90 p-1 dark:border-white/10 dark:bg-white/[0.03]">
                  {catalogDegreeOptions.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-slate-500 dark:text-slate-400">No matching degrees found.</p>
                  ) : (
                    catalogDegreeOptions.map((degree) => (
                      <button
                        key={degree.id}
                        type="button"
                        onClick={() => selectCatalogDegreeOption(degree)}
                        className={`w-full rounded-lg px-2 py-1.5 text-left text-xs transition ${
                          catalogDegree === degree.id
                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                            : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.08]"
                        }`}
                      >
                        {degree.label}
                      </button>
                    ))
                  )}
                </div>
              )}
              {catalogDegreeSearchLoading && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Searching degrees...</p>
              )}
              <Button className="mt-3 w-full justify-center" data-onboarding="load-roadmap-button" onClick={() => void importFullDegreePlan()} disabled={catalogDegreeImporting}>
                {catalogDegreeImporting
                  ? "Loading roadmap..."
                  : `Load roadmap${selectedCatalogDegreeOption ? ` (${selectedCatalogDegreeOption.roadmapCode})` : ""}`}
              </Button>
            </Panel>

            <Panel className="bg-white/92 dark:bg-[#101317]/92" data-onboarding="feature-request-panel">
              <h3 className="mb-2 font-semibold">Request a missing feature</h3>
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Tell us what is missing and attach screenshots.</p>
              <textarea
                value={featureRequestMessage}
                onChange={(event) => setFeatureRequestMessage(event.target.value)}
                onPaste={(event) => void onFeatureRequestPaste(event)}
                placeholder="What feature is missing for you? You can paste screenshots here."
                rows={4}
                dir="auto"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-start outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04]"
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Paste screenshots directly into the box (up to {MAX_FEATURE_REQUEST_SCREENSHOTS}).
              </p>
              {featureRequestShots.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {featureRequestShots.map((shot, idx) => (
                    <div key={`${shot.name}-${idx}`} className="overflow-hidden rounded-lg border border-slate-200/80 dark:border-white/10">
                      <img src={shot.dataUrl} alt={shot.name} className="h-16 w-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
              {featureRequestError && <p className="mt-2 text-xs text-rose-500">{featureRequestError}</p>}
              {featureRequestSuccess && <p className="mt-2 text-xs text-emerald-500">{featureRequestSuccess}</p>}
              <Button className="mt-3 w-full justify-center" onClick={() => void submitFeatureRequest()} disabled={featureRequestSending}>
                {featureRequestSending ? "Sending..." : "Send request"}
              </Button>
            </Panel>

            {isAdmin && (
              <Panel className="bg-white/92 dark:bg-[#101317]/92">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold">User feature requests</h3>
                  <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => void loadAdminFeatureRequests()} disabled={adminRequestsLoading}>
                    Refresh
                  </Button>
                </div>
                {adminRequestsError && <p className="mb-2 text-xs text-rose-500">{adminRequestsError}</p>}
                <div className="space-y-2">
                  {adminRequestsLoading ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Loading requests...</p>
                  ) : adminFeatureRequests.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">No requests yet.</p>
                  ) : (
                    adminFeatureRequests.map((request) => (
                      <div key={request.id} className="rounded-xl border border-slate-200/80 p-2.5 dark:border-white/10">
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {request.user_email} · {new Date(request.created_at).toLocaleString()}
                        </p>
                        <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{request.message}</p>
                        {request.screenshots?.length > 0 && (
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {request.screenshots.slice(0, 3).map((shot, idx) => (
                              <a key={`${request.id}-${idx}`} href={shot.dataUrl} target="_blank" rel="noreferrer" className="overflow-hidden rounded-md border border-slate-200/80 dark:border-white/10">
                                <img src={shot.dataUrl} alt={shot.name || "feature request screenshot"} className="h-14 w-full object-cover" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </Panel>
            )}
          </aside>
        </div>
      )}

      <OnboardingTour
        active={onboardingActive}
        step={onboardingStep}
        stepIndex={onboardingStepIndex}
        totalSteps={MINIMAL_CORE_ONBOARDING_STEPS.length}
        onPrevious={retreatOnboarding}
        onNext={advanceOnboarding}
        onSkip={skipOnboarding}
        targetElement={onboardingTargetElement}
      />

      {focusedTask && (
        <TaskDetailModal
          task={focusedTask}
          courses={activeCourses}
          workBlocks={state.workBlocks}
          onClose={() => dispatch({ type: "set-focus", payload: undefined })}
          onSave={updateTask}
        />
      )}

      {sessionDeletePrompt && (
        <div className="fixed inset-0 z-[49] flex items-center justify-center bg-black/45 px-4 backdrop-blur-[2px]">
          <Panel className="w-full max-w-md rounded-[26px] p-5">
            <div className="mb-2 text-center">
              <h3 className="text-2xl font-semibold tracking-tight">Delete event?</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Choose exactly how this recurring session should be removed.
              </p>
            </div>
            <div className="mt-4 space-y-2">
              <Button
                className="w-full justify-center bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-600"
                onClick={() => {
                  deleteSelectedSession("single");
                  setSessionDeletePrompt(null);
                }}
              >
                Delete Only This Event
              </Button>
              <Button
                variant="outline"
                className="w-full justify-center"
                onClick={() => {
                  deleteSelectedSessionFuture();
                  setSessionDeletePrompt(null);
                }}
              >
                Delete All Future Events
              </Button>
              <Button variant="ghost" className="w-full justify-center" onClick={() => setSessionDeletePrompt(null)}>
                Cancel
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {selectedRequestScreenshot && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-4">
          <button type="button" className="absolute inset-0" onClick={() => setSelectedRequestScreenshot(null)} aria-label="Close screenshot preview" />
          <div className="relative z-[81] max-h-[92vh] max-w-[92vw] overflow-hidden rounded-2xl border border-white/15 bg-black/40 p-2">
            <img src={selectedRequestScreenshot.dataUrl} alt={selectedRequestScreenshot.alt} className="max-h-[88vh] max-w-[88vw] rounded-xl object-contain" />
            <Button variant="outline" className="absolute right-3 top-3 h-8 px-2 text-xs" onClick={() => setSelectedRequestScreenshot(null)}>
              Close
            </Button>
          </div>
        </div>
      )}

      {postSessionPrompt && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[46] flex justify-center px-4">
          <div
            className="pointer-events-auto flex w-full max-w-lg flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.18)] backdrop-blur-md dark:border-white/10 dark:bg-[#12151c]/95 dark:shadow-[0_24px_60px_rgba(0,0,0,0.45)] sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1" dir="auto">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Class finished — capture notes?</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {postSessionPrompt.courseName} · {postSessionPrompt.sessionLabel} · {postSessionPrompt.occurredOn}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                onClick={() => {
                  const anchor = new Date(`${postSessionPrompt.occurredOn}T12:00:00`);
                  openClassNoteDraftForSession(postSessionPrompt.courseId, postSessionPrompt.meetingId, anchor);
                  setPostSessionPrompt(null);
                }}
                className="shadow-[0_0_22px_rgba(56,189,248,0.4)] dark:shadow-[0_0_26px_rgba(56,189,248,0.2)]"
              >
                Create class note
              </Button>
              <Button variant="ghost" onClick={dismissPostSessionPrompt}>
                Later
              </Button>
            </div>
          </div>
        </div>
      )}

      {endedWorkBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <Panel className="w-full max-w-md bg-white/95 p-5 dark:bg-[#101317]/95">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Work block ended</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {endedWorkBlock.titleSnapshot ?? endedWorkBlockTask?.title ?? "Task"}
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  closeEndedWorkBlockPrompt();
                }}
                className="h-10 w-10 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              {new Date(endedWorkBlock.startAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} –{" "}
              {new Date(endedWorkBlock.endAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="grid gap-2">
              <Button
                onClick={() => {
                  closeEndedWorkBlockPrompt();
                  updateWorkBlockWithUndo({ id: endedWorkBlock.id, status: "completed" });
                  if (endedWorkBlockTask && endedWorkBlockTask.status !== "done") {
                    dispatch({ type: "toggle-task-done", payload: endedWorkBlockTask.id });
                  }
                }}
              >
                Done (mark task done)
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  closeEndedWorkBlockPrompt();
                  updateWorkBlockWithUndo({ id: endedWorkBlock.id, status: "completed" });
                }}
              >
                Done (block only)
              </Button>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    closeEndedWorkBlockPrompt();
                    const start = new Date(endedWorkBlock.startAt);
                    const end = new Date(endedWorkBlock.endAt);
                    start.setMinutes(start.getMinutes() + 30);
                    end.setMinutes(end.getMinutes() + 30);
                    promptedWorkBlocksRef.current.delete(endedWorkBlock.id);
                    updateWorkBlockWithUndo({ id: endedWorkBlock.id, startAt: start.toISOString(), endAt: end.toISOString() });
                  }}
                >
                  +30m
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    closeEndedWorkBlockPrompt();
                    const start = new Date(endedWorkBlock.startAt);
                    const end = new Date(endedWorkBlock.endAt);
                    start.setMinutes(start.getMinutes() + 60);
                    end.setMinutes(end.getMinutes() + 60);
                    promptedWorkBlocksRef.current.delete(endedWorkBlock.id);
                    updateWorkBlockWithUndo({ id: endedWorkBlock.id, startAt: start.toISOString(), endAt: end.toISOString() });
                  }}
                >
                  +60m
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    closeEndedWorkBlockPrompt();
                    const start = new Date(endedWorkBlock.startAt);
                    const end = new Date(endedWorkBlock.endAt);
                    start.setDate(start.getDate() + 1);
                    end.setDate(end.getDate() + 1);
                    promptedWorkBlocksRef.current.delete(endedWorkBlock.id);
                    updateWorkBlockWithUndo({ id: endedWorkBlock.id, startAt: start.toISOString(), endAt: end.toISOString() });
                  }}
                >
                  Tomorrow
                </Button>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  closeEndedWorkBlockPrompt();
                  updateWorkBlockWithUndo({ id: endedWorkBlock.id, status: "skipped" });
                }}
              >
                Skip
              </Button>
            </div>
          </Panel>
        </div>
      )}

      {isCatalogPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <Panel data-onboarding="catalog-import-panel" className="w-full max-w-3xl bg-white/95 p-5 dark:bg-[#101317]/95">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">HUJI Catalog Import</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Search by course number or name, or load your degree roadmap and quick-add selected courses.
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  setIsCatalogPickerOpen(false);
                  setCatalogError(null);
                }}
                className="h-10 w-10 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[280px_minmax(0,1fr)_auto] md:items-end">
              <div className="min-w-0">
                <label className="mb-1 block px-1 text-xs font-medium text-slate-600 dark:text-slate-300">Degree</label>
                <input
                  value={catalogDegreeSearchQuery}
                  onChange={(event) => {
                    setCatalogDegreeSearchQuery(event.target.value);
                    setIsCatalogDegreeOptionsOpen(true);
                  }}
                  onFocus={() => setIsCatalogDegreeOptionsOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setIsCatalogDegreeOptionsOpen(false);
                  }}
                  placeholder="Search degree..."
                  data-onboarding="degree-select"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04]"
                />
                {isCatalogDegreeOptionsOpen && catalogDegreeSearchQuery.trim().length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white/90 p-1 dark:border-white/10 dark:bg-white/[0.03]">
                    {catalogDegreeOptions.length === 0 ? (
                      <p className="px-2 py-1 text-xs text-slate-500 dark:text-slate-400">No matching degrees found.</p>
                    ) : (
                      catalogDegreeOptions.map((degree) => (
                        <button
                          key={degree.id}
                          type="button"
                          onClick={() => selectCatalogDegreeOption(degree)}
                          className={`w-full rounded-lg px-2 py-1.5 text-left text-xs transition ${
                            catalogDegree === degree.id
                              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                              : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.08]"
                          }`}
                        >
                          {degree.label}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={catalogQuery}
                  onChange={(event) => setCatalogQuery(event.target.value)}
                  placeholder="Search HUJI course number or name..."
                  className="h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04]"
                />
              </div>
              <Button variant="outline" className="h-[42px] px-4 md:self-end" onClick={refreshCatalog} disabled={catalogRefreshing}>
                {catalogRefreshing ? "Refreshing..." : "Refresh catalog"}
              </Button>
            </div>

            <div className="mb-3 rounded-lg border border-slate-200/70 bg-slate-50/60 px-3 py-2 text-xs text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
              {`Degree catalog: ${selectedCatalogDegreeOption?.label ?? catalogDegree}.`
                + " "
                + (catalogFreshness?.lastCompletedAt
                ? `Catalog updated ${new Date(catalogFreshness.lastCompletedAt).toLocaleString()} (${catalogFreshness.fetchedCount} courses).`
                : "Catalog not synced yet. Use refresh catalog to ingest latest data.")}
            </div>

            {catalogError && (
              <div className="mb-3 rounded-xl border border-rose-200/70 bg-rose-50/80 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                {catalogError}
              </div>
            )}

            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {catalogLoading ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Searching catalog...</p>
              ) : catalogResults.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No courses found for your query.</p>
              ) : catalogViewMode === "roadmap" ? (
                groupedRoadmapCourses.map((group) => (
                  <details key={group.label} open className="rounded-2xl border border-slate-200/70 bg-white/40 p-2 dark:border-white/10 dark:bg-white/[0.02]">
                    <summary className="cursor-pointer list-none rounded-xl px-2 py-1.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-100/70 dark:text-slate-100 dark:hover:bg-white/[0.05]">
                      {group.label} ({group.courses.length})
                    </summary>
                    <div className="mt-2 space-y-2">
                      {group.courses.map((course) => (
                        <div key={`${course.source}:${course.externalId}`} className="rounded-2xl border border-slate-200/70 px-3 py-3 dark:border-white/10">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {course.courseNumber} · {course.nameHe || course.nameEn || course.title || "Unnamed course"}
                              </p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {course.faculty || "HUJI"} · {course.department || "Life Sciences"} · {course.meetings.length} meetings
                              </p>
                              {course.meetings.length > 0 && (
                                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                                  {course.meetings
                                    .slice(0, 3)
                                    .map((m) => `${m.weekday} ${m.start_time}-${m.end_time}`)
                                    .join(" | ")}
                                </p>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              className="shrink-0"
                              onClick={() => importCatalogCourse(course)}
                              disabled={catalogImportingId === course.externalId}
                            >
                              {catalogImportingId === course.externalId ? "Importing..." : "Add course"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                ))
              ) : (
                catalogResults.map((course) => (
                  <div key={`${course.source}:${course.externalId}`} className="rounded-2xl border border-slate-200/70 px-3 py-3 dark:border-white/10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {course.courseNumber} · {course.nameHe || course.nameEn || "Unnamed course"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {course.faculty || "HUJI"} · {course.department || "Life Sciences"} · {course.meetings.length} meetings
                        </p>
                        {course.meetings.length > 0 && (
                          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                            {course.meetings
                              .slice(0, 3)
                              .map((m) => `${m.weekday} ${m.start_time}-${m.end_time}`)
                              .join(" | ")}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        className="shrink-0"
                        onClick={() => importCatalogCourse(course)}
                        disabled={catalogImportingId === course.externalId}
                      >
                        {catalogImportingId === course.externalId ? "Importing..." : "Add course"}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
      )}

      {isAddCourseOpen && (
        <AddCourseModal
          newCourseName={newCourseName}
          setNewCourseName={setNewCourseName}
          newCourseCode={newCourseCode}
          setNewCourseCode={setNewCourseCode}
          newCourseColor={newCourseColor}
          setNewCourseColor={setNewCourseColor}
          onClose={() => setIsAddCourseOpen(false)}
          onCreate={onCreateCourse}
        />
      )}

      {selectedCourse && isCourseEditorOpen && (
        <CourseEditorModal
          editName={editName}
          setEditName={setEditName}
          editCode={editCode}
          setEditCode={setEditCode}
          editInstructor={editInstructor}
          setEditInstructor={setEditInstructor}
          editNotes={editNotes}
          setEditNotes={setEditNotes}
          editProgressMode={editProgressMode}
          setEditProgressMode={setEditProgressMode}
          editManualProgress={editManualProgress}
          setEditManualProgress={setEditManualProgress}
          editColor={editColor}
          setEditColor={setEditColor}
          onClose={() => setIsCourseEditorOpen(false)}
          onSave={() => {
            dispatch({
              type: "update-course",
              payload: {
                id: selectedCourse.id,
                name: editName.trim() || selectedCourse.name,
                code: editCode.trim() || editName.trim() || selectedCourse.code,
                instructor: editInstructor.trim(),
                notes: editNotes,
                progressMode: editProgressMode,
                manualProgress: Math.max(0, Math.min(100, editManualProgress)),
                color: editColor
              }
            });
            setIsCourseEditorOpen(false);
          }}
          onArchive={() => {
            dispatch({ type: "archive-course", payload: selectedCourse.id });
            dispatch({ type: "set-course-filter", payload: "all" });
            setIsCourseEditorOpen(false);
          }}
          onDelete={() => {
            const confirmed = window.confirm(
              "Delete this course permanently? This will also delete related tasks, work blocks, and class notes."
            );
            if (!confirmed) return;
            dispatch({ type: "delete-course", payload: selectedCourse.id });
            dispatch({ type: "set-course-filter", payload: "all" });
            setIsCourseEditorOpen(false);
          }}
        />
      )}

      {isSessionEditorOpen && (
        <SessionEditorModal
          courses={activeCourses}
          selectedCourseId={state.ui.selectedCourseId}
          selectedDate={selectedCalendarDate}
          sessionDraft={sessionDraft}
          onClose={() => {
            setIsSessionEditorOpen(false);
            setSessionDraft(undefined);
          }}
          onSave={(courseId, meetings, replaceMode) => {
            const targetCourse = activeCourses.find((item) => item.id === courseId);
            if (!targetCourse) return;

            const editingCourseId = sessionDraft?.courseId;
            const editingMeetingId = sessionDraft?.meetingId;
            if (editingCourseId && editingCourseId !== targetCourse.id) {
              const sourceCourse = activeCourses.find((item) => item.id === editingCourseId);
              if (sourceCourse) {
                pushCalendarUndoEntry({ type: "replace-course", course: sourceCourse });
              }
            }
            pushCalendarUndoEntry({ type: "replace-course", course: targetCourse });

            if (editingCourseId && editingMeetingId && editingCourseId !== courseId) {
              const sourceCourse = activeCourses.find((item) => item.id === editingCourseId);
              if (sourceCourse) {
                dispatch({
                  type: "update-course",
                  payload: {
                    id: sourceCourse.id,
                    meetings: sourceCourse.meetings.filter((meeting) => meeting.id !== editingMeetingId)
                  }
                });
              }
            }

            const nextMeetings =
              replaceMode === "replace"
                ? meetings
                : [
                    ...targetCourse.meetings.filter((meeting) =>
                      sessionDraft?.meetingId && meetings.some((item) => item.id === sessionDraft.meetingId)
                        ? meeting.id !== editingMeetingId
                        : true
                    ),
                    ...meetings
                  ];

            dispatch({
              type: "update-course",
              payload: {
                id: targetCourse.id,
                meetings: nextMeetings
              }
            });
            setIsSessionEditorOpen(false);
            setSessionDraft(undefined);
          }}
        />
      )}

      {state.ui.showTaskComposer && (
        <TaskComposer
          courses={activeCourses}
          initialCourseId={composerInitialCourseId}
          onClose={() => {
            setComposerInitialCourseId(undefined);
            dispatch({ type: "set-composer", payload: false });
          }}
          onSave={handleCreateTask}
        />
      )}
      {state.ui.showSearch && (
        <SearchModal
          query={searchQuery}
          setQuery={setSearchQuery}
          results={searchResults}
          onClose={() => dispatch({ type: "set-search", payload: false })}
          onJump={(result) => {
            if (result.kind === "task") {
              dispatch({ type: "set-focus", payload: result.id });
              dispatch({ type: "set-view", payload: "upcoming" });
            } else if (result.kind === "course") {
              dispatch({ type: "set-course-filter", payload: result.id });
              dispatch({ type: "set-view", payload: "by-course" });
            } else if (result.kind === "note") {
              dispatch({ type: "set-view", payload: "class-notes" });
              setClassNoteEditorId(result.id);
            } else if (result.kind === "feature") {
              if (result.id === "user-requests-tab" && isAdmin) {
                dispatch({ type: "set-view", payload: "user-requests" });
              } else {
                setIsSettingsOpen(true);
                const selector = result.id === "feature-request-panel"
                  ? "[data-onboarding='feature-request-panel']"
                  : result.id === "settings-degree-panel"
                    ? "[data-onboarding='settings-degree-panel']"
                    : null;
                if (selector) {
                  window.setTimeout(() => {
                    const el = document.querySelector(selector);
                    if (el instanceof HTMLElement) {
                      el.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                  }, 120);
                }
              }
            }
            dispatch({ type: "set-search", payload: false });
          }}
        />
      )}
    </div>
  );
}

function DashboardView({
  courses,
  tasks,
  workBlocks,
  onToggleDone,
  onFocus,
  focusedTaskId,
  analytics
}: {
  courses: Course[];
  tasks: Task[];
  workBlocks: WorkBlock[];
  onToggleDone: (id: string) => void;
  onFocus: (id: string) => void;
  focusedTaskId?: string;
  analytics: { completed: Record<string, number>; workload: Array<{ name: string; total: number; color: string }> };
}) {
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
              <div key={item.name} className="flex items-center justify-between rounded-2xl px-2 py-1.5 text-sm">
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

function TaskList({
  tasks,
  courses,
  workBlocks,
  onToggleDone,
  onFocus,
  focusedTaskId,
  title
}: {
  tasks: Task[];
  courses: Course[];
  workBlocks: WorkBlock[];
  onToggleDone: (id: string) => void;
  onFocus: (id: string) => void;
  focusedTaskId?: string;
  title: string;
}) {
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

function KanbanView({
  tasks,
  tab,
  onTabChange,
  boardCount,
  completedCount,
  thisWeekCompletedCount,
  weeklyCompletedBuckets,
  courses,
  workBlocks,
  quickSearchQuery,
  onUpdate,
  onDelete,
  onFocus,
  onToggleDone,
  onOpenComposer
}: {
  tasks: Task[];
  tab: "board" | "completed";
  onTabChange: (next: "board" | "completed") => void;
  boardCount: number;
  completedCount: number;
  thisWeekCompletedCount: number;
  weeklyCompletedBuckets: Array<{ weekKey: string; count: number }>;
  courses: Course[];
  workBlocks: WorkBlock[];
  quickSearchQuery: string;
  onUpdate: (task: Partial<Task> & { id: string }) => void;
  onDelete: (id: string) => void;
  onFocus: (id: string) => void;
  onToggleDone: (id: string) => void;
  onOpenComposer: (courseId?: string | "general") => void;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [sortModeByGroup, setSortModeByGroup] = useState<Record<string, "date" | "priority">>({});
  const quickSearchToken = quickSearchQuery.trim().toLowerCase();
  const searchActive = quickSearchToken.length > 0;
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

  function toggleGroup(groupId: string) {
    setCollapsedGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  }

  useEffect(() => {
    if (!searchActive) {
      return;
    }
    setCollapsedGroups((current) => {
      const next = { ...current };
      for (const group of courseGroups) {
        next[group.id] = group.tasks.length === 0;
      }
      return next;
    });
  }, [courseGroups, searchActive]);

  function sortTasksForGroup(groupId: string, sourceTasks: Task[]) {
    if (tab === "completed") {
      return [...sourceTasks].sort((a, b) => {
        const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return tb - ta;
      });
    }
    const mode = sortModeByGroup[groupId] ?? "date";
    const tasks = [...sourceTasks];
    if (mode === "priority") {
      const priorityRank: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      return tasks.sort((a, b) => {
        const rankDiff = priorityRank[a.priority] - priorityRank[b.priority];
        if (rankDiff !== 0) return rankDiff;
        const dueA = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        const dueB = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        return dueA - dueB;
      });
    }
    return tasks.sort((a, b) => {
      const dueA = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const dueB = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (dueA !== dueB) return dueA - dueB;
      const priorityRank: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
      return priorityRank[a.priority] - priorityRank[b.priority];
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
          {tab === "completed" && (
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-200/60 bg-emerald-500/10 px-3 py-2 dark:border-emerald-500/25 dark:bg-emerald-500/10">
                <span className="text-xs font-medium uppercase tracking-wide text-emerald-800/90 dark:text-emerald-200/90">This week</span>
                <span className="text-sm font-semibold tabular-nums text-emerald-800 dark:text-emerald-200">{thisWeekCompletedCount}</span>
              </div>
            </div>
          )}
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
      {courseGroups.map((group) => {
        const isCollapsed = searchActive ? group.tasks.length === 0 : (collapsedGroups[group.id] ?? false);
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

                  {sortedTasks.map((task) => (
                    (() => {
                      const nowTs = Date.now();
                      const bookedBlock = bookedBlockByTaskId.get(task.id);
                      const isNearDeadlineUnbooked = !bookedBlock && !!task.dueAt && (() => {
                        const dueTs = new Date(task.dueAt as string).getTime();
                        if (Number.isNaN(dueTs)) return false;
                        const msUntilDeadline = dueTs - nowTs;
                        return msUntilDeadline > 0 && msUntilDeadline <= 2 * 24 * 60 * 60 * 1000;
                      })();
                      const isQuickMatch = searchActive && [
                        task.title,
                        task.description,
                        task.status,
                        task.priority,
                        ...(task.tags ?? [])
                      ].join(" ").toLowerCase().includes(quickSearchToken);
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
                      className={`group grid cursor-pointer grid-cols-[40px_1.35fr_1.6fr_1fr_0.9fr_0.85fr_0.8fr_52px] items-center px-4 py-3 text-sm transition ${
                        isQuickMatch
                          ? "mx-1.5 my-1 rounded-xl border border-amber-200/70 bg-amber-100/25 shadow-[0_0_0_1px_rgba(251,191,36,0.28),0_0_18px_rgba(251,191,36,0.26)] dark:border-amber-300/45 dark:bg-amber-300/10 dark:shadow-[0_0_0_1px_rgba(252,211,77,0.35),0_0_22px_rgba(252,211,77,0.28)]"
                          : "border-b border-slate-200/70 hover:bg-slate-50/60 dark:border-white/10 dark:hover:bg-white/[0.04]"
                      }`}
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
                            <span className={`text-[11px] ${isNearDeadlineUnbooked ? "text-amber-500 dark:text-amber-300" : "text-slate-500 dark:text-slate-400"}`}>
                              Not booked yet
                            </span>
                          )
                        ) : <span className="text-xs text-emerald-600 dark:text-emerald-400">Completed</span>}
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
                    })()
                  ))}
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

      {courseGroups.length === 0 && (
        <Panel className="bg-white/90 p-8 text-center text-sm text-slate-500 dark:bg-[#101317]/90 dark:text-slate-400">
          {tab === "completed" ? (
            <p>No completed tasks yet. Complete tasks from the Board tab to see them here.</p>
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

function CalendarView({
  tasks,
  workBlocks,
  courses,
  mode,
  onMode,
  selectedDate,
  onSelectDate,
  visibleCourseIds,
  onSessionClick,
  onSessionDoubleClick,
  onClearSessionSelection,
  selectedSession,
  onUpdateCourse,
  onAddWorkBlock,
  onUpdateWorkBlock,
  onDeleteWorkBlock,
  onOpenTask,
  tentativeOptions,
  tentativeChoiceTitle,
  onPickTentativeOption,
  newlyAddedCourseId
}: {
  tasks: Task[];
  workBlocks: WorkBlock[];
  courses: Course[];
  mode: "month" | "week" | "day";
  onMode: (mode: "month" | "week" | "day") => void;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  visibleCourseIds: string[];
  onSessionClick: (courseId: string, meetingId: string, anchorDate?: Date) => void;
  onSessionDoubleClick?: (courseId: string, meetingId: string, anchorDate?: Date) => void;
  onClearSessionSelection?: () => void;
  selectedSession?: { courseId: string; meetingId: string; anchorDate: Date };
  onUpdateCourse: (course: Partial<Course> & { id: string }) => void;
  onAddWorkBlock: (block: Omit<WorkBlock, "id" | "createdAt">) => void;
  onUpdateWorkBlock: (block: Partial<WorkBlock> & { id: string }) => void;
  onDeleteWorkBlock: (id: string) => void;
  onOpenTask: (taskId: string) => void;
  tentativeOptions?: Array<{
    optionId: string;
    optionIndex: number;
    displayLabel: string;
    label: string;
    courseId: string;
    courseName: string;
    courseColor: string;
    meetings: CourseMeeting[];
  }>;
  tentativeChoiceTitle?: string;
  onPickTentativeOption?: (optionId: string) => void;
  newlyAddedCourseId?: string | null;
}) {
  const visibleCourses = useMemo(() => courses.filter((course) => visibleCourseIds.includes(course.id)), [courses, visibleCourseIds]);
  const courseMap = useMemo(() => Object.fromEntries(courses.map((course) => [course.id, course])), [courses]);
  const bookedBlockByTaskId = useMemo(() => buildBookedBlockByTaskId(workBlocks), [workBlocks]);
  const tasksByCourseId = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    for (const task of tasks) {
      if (task.status === "done") continue;
      if (task.courseId === "general") continue;
      const arr = grouped.get(task.courseId) ?? [];
      arr.push(task);
      grouped.set(task.courseId, arr);
    }
    for (const [courseId, courseTasks] of grouped) {
      grouped.set(courseId, [...courseTasks].sort(taskComparator));
    }
    return grouped;
  }, [tasks]);
  const timelineHours = Array.from({ length: 24 }, (_, index) => index);
  const dayHourHeight = 64;
  const today = new Date();
  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const monthGridStart = startOfWeekGrid(monthStart, "sunday");
  const monthDays = Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index));
  const weekStart = startOfWeekGrid(selectedDate, "sunday");
  const weekDates = weekDays.map((_, index) => addDays(weekStart, index));
  const rangeStart = mode === "month" ? monthDays[0] : mode === "week" ? weekDates[0] : selectedDate;
  const rangeEnd = mode === "month" ? monthDays[41] : mode === "week" ? weekDates[6] : selectedDate;
  const sessionOccurrences = useMemo(
    () => expandMeetingOccurrences(visibleCourses, rangeStart, rangeEnd),
    [visibleCourses, rangeStart, rangeEnd]
  );
  const tentativeOccurrences = useMemo(() => {
    if (!tentativeOptions?.length) return [];
    const pseudoCourses: Course[] = tentativeOptions.map((option) => ({
      id: option.optionId,
      name: `${option.displayLabel} (${option.label})`,
      code: option.optionId,
      color: option.courseColor,
      archived: false,
      notes: "",
      meetings: option.meetings,
      grading: [],
      progressMode: "manual",
      manualProgress: 0,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }));
    return expandMeetingOccurrences(pseudoCourses, rangeStart, rangeEnd);
  }, [rangeEnd, rangeStart, tentativeOptions]);
  const tentativeByDate = useMemo(() => groupOccurrencesByDate(tentativeOccurrences), [tentativeOccurrences]);
  const tentativeOptionSummary = useMemo(() => {
    if (!tentativeOptions?.length) return null;
    const counts = tentativeOptions.map((opt) => opt.meetings.length).filter((count) => Number.isFinite(count));
    const minBlocks = counts.length > 0 ? Math.min(...counts) : 0;
    const maxBlocks = counts.length > 0 ? Math.max(...counts) : 0;
    return {
      optionCount: tentativeOptions.length,
      minBlocks,
      maxBlocks
    };
  }, [tentativeOptions]);
  const sessionByDate = groupOccurrencesByDate(sessionOccurrences);
  const taskByDay = useMemo(() => {
    return tasks.reduce<Record<string, Task[]>>((acc, task) => {
      if (!task.dueAt) return acc;
      const key = task.dueAt.slice(0, 10);
      acc[key] = [...(acc[key] ?? []), task];
      return acc;
    }, {});
  }, [tasks]);
  const selectedKey = formatDateKey(selectedDate);
  const scheduledWorkBlocks = useMemo(
    () => workBlocks.filter((block) => block.status === "scheduled"),
    [workBlocks]
  );
  const workBlocksByDate = useMemo(() => {
    return scheduledWorkBlocks.reduce<Record<string, WorkBlock[]>>((acc, block) => {
      const key = formatDateKey(new Date(block.startAt));
      acc[key] = [...(acc[key] ?? []), block];
      return acc;
    }, {});
  }, [scheduledWorkBlocks]);
  const selectedDaySessions = (sessionByDate[selectedKey] ?? []).sort((a, b) => {
    if (a.meeting.isAllDay && !b.meeting.isAllDay) return -1;
    if (!a.meeting.isAllDay && b.meeting.isAllDay) return 1;
    return a.meeting.start.localeCompare(b.meeting.start);
  });
  const selectedDayWorkBlocks = useMemo(() => {
    return (workBlocksByDate[selectedKey] ?? [])
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [workBlocksByDate, selectedKey]);
  const futureScheduledTaskIds = useMemo(() => {
    const nowTs = Date.now();
    return new Set(
      workBlocks
        .filter((block) => block.status === "scheduled" && new Date(block.startAt).getTime() > nowTs)
        .map((block) => block.taskId)
    );
  }, [workBlocks]);
  const weekOccurrencesByDay = weekDates.map((date) => {
    const key = formatDateKey(date);
    return {
      date,
      key,
      sessions: sessionByDate[key] ?? [],
      tasks: taskByDay[key] ?? []
    };
  });
  const WEEK_TIMELINE_ROW_PX = 64;
  const currentTimeTopWeek = getCurrentTimePosition(
    today,
    timelineHours[0],
    timelineHours[timelineHours.length - 1] + 1,
    WEEK_TIMELINE_ROW_PX
  );
  const currentTimeTopDay = getCurrentTimePosition(today, timelineHours[0], timelineHours[timelineHours.length - 1] + 1, dayHourHeight);
  const [draggingSession, setDraggingSession] = useState<{
    courseId: string;
    meetingId: string;
    durationMinutes: number;
    grabOffsetRatio: number;
    sourceDate: Date;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ date: Date; startMinutes: number; endMinutes: number } | null>(null);
  const [creatingSession, setCreatingSession] = useState<{
    date: Date;
    startMinutes: number;
    endMinutes: number;
    hasDragged: boolean;
    pointerX: number;
    columnLeft: number;
    columnRight: number;
    columnTop: number;
  } | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [taskDropPreview, setTaskDropPreview] = useState<{ startMinutes: number; endMinutes: number } | null>(null);
  const [draggingWorkBlock, setDraggingWorkBlock] = useState<{ id: string; durationMinutes: number } | null>(null);
  const [workBlockDragPreview, setWorkBlockDragPreview] = useState<{
    id: string;
    startMinutes: number;
    endMinutes: number;
    dateKey?: string;
  } | null>(null);
  const [resizingWorkBlock, setResizingWorkBlock] = useState<{
    id: string;
    edge: "start" | "end";
    startMinutes: number;
    endMinutes: number;
    dateKey?: string;
  } | null>(null);
  const [workBlockResizePreview, setWorkBlockResizePreview] = useState<{
    id: string;
    startMinutes: number;
    endMinutes: number;
    dateKey?: string;
  } | null>(null);
  const [activeWorkBlockId, setActiveWorkBlockId] = useState<string | null>(null);
  const [recurrenceMovePrompt, setRecurrenceMovePrompt] = useState<{
    courseId: string;
    meetingId: string;
    sourceDate: Date;
    targetDate: Date;
    startMinutes: number;
  } | null>(null);
  const [hebcalByYear, setHebcalByYear] = useState<Record<number, CalendarHolidayChip[]>>({});
  const [hebcalHolidayFetchBusy, setHebcalHolidayFetchBusy] = useState(false);
  const hebcalItemsByDate = useMemo(
    () => indexHolidayChipsByDate(Object.values(hebcalByYear).flat()),
    [hebcalByYear]
  );
  const [weekTransition, setWeekTransition] = useState<{ direction: "prev" | "next"; fromDate: Date; toDate: Date } | null>(null);
  const [weekTransitionActive, setWeekTransitionActive] = useState(false);
  const weekTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dayTransition, setDayTransition] = useState<{ direction: "prev" | "next"; fromDate: Date; toDate: Date } | null>(null);
  const [dayTransitionActive, setDayTransitionActive] = useState(false);
  const [hoveredTentativeOptionId, setHoveredTentativeOptionId] = useState<string | null>(null);
  const [quickCreateDraft, setQuickCreateDraft] = useState<{
    mode: "create" | "edit";
    date: Date;
    start: string;
    end: string;
    courseId: string;
    meetingId?: string;
    isAllDay: boolean;
    title: string;
    location: string;
    sessionType: QuickSessionType;
    cadence: SessionCadence;
    repeatDays: WeekDay[];
    detailsOpen: boolean;
  } | null>(null);
  const [quickCreateAnchor, setQuickCreateAnchor] = useState<{ left: number; top: number } | null>(null);
  const QUICK_CREATE_POPOVER_WIDTH = 300;
  const QUICK_CREATE_POPOVER_ESTIMATED_HEIGHT = 320;
  const tentativeBlockRef = useRef<HTMLDivElement | null>(null);
  const quickDraftBlockRef = useRef<HTMLDivElement | null>(null);
  const weekGridBodyRef = useRef<HTMLDivElement | null>(null);
  const dayGridBodyRef = useRef<HTMLDivElement | null>(null);
  const dayTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const calendarScrollTopRef = useRef<number | null>(null);
  const syncedCalendarScrollElsRef = useRef<WeakSet<Element>>(new WeakSet());
  /** Week grid hour row height, tuned to show more daytime hours at once. */
  const weekWbInteractionRef = useRef<{
    dragPreview: { id: string; startMinutes: number; endMinutes: number; dateKey?: string } | null;
    resizePreview: { id: string; startMinutes: number; endMinutes: number; dateKey?: string } | null;
  }>({ dragPreview: null, resizePreview: null });

  useEffect(() => {
    if ((tentativeOptions?.length ?? 0) > 0) return;
    setHoveredTentativeOptionId(null);
  }, [tentativeOptions]);

  const syncCalendarScrollEl = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    if (syncedCalendarScrollElsRef.current.has(el)) return;
    let top: number;
    if (mode === "week") {
      top = 8 * WEEK_TIMELINE_ROW_PX;
    } else if (mode === "day") {
      const pos = getCurrentTimePosition(new Date(), 0, 24, dayHourHeight);
      top = pos != null ? Math.max(0, pos - dayHourHeight) : 8 * dayHourHeight;
    } else {
      top = calendarScrollTopRef.current ?? 0;
    }
    el.scrollTop = top;
    calendarScrollTopRef.current = el.scrollTop;
    syncedCalendarScrollElsRef.current.add(el);
  }, [dayHourHeight, mode]);

  useLayoutEffect(() => {
    syncedCalendarScrollElsRef.current = new WeakSet();
  }, [mode]);

  function navigate(direction: "prev" | "next") {
    if (mode === "week" && weekTransition) return;
    const next = new Date(selectedDate);
    if (mode === "month") {
      next.setMonth(selectedDate.getMonth() + (direction === "next" ? 1 : -1));
    } else if (mode === "week") {
      const fromDate = new Date(selectedDate);
      next.setDate(selectedDate.getDate() + (direction === "next" ? 7 : -7));
      setWeekTransition({ direction, fromDate, toDate: new Date(next) });
      setWeekTransitionActive(false);
      requestAnimationFrame(() => setWeekTransitionActive(true));
      if (weekTransitionTimeoutRef.current) clearTimeout(weekTransitionTimeoutRef.current);
      weekTransitionTimeoutRef.current = setTimeout(() => {
        setWeekTransition(null);
        setWeekTransitionActive(false);
        weekTransitionTimeoutRef.current = null;
      }, 430);
    } else if (mode === "day") {
      const fromDate = new Date(selectedDate);
      next.setDate(selectedDate.getDate() + (direction === "next" ? 1 : -1));
      setDayTransition({ direction, fromDate, toDate: new Date(next) });
      setDayTransitionActive(false);
      requestAnimationFrame(() => setDayTransitionActive(true));
      if (dayTransitionTimeoutRef.current) clearTimeout(dayTransitionTimeoutRef.current);
      dayTransitionTimeoutRef.current = setTimeout(() => {
        setDayTransition(null);
        setDayTransitionActive(false);
        dayTransitionTimeoutRef.current = null;
      }, 430);
    } else {
      next.setDate(selectedDate.getDate() + (direction === "next" ? 1 : -1));
    }
    onSelectDate(next);
  }

  function minutesFromPointer(clientY: number, bounds: DOMRect, hourHeight = 80): number {
    const relativeY = Math.max(0, Math.min(bounds.height, clientY - bounds.top));
    const hourStart = timelineHours[0];
    const rawMinutes = hourStart * 60 + (relativeY / hourHeight) * 60;
    return Math.round(rawMinutes / 15) * 15;
  }

  function moveMeetingAtMinutes(courseId: string, meetingId: string, targetDate: Date, startMinutes: number) {
    const course = courses.find((item) => item.id === courseId);
    const meeting = course?.meetings.find((item) => item.id === meetingId);
    if (!course || !meeting || meeting.isAllDay) return;
    const duration = Math.max(0.5, parseTimeValue(meeting.end) - parseTimeValue(meeting.start));
    const nextStart = formatHourMinutes(startMinutes);
    const nextEnd = formatHourMinutes(startMinutes + duration * 60);
    const nextDay = getWeekDayFromDate(targetDate);

    onUpdateCourse({
      id: course.id,
      meetings: course.meetings.map((item) =>
        item.id === meetingId
          ? {
              ...item,
              day: nextDay,
              start: nextStart,
              end: nextEnd,
              anchorDate: new Date(`${formatDateKey(targetDate)}T12:00:00`).toISOString(),
              recurrence:
                item.recurrence?.cadence === "weekly"
                  ? {
                      ...item.recurrence,
                      daysOfWeek: [nextDay]
                    }
                  : item.recurrence
            }
          : item
      )
    });
  }

  function moveMeetingSingleOccurrenceAtMinutes(
    courseId: string,
    meetingId: string,
    sourceDate: Date,
    targetDate: Date,
    startMinutes: number
  ) {
    const course = courses.find((item) => item.id === courseId);
    const meeting = course?.meetings.find((item) => item.id === meetingId);
    if (!course || !meeting || meeting.isAllDay) return;
    const duration = Math.max(0.5, parseTimeValue(meeting.end) - parseTimeValue(meeting.start));
    const nextStart = formatHourMinutes(startMinutes);
    const nextEnd = formatHourMinutes(startMinutes + duration * 60);
    const nextDay = getWeekDayFromDate(targetDate);
    const sourceKey = formatDateKey(sourceDate);
    const baseRecurrence = meeting.recurrence ?? { cadence: "weekly", interval: 1, daysOfWeek: [meeting.day] };
    const nextExceptions = Array.from(new Set([...(baseRecurrence.exceptions ?? []), sourceKey]));
    const detachedId = createId("meeting");

    onUpdateCourse({
      id: course.id,
      meetings: [
        ...course.meetings.map((item) =>
          item.id === meetingId
            ? {
                ...item,
                recurrence: {
                  ...baseRecurrence,
                  exceptions: nextExceptions
                }
              }
            : item
        ),
        {
          ...meeting,
          id: detachedId,
          seriesId: meeting.seriesId ?? createId("series"),
          day: nextDay,
          start: nextStart,
          end: nextEnd,
          anchorDate: new Date(`${formatDateKey(targetDate)}T12:00:00`).toISOString(),
          recurrence: { cadence: "none", interval: 1 }
        }
      ]
    });
  }

  function calculateDraggedSlot(
    clientY: number,
    bounds: DOMRect,
    durationMinutes: number,
    minMinutesOverride?: number,
    hourHeight = 80,
    pointerOffsetMinutes = 0
  ) {
    const relativeY = Math.max(0, Math.min(bounds.height, clientY - bounds.top));
    const hourStart = timelineHours[0];
    const rawMinutes = hourStart * 60 + (relativeY / hourHeight) * 60;
    const snappedMinutes = Math.round((rawMinutes - pointerOffsetMinutes) / 15) * 15;
    const minMinutes = minMinutesOverride ?? hourStart * 60;
    const maxMinutes = (timelineHours[timelineHours.length - 1] + 1) * 60 - durationMinutes;
    const startMinutes = Math.max(minMinutes, Math.min(maxMinutes, snappedMinutes));
    return {
      startMinutes,
      endMinutes: startMinutes + durationMinutes
    };
  }

  function startCreateSession(date: Date, clientY: number, clientX: number, bounds: DOMRect, hourHeight = 80) {
    const startMinutes = minutesFromPointer(clientY, bounds, hourHeight);
    setCreatingSession({
      date,
      startMinutes,
      endMinutes: startMinutes + 60,
      hasDragged: false,
      pointerX: clientX,
      columnLeft: bounds.left,
      columnRight: bounds.right,
      columnTop: bounds.top
    });
  }

  function updateCreateSession(clientY: number, clientX: number, bounds: DOMRect, hourHeight = 80) {
    setCreatingSession((current) => {
      if (!current) return current;
      const nextMinutes = minutesFromPointer(clientY, bounds, hourHeight);
      // Strict drag-only creation: ignore zero-distance updates from simple clicks.
      if (nextMinutes === current.startMinutes) {
        return current;
      }
      const lower = Math.min(current.startMinutes, nextMinutes);
      const upper = Math.max(current.startMinutes, nextMinutes + 15);
      return {
        ...current,
        startMinutes: lower,
        endMinutes: upper,
        hasDragged: true,
        pointerX: clientX,
        columnLeft: bounds.left,
        columnRight: bounds.right,
        columnTop: bounds.top
      };
    });
  }

  function finishCreateSession() {
    if (!creatingSession) return;
    if (!creatingSession.hasDragged) {
      setCreatingSession(null);
      return;
    }
    const start = formatHourMinutes(creatingSession.startMinutes);
    const end = formatHourMinutes(creatingSession.endMinutes);
    const defaultCourseId = visibleCourses[0]?.id ?? courses[0]?.id ?? "";
    setQuickCreateDraft({
      mode: "create",
      date: creatingSession.date,
      start,
      end,
      courseId: defaultCourseId,
      title: "",
      location: "",
      sessionType: "lecture",
      isAllDay: false,
      cadence: "none",
      repeatDays: [getWeekDayFromDate(creatingSession.date)],
      detailsOpen: false
    });
    const topPx = ((creatingSession.startMinutes - timelineHours[0] * 60) / 60) * (mode === "week" ? WEEK_TIMELINE_ROW_PX : dayHourHeight);
    const popoverWidth = QUICK_CREATE_POPOVER_WIDTH;
    const popoverHeight = QUICK_CREATE_POPOVER_ESTIMATED_HEIGHT;
    const blockRect = tentativeBlockRef.current?.getBoundingClientRect() ?? null;
    const clampLeft = (value: number) => Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, value));
    const clampTop = (value: number) => Math.max(12, Math.min(window.innerHeight - popoverHeight - 12, value));
    if (blockRect) {
      const preferredLeft = blockRect.right + 2;
      const fallbackLeft = blockRect.left - popoverWidth - 2;
      const left = preferredLeft + popoverWidth <= window.innerWidth - 12 ? preferredLeft : fallbackLeft;
      setQuickCreateAnchor({
        left: clampLeft(left),
        top: clampTop(blockRect.top)
      });
      setCreatingSession(null);
      return;
    }
    if (mode === "week" && weekGridBodyRef.current) {
      const scrollEl = weekGridBodyRef.current.closest(".calendar-scroll-area") as HTMLElement | null;
      const scrollTop = scrollEl?.scrollTop ?? 0;
      const blockViewportTop = creatingSession.columnTop + topPx - scrollTop;
      const blockLeft = creatingSession.columnLeft + 6;
      const blockRight = creatingSession.columnRight - 6;
      const preferredLeft = blockRight + 2;
      const fallbackLeft = blockLeft - popoverWidth - 2;
      const left = preferredLeft + popoverWidth <= window.innerWidth - 12 ? preferredLeft : fallbackLeft;
      setQuickCreateAnchor({
        left: clampLeft(left),
        top: clampTop(blockViewportTop)
      });
    } else if (mode === "day" && dayGridBodyRef.current) {
      const scrollEl = dayGridBodyRef.current.closest(".calendar-scroll-area") as HTMLElement | null;
      const scrollTop = scrollEl?.scrollTop ?? 0;
      const blockViewportTop = creatingSession.columnTop + topPx - scrollTop;
      const blockLeft = creatingSession.columnLeft + 8;
      const blockRight = creatingSession.columnRight - 8;
      const preferredLeft = blockRight + 2;
      const fallbackLeft = blockLeft - popoverWidth - 2;
      const left = preferredLeft + popoverWidth <= window.innerWidth - 12 ? preferredLeft : fallbackLeft;
      setQuickCreateAnchor({
        left: clampLeft(left),
        top: clampTop(blockViewportTop)
      });
    } else {
      setQuickCreateAnchor({ left: window.innerWidth - 380, top: 140 });
    }
    setCreatingSession(null);
  }

  function openQuickEditorForSession(course: Course, meeting: CourseMeeting, anchorDate: Date, anchorRect?: DOMRect) {
    const recurrence = meeting.recurrence;
    const cadence: SessionCadence = recurrence?.cadence === "weekly" ? "weekly" : "none";
    const startMinutes = parseTimeValue(meeting.start) * 60;
    setQuickCreateDraft({
      mode: "edit",
      date: anchorDate,
      start: meeting.start,
      end: meeting.end,
      courseId: course.id,
      meetingId: meeting.id,
      isAllDay: Boolean(meeting.isAllDay),
      title: meeting.title?.trim() || course.name,
      location: meeting.location ?? "",
      sessionType: meeting.type === "tutorial" ? "tutorial" : "lecture",
      cadence,
      repeatDays: recurrence?.daysOfWeek?.length ? recurrence.daysOfWeek : [meeting.day],
      detailsOpen: false
    });
    const popoverWidth = QUICK_CREATE_POPOVER_WIDTH;
    const popoverHeight = QUICK_CREATE_POPOVER_ESTIMATED_HEIGHT;
    const topPx = ((startMinutes - timelineHours[0] * 60) / 60) * (mode === "week" ? WEEK_TIMELINE_ROW_PX : dayHourHeight);
    const clampLeft = (value: number) => Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, value));
    const clampTop = (value: number) => Math.max(12, Math.min(window.innerHeight - popoverHeight - 12, value));
    if (anchorRect) {
      const preferredLeft = anchorRect.right + 2;
      const fallbackLeft = anchorRect.left - popoverWidth - 2;
      const left = preferredLeft + popoverWidth <= window.innerWidth - 12 ? preferredLeft : fallbackLeft;
      setQuickCreateAnchor({
        left: clampLeft(left),
        top: clampTop(anchorRect.top)
      });
      return;
    }
    if (mode === "week" && weekGridBodyRef.current) {
      const dayIndex = weekDates.findIndex((d) => sameCalendarDate(d, anchorDate));
      const weekColumns = Array.from(weekGridBodyRef.current.querySelectorAll("[data-week-column]")) as HTMLElement[];
      const columnEl = dayIndex >= 0 ? weekColumns[dayIndex] ?? null : null;
      const rect = (columnEl ?? weekGridBodyRef.current).getBoundingClientRect();
      const scrollEl = weekGridBodyRef.current.closest(".calendar-scroll-area") as HTMLElement | null;
      const scrollTop = scrollEl?.scrollTop ?? 0;
      const blockViewportTop = rect.top + topPx - scrollTop;
      const blockLeft = rect.left + 6;
      const blockRight = rect.right - 6;
      const preferredLeft = blockRight + 2;
      const fallbackLeft = blockLeft - popoverWidth - 2;
      const left = preferredLeft + popoverWidth <= window.innerWidth - 12 ? preferredLeft : fallbackLeft;
      setQuickCreateAnchor({
        left: clampLeft(left),
        top: clampTop(blockViewportTop)
      });
    } else if (mode === "day" && dayGridBodyRef.current) {
      const dayColumnEl = dayGridBodyRef.current.children.item(1) as HTMLElement | null;
      const rect = (dayColumnEl ?? dayGridBodyRef.current).getBoundingClientRect();
      const scrollEl = dayGridBodyRef.current.closest(".calendar-scroll-area") as HTMLElement | null;
      const scrollTop = scrollEl?.scrollTop ?? 0;
      const blockViewportTop = rect.top + topPx - scrollTop;
      const blockLeft = rect.left + 8;
      const blockRight = rect.right - 8;
      const preferredLeft = blockRight + 2;
      const fallbackLeft = blockLeft - popoverWidth - 2;
      const left = preferredLeft + popoverWidth <= window.innerWidth - 12 ? preferredLeft : fallbackLeft;
      setQuickCreateAnchor({
        left: clampLeft(left),
        top: clampTop(blockViewportTop)
      });
    } else {
      setQuickCreateAnchor({ left: window.innerWidth - 360, top: 140 });
    }
  }

  const clampQuickCreatePopoverToViewport = useCallback(() => {
    if (!quickCreateDraft || !quickCreateAnchor) return;
    const popover = document.getElementById("quick-create-popover");
    if (!popover) return;
    const rect = popover.getBoundingClientRect();
    const nextLeft = Math.max(12, Math.min(window.innerWidth - rect.width - 12, quickCreateAnchor.left));
    const nextTop = Math.max(12, Math.min(window.innerHeight - rect.height - 12, quickCreateAnchor.top));
    if (Math.abs(nextLeft - quickCreateAnchor.left) > 1 || Math.abs(nextTop - quickCreateAnchor.top) > 1) {
      setQuickCreateAnchor({ left: nextLeft, top: nextTop });
    }
  }, [quickCreateAnchor, quickCreateDraft]);

  useLayoutEffect(() => {
    clampQuickCreatePopoverToViewport();
  }, [clampQuickCreatePopoverToViewport]);

  useEffect(() => {
    if (!quickCreateDraft || !quickCreateAnchor) return;
    const popover = document.getElementById("quick-create-popover");
    if (!popover || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      clampQuickCreatePopoverToViewport();
    });
    observer.observe(popover);
    return () => observer.disconnect();
  }, [clampQuickCreatePopoverToViewport, quickCreateAnchor, quickCreateDraft]);

  function minutesFromIso(iso: string): number {
    const date = new Date(iso);
    return date.getHours() * 60 + date.getMinutes();
  }

  function buildIsoAtMinutes(anchor: Date, minutes: number): string {
    const base = new Date(anchor);
    base.setHours(0, 0, 0, 0);
    base.setMinutes(minutes);
    return base.toISOString();
  }

  function getMinimumAllowedMinutesForDate(date: Date): number {
    const hourStartMinutes = timelineHours[0] * 60;
    const dateKey = formatDateKey(date);
    const todayKey = formatDateKey(new Date());
    if (dateKey < todayKey) {
      return (timelineHours[timelineHours.length - 1] + 1) * 60;
    }
    if (dateKey > todayKey) {
      return hourStartMinutes;
    }
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return Math.ceil(nowMinutes / 15) * 15;
  }

  function workBlockDurationMinutesForTask(task: Task | undefined): number {
    void task;
    return 60;
  }

  useEffect(() => () => {
    if (weekTransitionTimeoutRef.current) clearTimeout(weekTransitionTimeoutRef.current);
    if (dayTransitionTimeoutRef.current) clearTimeout(dayTransitionTimeoutRef.current);
  }, []);

  useLayoutEffect(() => {
    weekWbInteractionRef.current = {
      dragPreview: workBlockDragPreview,
      resizePreview: workBlockResizePreview
    };
  }, [workBlockDragPreview, workBlockResizePreview]);

  useEffect(() => {
    setDraggingWorkBlock(null);
    setWorkBlockDragPreview(null);
    setResizingWorkBlock(null);
    setWorkBlockResizePreview(null);
  }, [mode]);

  useEffect(() => {
    if (mode !== "week") return;
    if (!draggingWorkBlock && !resizingWorkBlock) return;
    const hourHeight = WEEK_TIMELINE_ROW_PX;

    function columnEl(dateKey: string): HTMLElement | null {
      return document.querySelector(`[data-week-column="${dateKey}"]`);
    }

    function onMove(e: MouseEvent) {
      if (draggingWorkBlock) {
        const dateKey = resolveWeekColumnKeyFromPoint(e.clientX, e.clientY);
        if (!dateKey) return;
        const col = columnEl(dateKey);
        if (!col) return;
        const bounds = col.getBoundingClientRect();
        const targetDate = new Date(`${dateKey}T12:00:00`);
        const minAllowedMinutes = getMinimumAllowedMinutesForDate(targetDate);
        const slot = calculateDraggedSlot(
          e.clientY,
          bounds,
          draggingWorkBlock.durationMinutes,
          minAllowedMinutes,
          hourHeight
        );
        if (slot.startMinutes >= minAllowedMinutes) {
          const next = { id: draggingWorkBlock.id, ...slot, dateKey };
          weekWbInteractionRef.current.dragPreview = next;
          setWorkBlockDragPreview(next);
        }
        return;
      }
      if (resizingWorkBlock) {
        const dateKey = resizingWorkBlock.dateKey;
        if (!dateKey) return;
        const col = columnEl(dateKey);
        if (!col) return;
        const bounds = col.getBoundingClientRect();
        const pointerMinutes = minutesFromPointer(e.clientY, bounds, hourHeight);
        const minAllowedMinutes = getMinimumAllowedMinutesForDate(new Date(`${dateKey}T12:00:00`));
        const dayEndMinutes = (timelineHours[timelineHours.length - 1] + 1) * 60;
        if (resizingWorkBlock.edge === "start") {
          const clampedStart = Math.max(minAllowedMinutes, Math.min(pointerMinutes, resizingWorkBlock.endMinutes - 15));
          const next = {
            id: resizingWorkBlock.id,
            startMinutes: clampedStart,
            endMinutes: resizingWorkBlock.endMinutes,
            dateKey
          };
          weekWbInteractionRef.current.resizePreview = next;
          setWorkBlockResizePreview(next);
        } else {
          const clampedEnd = Math.min(dayEndMinutes, Math.max(pointerMinutes, resizingWorkBlock.startMinutes + 15));
          const next = {
            id: resizingWorkBlock.id,
            startMinutes: resizingWorkBlock.startMinutes,
            endMinutes: clampedEnd,
            dateKey
          };
          weekWbInteractionRef.current.resizePreview = next;
          setWorkBlockResizePreview(next);
        }
      }
    }

    function onUp() {
      if (draggingWorkBlock) {
        const p = weekWbInteractionRef.current.dragPreview;
        if (p && p.id === draggingWorkBlock.id && p.dateKey) {
          const anchor = new Date(`${p.dateKey}T12:00:00`);
          onUpdateWorkBlock({
            id: p.id,
            startAt: buildIsoAtMinutes(anchor, p.startMinutes),
            endAt: buildIsoAtMinutes(anchor, p.endMinutes)
          });
        }
        setDraggingWorkBlock(null);
        setWorkBlockDragPreview(null);
        weekWbInteractionRef.current.dragPreview = null;
        return;
      }
      if (resizingWorkBlock) {
        const p = weekWbInteractionRef.current.resizePreview;
        if (p && p.id === resizingWorkBlock.id && p.dateKey) {
          const anchor = new Date(`${p.dateKey}T12:00:00`);
          onUpdateWorkBlock({
            id: p.id,
            startAt: buildIsoAtMinutes(anchor, p.startMinutes),
            endAt: buildIsoAtMinutes(anchor, p.endMinutes)
          });
        }
        setResizingWorkBlock(null);
        setWorkBlockResizePreview(null);
        weekWbInteractionRef.current.resizePreview = null;
      }
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp, { capture: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp, { capture: true });
    };
  }, [mode, draggingWorkBlock, resizingWorkBlock, onUpdateWorkBlock]);

  useEffect(() => {
    const years = new Set<number>();
    if (mode === "month") {
      const monthStartGrid = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      const gridStart = startOfWeekGrid(monthStartGrid, "sunday");
      for (let i = 0; i < 42; i += 1) {
        years.add(addDays(gridStart, i).getFullYear());
      }
    } else if (mode === "week") {
      const ws = startOfWeekGrid(selectedDate, "sunday");
      for (let i = 0; i < 7; i += 1) {
        years.add(addDays(ws, i).getFullYear());
      }
    } else {
      years.add(selectedDate.getFullYear());
    }

    setHebcalByYear((prev) => {
      const next = { ...prev };
      for (const y of years) {
        const cached = readCachedHolidayYear(y);
        if (cached) next[y] = cached;
      }
      return next;
    });

    const missing = [...years].filter((y) => readCachedHolidayYear(y) === undefined).sort();
    if (missing.length === 0) return;

    let cancelled = false;
    setHebcalHolidayFetchBusy(true);
    void (async () => {
      await Promise.all(
        missing.map(async (y) => {
          try {
            const res = await fetch(`/api/calendar/holidays?year=${y}`);
            if (!res.ok) {
              console.warn("[holidays] API HTTP", res.status, y);
              return;
            }
            const data = (await res.json()) as { items?: CalendarHolidayChip[]; error?: string };
            if (data.error) {
              console.warn("[holidays] API body error", data.error);
              return;
            }
            const items = data.items ?? [];
            writeCachedHolidayYear(y, items);
            if (!cancelled) {
              setHebcalByYear((prev) => ({ ...prev, [y]: items }));
            }
          } catch (e) {
            console.warn("[holidays] fetch failed", y, e);
          }
        })
      );
      if (!cancelled) setHebcalHolidayFetchBusy(false);
    })();

    return () => {
      cancelled = true;
      setHebcalHolidayFetchBusy(false);
    };
  }, [mode, selectedDate]);

  function buildWeekOccurrencesByDay(anchorDate: Date) {
    const anchorWeekStart = startOfWeekGrid(anchorDate, "sunday");
    const anchorWeekDates = weekDays.map((_, index) => addDays(anchorWeekStart, index));
    const anchorOccurrences = expandMeetingOccurrences(visibleCourses, anchorWeekDates[0], anchorWeekDates[6]);
    const anchorByDate = groupOccurrencesByDate(anchorOccurrences);
    return anchorWeekDates.map((date) => {
      const key = formatDateKey(date);
      return {
        date,
        key,
        sessions: anchorByDate[key] ?? [],
        tasks: taskByDay[key] ?? []
      };
    });
  }

  const weekTransitionData = useMemo(() => {
    if (!weekTransition) return null;
    return {
      from: buildWeekOccurrencesByDay(weekTransition.fromDate),
      to: buildWeekOccurrencesByDay(weekTransition.toDate)
    };
  }, [taskByDay, visibleCourses, weekTransition]);

  function renderWeekGrid(
    weekData: Array<{ date: Date; key: string; sessions: SessionOccurrence[]; tasks: Task[] }>,
    selectedDayForHeader: Date
  ) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-slate-200/80 dark:border-white/10">
        <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-slate-200/80 bg-slate-50/70 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="px-3 pt-2.5 pb-2">
            <p className="whitespace-nowrap text-[21px] leading-none tracking-[-0.02em] text-slate-900 dark:text-slate-100">
              <span className="font-semibold">{selectedDayForHeader.toLocaleDateString(undefined, { month: "long" })}</span>{" "}
              <span className="font-normal text-slate-500 dark:text-slate-400">{selectedDayForHeader.toLocaleDateString(undefined, { year: "numeric" })}</span>
            </p>
            {hebcalHolidayFetchBusy ? (
              <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">Loading Jewish holidays…</p>
            ) : null}
          </div>
          <div className="col-span-7 flex items-start justify-end px-2 py-1.5">
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-white/[0.03]">
                <Button
                  variant="ghost"
                  onClick={() => navigate("prev")}
                  className="h-7 min-w-7 rounded-full px-1 text-[14px] font-semibold leading-none text-slate-700 hover:bg-slate-200/70 dark:text-slate-100 dark:hover:bg-white/[0.08]"
                  aria-label="Previous period"
                >
                  <span aria-hidden>‹</span>
                </Button>
                <Button variant="ghost" onClick={() => onSelectDate(new Date())} className="h-7 rounded-full px-2.5 text-xs">Today</Button>
                <Button
                  variant="ghost"
                  onClick={() => navigate("next")}
                  className="h-7 min-w-7 rounded-full px-1 text-[14px] font-semibold leading-none text-slate-700 hover:bg-slate-200/70 dark:text-slate-100 dark:hover:bg-white/[0.08]"
                  aria-label="Next period"
                >
                  <span aria-hidden>›</span>
                </Button>
              </div>
              <input
                type="date"
                value={formatDateKey(selectedDate)}
                onChange={(event) => onSelectDate(new Date(`${event.target.value}T12:00:00`))}
                className="h-8 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs outline-none dark:border-white/10 dark:bg-white/[0.04]"
              />
              <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-white/[0.03]">
                <Button variant={mode === "month" ? "primary" : "ghost"} onClick={() => onMode("month")} className="h-7 rounded-full px-2.5 text-xs">Month</Button>
                <Button variant={mode === "week" ? "primary" : "ghost"} onClick={() => onMode("week")} className="h-7 rounded-full px-2.5 text-xs">Week</Button>
                <Button
                  variant={mode === "day" ? "primary" : "ghost"}
                  onClick={() => onMode("day")}
                  data-onboarding="calendar-day-button"
                  className="h-7 rounded-full px-2.5 text-xs"
                >
                  Day
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-slate-200/80 bg-slate-50/80 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="px-3 py-3 text-xs text-slate-400">Time</div>
          {weekData.map(({ date, key }) => (
            <button
              type="button"
              key={key}
              onClick={() => {
                onSelectDate(date);
                onMode("day");
              }}
              className={`px-3 py-3 text-left transition ${
                sameCalendarDate(date, selectedDayForHeader) ? "bg-slate-100/80 dark:bg-white/[0.05]" : ""
              }`}
            >
              <p className="text-sm font-medium">
                {date.toLocaleDateString(undefined, { weekday: "short" })}
              </p>
              <p
                className={`text-xs ${
                  sameCalendarDate(date, today)
                    ? "text-sky-600 dark:text-sky-300 drop-shadow-[0_0_10px_rgba(56,189,248,0.45)]"
                    : "text-slate-400"
                }`}
              >
                {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </p>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-slate-200/80 bg-slate-50/70 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="min-h-[22px] border-r border-slate-200/70 dark:border-white/10" aria-hidden />
          {weekData.map(({ key, sessions }) => (
            <div key={`pinned-all-day-${key}`} className="space-y-0.5 border-r border-slate-200/70 px-1.5 py-0.5 dark:border-white/10">
              {sessions
                .filter((item) => item.meeting.isAllDay)
                .map((session) => (
                  <button
                    key={session.instanceKey}
                    type="button"
                    onClick={() => onSessionClick(session.course.id, session.meeting.id!, session.date)}
                    dir="auto"
                    className="w-full rounded-lg px-2 py-px text-start text-[10px] font-medium leading-tight text-slate-900 shadow-[0_4px_10px_rgba(15,23,42,0.08)] dark:shadow-[0_4px_10px_rgba(0,0,0,0.24)]"
                    style={softCourseStyle(session.course.color)}
                  >
                    {session.meeting.title?.trim() || session.course.name}
                  </button>
                ))}
              {(hebcalItemsByDate[key] ?? []).map((h) => (
                <div
                  key={h.id}
                  dir="auto"
                  title={h.label}
                  className={`flex w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight ${hebcalPillClasses(h.subcat)}`}
                >
                  <Star className="h-3 w-3 shrink-0 fill-current opacity-90" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{h.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div
          ref={syncCalendarScrollEl}
          onScroll={(event) => {
            const el = event.currentTarget;
            calendarScrollTopRef.current = el.scrollTop;
          }}
          className="calendar-scroll-area min-h-0 flex-1 overflow-auto calendar-scroll-area-active"
        >
          <div ref={weekGridBodyRef} className="relative grid grid-cols-[64px_repeat(7,minmax(0,1fr))]">
            <div className="border-r border-slate-200/80 dark:border-white/10">
              {timelineHours.map((hour) => (
                <div key={hour} className="border-b border-slate-200/70 px-3 py-2 text-xs text-slate-400 dark:border-white/10" style={{ height: `${WEEK_TIMELINE_ROW_PX}px` }}>
                  {String(hour).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {weekData.map(({ date, key, sessions }) => {
              const timed = layoutOverlappingEvents(sessions.filter((item) => !item.meeting.isAllDay));
              const dayWorkBlocks = (workBlocksByDate[key] ?? []).sort((a, b) => a.startAt.localeCompare(b.startAt));
              return (
                <div
                  key={key}
                  data-week-column={key}
                  className={`relative border-r border-slate-200/70 dark:border-white/10 ${
                    draggingSession || draggingWorkBlock || resizingWorkBlock ? "bg-slate-50/40 dark:bg-white/[0.02]" : ""
                  }`}
                  onMouseDown={(event) => {
                    if (event.button !== 0 || draggingSession || draggingWorkBlock || resizingWorkBlock) return;
                    const rawTarget = event.target;
                    const target = rawTarget instanceof Element ? rawTarget : null;
                    const blocked = Boolean(target?.closest("[data-calendar-interactive='true'],button,input,textarea,select,a,[role='button']"));
                    if (blocked) return;
                    onClearSessionSelection?.();
                    startCreateSession(date, event.clientY, event.clientX, event.currentTarget.getBoundingClientRect(), WEEK_TIMELINE_ROW_PX);
                  }}
                  onMouseMove={(event) => {
                    if (draggingWorkBlock || resizingWorkBlock) return;
                    if (!creatingSession || !sameCalendarDate(creatingSession.date, date)) return;
                    updateCreateSession(event.clientY, event.clientX, event.currentTarget.getBoundingClientRect(), WEEK_TIMELINE_ROW_PX);
                  }}
                  onMouseUp={() => {
                    if (draggingWorkBlock || resizingWorkBlock) return;
                    if (!creatingSession || !sameCalendarDate(creatingSession.date, date)) return;
                    finishCreateSession();
                  }}
                  onMouseLeave={() => {
                    if (draggingWorkBlock || resizingWorkBlock) return;
                    if (!creatingSession || !sameCalendarDate(creatingSession.date, date)) return;
                    finishCreateSession();
                  }}
                  onDragOver={(event) => {
                    if (!draggingSession) return;
                    event.preventDefault();
                    const pointerOffsetMinutes = Math.round(
                      draggingSession.durationMinutes * Math.max(0, Math.min(1, draggingSession.grabOffsetRatio))
                    );
                    const slot = calculateDraggedSlot(
                      event.clientY,
                      event.currentTarget.getBoundingClientRect(),
                      draggingSession.durationMinutes,
                      undefined,
                      80,
                      pointerOffsetMinutes
                    );
                    setDragPreview({ date, ...slot });
                  }}
                  onDrop={(event) => {
                    if (!draggingSession) return;
                    event.preventDefault();
                    const pointerOffsetMinutes = Math.round(
                      draggingSession.durationMinutes * Math.max(0, Math.min(1, draggingSession.grabOffsetRatio))
                    );
                    const slot = calculateDraggedSlot(
                      event.clientY,
                      event.currentTarget.getBoundingClientRect(),
                      draggingSession.durationMinutes,
                      undefined,
                      80,
                      pointerOffsetMinutes
                    );
                    const course = courses.find((item) => item.id === draggingSession.courseId);
                    const meeting = course?.meetings.find((item) => item.id === draggingSession.meetingId);
                    const recurrenceCadence = meeting?.recurrence?.cadence ?? "weekly";
                    if (meeting && recurrenceCadence !== "none") {
                      setRecurrenceMovePrompt({
                        courseId: draggingSession.courseId,
                        meetingId: draggingSession.meetingId,
                        sourceDate: draggingSession.sourceDate,
                        targetDate: date,
                        startMinutes: slot.startMinutes
                      });
                    } else {
                      moveMeetingAtMinutes(
                        draggingSession.courseId,
                        draggingSession.meetingId,
                        date,
                        slot.startMinutes
                      );
                    }
                    setDragPreview(null);
                    setDraggingSession(null);
                  }}
                >
                  {timelineHours.map((hour) => (
                    <div key={`${key}-${hour}`} className="border-b border-slate-200/70 dark:border-white/10" style={{ height: `${WEEK_TIMELINE_ROW_PX}px` }} />
                  ))}
                  {creatingSession && creatingSession.hasDragged && sameCalendarDate(creatingSession.date, date) && (
                    <div
                      ref={tentativeBlockRef}
                      className="pointer-events-none absolute left-[6px] right-[6px] rounded-2xl border-2 border-dashed border-sky-400/70 bg-sky-100/45"
                      style={{
                        top: ((creatingSession.startMinutes - timelineHours[0] * 60) / 60) * WEEK_TIMELINE_ROW_PX,
                        height: Math.max(28, ((creatingSession.endMinutes - creatingSession.startMinutes) / 60) * WEEK_TIMELINE_ROW_PX)
                      }}
                    />
                  )}
                  {quickCreateDraft && quickCreateDraft.mode === "create" && sameCalendarDate(quickCreateDraft.date, date) && (
                    <div
                      ref={quickDraftBlockRef}
                      className="pointer-events-none absolute left-[6px] right-[6px] rounded-2xl border border-sky-400/60 bg-sky-100/50"
                      style={{
                        top: ((parseTimeValue(quickCreateDraft.start) - timelineHours[0]) * WEEK_TIMELINE_ROW_PX),
                        height: Math.max(28, (parseTimeValue(quickCreateDraft.end) - parseTimeValue(quickCreateDraft.start)) * WEEK_TIMELINE_ROW_PX)
                      }}
                    >
                      <div className="px-2 py-1 text-[11px] font-medium text-sky-900/80 dark:text-sky-100/80">
                        {quickCreateDraft.title.trim() || "New Session"}
                      </div>
                    </div>
                  )}
                  {dragPreview && sameCalendarDate(dragPreview.date, date) && (
                    <div
                      className="pointer-events-none absolute left-[6px] right-[6px] z-20 rounded-2xl border-2 border-dashed border-violet-500/60 bg-violet-100/40"
                      style={{
                        top: ((dragPreview.startMinutes - timelineHours[0] * 60) / 60) * WEEK_TIMELINE_ROW_PX,
                        height: Math.max(28, ((dragPreview.endMinutes - dragPreview.startMinutes) / 60) * WEEK_TIMELINE_ROW_PX)
                      }}
                    >
                      <div className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-medium text-violet-700 shadow-sm">
                        {formatHourMinutes(dragPreview.startMinutes)} - {formatHourMinutes(dragPreview.endMinutes)}
                      </div>
                    </div>
                  )}
                  {timed.map((session) => {
                    const startHour = parseTimeValue(session.meeting.start);
                    const endHour = parseTimeValue(session.meeting.end);
                    const top = Math.max(0, (startHour - timelineHours[0]) * WEEK_TIMELINE_ROW_PX);
                    const height = Math.max(28, (endHour - startHour) * WEEK_TIMELINE_ROW_PX);
                    const overlapStepPct = session.totalColumns > 1 ? Math.min(10, 100 / (session.totalColumns * 2)) : 0;
                    const overlapWidthPct = session.totalColumns > 1 ? 100 - overlapStepPct * (session.totalColumns - 1) : 100;
                    const isFreshlyAddedCourse = newlyAddedCourseId === session.course.id;
                    return (
                      <button
                        type="button"
                        key={session.instanceKey}
                        data-calendar-interactive="true"
                        draggable
                        onMouseDown={(event) => {
                          // Prevent empty-grid drag-create handlers from firing when interacting with an existing session.
                          event.stopPropagation();
                        }}
                        onDragStart={(event) => {
                          const durationMinutes = Math.max(30, Math.round((parseTimeValue(session.meeting.end) - parseTimeValue(session.meeting.start)) * 60));
                          const rect = event.currentTarget.getBoundingClientRect();
                          const grabOffsetRatio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
                          setDraggingSession({
                            courseId: session.course.id,
                            meetingId: session.meeting.id!,
                            durationMinutes,
                            grabOffsetRatio: Math.max(0, Math.min(1, grabOffsetRatio)),
                            sourceDate: session.date
                          });
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", session.meeting.id!);
                        }}
                        onDragEnd={() => {
                          setDraggingSession(null);
                          setDragPreview(null);
                        }}
                        onClick={() => onSessionClick(session.course.id, session.meeting.id!, session.date)}
                        onDoubleClick={(event) => {
                          onSessionDoubleClick?.(session.course.id, session.meeting.id!, session.date);
                          openQuickEditorForSession(
                            session.course,
                            session.meeting,
                            session.date,
                            event.currentTarget.getBoundingClientRect()
                          );
                        }}
                        dir="auto"
                        className="absolute overflow-hidden rounded-2xl border px-3 py-2 text-start text-xs shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition-opacity"
                        style={{
                          ...softCourseStyle(session.course.color),
                          top,
                          height,
                          borderColor:
                            selectedSession?.courseId === session.course.id &&
                            selectedSession?.meetingId === session.meeting.id &&
                            sameCalendarDate(selectedSession.anchorDate, session.date)
                              ? "rgba(250,204,21,0.72)"
                              : `${session.course.color}50`,
                          left: `calc(${session.column * overlapStepPct}% + 6px)`,
                          width: `calc(${overlapWidthPct}% - 12px)`,
                          opacity: hoveredTentativeOptionId ? 0.22 : 1,
                          zIndex: 10 + session.column,
                          boxShadow:
                            selectedSession?.courseId === session.course.id &&
                            selectedSession?.meetingId === session.meeting.id &&
                            sameCalendarDate(selectedSession.anchorDate, session.date)
                              ? "0 0 0 1px rgba(250,204,21,0.55), 0 0 14px rgba(250,204,21,0.20), 0 10px 24px rgba(15,23,42,0.08)"
                              : isFreshlyAddedCourse
                                ? "0 0 0 1px rgba(34,197,94,0.45), 0 0 18px rgba(16,185,129,0.26), 0 10px 24px rgba(15,23,42,0.08)"
                                : undefined
                        }}
                      >
                        <p className="truncate font-semibold text-slate-900 dark:text-white">{session.course.name}</p>
                        <p className="truncate text-slate-700 dark:text-white/95">{session.meeting.title || formatSessionType(session.meeting.type)}</p>
                        <p className="mt-1 text-[11px] text-slate-600 dark:text-white/90">{session.meeting.start} - {session.meeting.end}</p>
                        {session.meeting.location && (
                          <p className="mt-0.5 whitespace-normal break-words text-[11px] leading-snug text-slate-600 dark:text-white/90">
                            {session.meeting.location}
                          </p>
                        )}
                      </button>
                    );
                  })}
                  {(tentativeByDate[key] ?? [])
                    .filter((item) => !item.meeting.isAllDay)
                    .map((session) => {
                      const startHour = parseTimeValue(session.meeting.start);
                      const endHour = parseTimeValue(session.meeting.end);
                      const top = Math.max(0, (startHour - timelineHours[0]) * WEEK_TIMELINE_ROW_PX);
                      const height = Math.max(28, (endHour - startHour) * WEEK_TIMELINE_ROW_PX);
                      return (
                        <button
                          key={`tentative-${session.instanceKey}`}
                          type="button"
                          onClick={() => onPickTentativeOption?.(session.course.id)}
                          onMouseEnter={() => setHoveredTentativeOptionId(session.course.id)}
                          onMouseLeave={() => setHoveredTentativeOptionId((current) => (current === session.course.id ? null : current))}
                          className="absolute left-[10px] right-[10px] z-[14] overflow-hidden rounded-2xl border-2 border-amber-400/80 bg-amber-100/35 px-3 py-2 text-start text-xs shadow-[0_0_0_1px_rgba(251,191,36,0.45),0_0_26px_rgba(251,191,36,0.45)] transition-all dark:bg-amber-400/15"
                          style={{
                            top,
                            height,
                            opacity: hoveredTentativeOptionId && hoveredTentativeOptionId !== session.course.id ? 0.3 : 1,
                            transform: hoveredTentativeOptionId === session.course.id ? "scale(1.015)" : "scale(1)"
                          }}
                        >
                          <p className="truncate font-semibold text-amber-900 dark:text-amber-100">Tentative: {session.course.name}</p>
                          <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-200">{session.meeting.start} - {session.meeting.end}</p>
                          {session.meeting.location && (
                            <p className="mt-0.5 whitespace-normal break-words text-[11px] leading-snug text-amber-800 dark:text-amber-200">
                              {session.meeting.location}
                            </p>
                          )}
                          {hoveredTentativeOptionId === session.course.id && (
                            <div className="mt-2 rounded-lg bg-white/75 p-2 text-[11px] text-amber-950 dark:bg-black/30 dark:text-amber-100">
                              <p className="font-semibold">{session.meeting.title || "Session option"}</p>
                              <p className="mt-1">{session.meeting.day} {session.meeting.start} - {session.meeting.end}</p>
                              {session.meeting.location && <p className="mt-1">{session.meeting.location}</p>}
                              <p className="mt-1 opacity-80">Click to choose this option</p>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  {dayWorkBlocks.map((block) => {
                    const sourceKey = formatDateKey(new Date(block.startAt));
                    if (sourceKey !== key) return null;
                    const dragP = workBlockDragPreview?.id === block.id ? workBlockDragPreview : null;
                    if (dragP?.dateKey && dragP.dateKey !== key) return null;
                    const resizeP = workBlockResizePreview?.id === block.id ? workBlockResizePreview : null;
                    const blockStartMinutes = minutesFromIso(block.startAt);
                    const blockEndMinutes = minutesFromIso(block.endAt);
                    const startM = resizeP ? resizeP.startMinutes : dragP ? dragP.startMinutes : blockStartMinutes;
                    const endM = resizeP ? resizeP.endMinutes : dragP ? dragP.endMinutes : blockEndMinutes;
                    const top = Math.max(0, ((startM - timelineHours[0] * 60) / 60) * WEEK_TIMELINE_ROW_PX);
                    const height = Math.max(28, ((endM - startM) / 60) * WEEK_TIMELINE_ROW_PX);
                    const isCompactBlock = height < 68;
                    const course = courseMap[block.courseId as string];
                    const linkedTask = tasks.find((task) => task.id === block.taskId);
                    const color = block.colorSnapshot ?? course?.color ?? "#10b981";
                    return (
                      <button
                        key={`wb-${block.id}`}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const minAllowedMinutes = getMinimumAllowedMinutesForDate(date);
                          if (minAllowedMinutes >= (timelineHours[timelineHours.length - 1] + 1) * 60) return;
                          setDraggingWorkBlock({ id: block.id, durationMinutes: endM - startM });
                          setWorkBlockDragPreview({
                            id: block.id,
                            startMinutes: startM,
                            endMinutes: endM,
                            dateKey: key
                          });
                        }}
                        onDoubleClick={() => setActiveWorkBlockId(block.id)}
                        className={`absolute left-[8px] right-[8px] z-[11] overflow-hidden rounded-2xl border text-start text-xs shadow-[0_10px_24px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.25)] ${
                          isCompactBlock ? "px-3 py-1.5" : "px-3 py-2"
                        }`}
                        style={{
                          ...softCourseStyle(color),
                          top,
                          height,
                          borderColor: `${color}55`
                        }}
                      >
                        <p className={`truncate font-semibold text-slate-900 dark:text-white ${isCompactBlock ? "leading-4" : ""}`}>
                          {linkedTask?.title ?? block.titleSnapshot ?? "Work block"}
                        </p>
                        <p
                          className={`mt-1 truncate text-[11px] text-slate-600 dark:text-white/90 ${isCompactBlock ? "leading-4" : ""}`}
                        >
                          {new Date(block.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                          {new Date(block.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <span
                          className={`absolute left-3 right-3 top-0.5 h-1.5 cursor-ns-resize rounded-full bg-white/20 opacity-0 transition-opacity hover:opacity-100 ${isCompactBlock ? "h-1" : ""}`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const minAllowedMinutes = getMinimumAllowedMinutesForDate(date);
                            if (minAllowedMinutes >= (timelineHours[timelineHours.length - 1] + 1) * 60) return;
                            setResizingWorkBlock({
                              id: block.id,
                              edge: "start",
                              startMinutes: startM,
                              endMinutes: endM,
                              dateKey: key
                            });
                            setWorkBlockResizePreview({
                              id: block.id,
                              startMinutes: Math.max(startM, minAllowedMinutes),
                              endMinutes: endM,
                              dateKey: key
                            });
                          }}
                        />
                        <span
                          className={`absolute left-3 right-3 bottom-0.5 h-1.5 cursor-ns-resize rounded-full bg-white/20 opacity-0 transition-opacity hover:opacity-100 ${isCompactBlock ? "h-1" : ""}`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const minAllowedMinutes = getMinimumAllowedMinutesForDate(date);
                            if (minAllowedMinutes >= (timelineHours[timelineHours.length - 1] + 1) * 60) return;
                            setResizingWorkBlock({
                              id: block.id,
                              edge: "end",
                              startMinutes: startM,
                              endMinutes: endM,
                              dateKey: key
                            });
                            setWorkBlockResizePreview({
                              id: block.id,
                              startMinutes: startM,
                              endMinutes: endM,
                              dateKey: key
                            });
                          }}
                        />
                      </button>
                    );
                  })}
                  {(() => {
                    const p = workBlockDragPreview;
                    if (!p?.dateKey || p.dateKey !== key) return null;
                    const block = scheduledWorkBlocks.find((b) => b.id === p.id);
                    if (!block) return null;
                    const srcKey = formatDateKey(new Date(block.startAt));
                    if (srcKey === key) return null;
                    const top = Math.max(0, ((p.startMinutes - timelineHours[0] * 60) / 60) * WEEK_TIMELINE_ROW_PX);
                    const height = Math.max(28, ((p.endMinutes - p.startMinutes) / 60) * WEEK_TIMELINE_ROW_PX);
                    const course = courseMap[block.courseId as string];
                    const linkedTask = tasks.find((task) => task.id === block.taskId);
                    const color = block.colorSnapshot ?? course?.color ?? "#10b981";
                    return (
                      <div
                        key={`wb-ghost-${block.id}`}
                        className="pointer-events-none absolute left-[8px] right-[8px] z-[12] overflow-hidden rounded-2xl border border-dashed border-white/40 px-3 py-2 text-start text-xs opacity-90 shadow-[0_10px_24px_rgba(15,23,42,0.12)]"
                        style={{
                          ...softCourseStyle(color),
                          top,
                          height,
                          borderColor: `${color}88`
                        }}
                      >
                        <p className="truncate font-semibold text-slate-900 dark:text-white">{linkedTask?.title ?? block.titleSnapshot ?? "Work block"}</p>
                        <p className="mt-1 truncate text-[11px] text-slate-600 dark:text-white/90">
                          {formatHourMinutes(p.startMinutes)} – {formatHourMinutes(p.endMinutes)}
                        </p>
                      </div>
                    );
                  })()}
                  {sameCalendarDate(date, today) && currentTimeTopWeek !== null && (
                    <div className="pointer-events-none absolute left-0 right-0 z-20" style={{ top: currentTimeTopWeek }}>
                      <div className="h-px bg-rose-400/80 shadow-[0_0_8px_rgba(251,113,133,0.6)]" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Panel data-onboarding="calendar-week-grid" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white/90 dark:bg-[#101317]/90">
      {mode !== "week" && (
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          {mode === "day" ? (
            <div className="px-1 pt-0.5">
              <p className="whitespace-nowrap text-[21px] leading-none tracking-[-0.02em] text-slate-900 dark:text-slate-100">
                <span className="font-semibold">{selectedDate.toLocaleDateString(undefined, { month: "long" })}</span>{" "}
                <span className="font-normal text-slate-500 dark:text-slate-400">{selectedDate.toLocaleDateString(undefined, { year: "numeric" })}</span>
              </p>
            </div>
          ) : (
            <div />
          )}
          <div className="flex flex-wrap items-center justify-end gap-1.5">
          <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-white/[0.03]">
            <Button
              variant="ghost"
              onClick={() => navigate("prev")}
              className="h-7 min-w-7 rounded-full px-1 text-[14px] font-semibold leading-none text-slate-700 hover:bg-slate-200/70 dark:text-slate-100 dark:hover:bg-white/[0.08]"
              aria-label="Previous period"
            >
              <span aria-hidden>‹</span>
            </Button>
            <Button variant="ghost" onClick={() => onSelectDate(new Date())} className="h-7 rounded-full px-2.5 text-xs">Today</Button>
            <Button
              variant="ghost"
              onClick={() => navigate("next")}
              className="h-7 min-w-7 rounded-full px-1 text-[14px] font-semibold leading-none text-slate-700 hover:bg-slate-200/70 dark:text-slate-100 dark:hover:bg-white/[0.08]"
              aria-label="Next period"
            >
              <span aria-hidden>›</span>
            </Button>
          </div>
          <input
            type="date"
            value={formatDateKey(selectedDate)}
            onChange={(event) => onSelectDate(new Date(`${event.target.value}T12:00:00`))}
            className="h-8 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs outline-none dark:border-white/10 dark:bg-white/[0.04]"
          />
          <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 dark:border-white/10 dark:bg-white/[0.03]">
            <Button variant={mode === "month" ? "primary" : "ghost"} onClick={() => onMode("month")} className="h-7 rounded-full px-2.5 text-xs">Month</Button>
            <Button variant="ghost" onClick={() => onMode("week")} className="h-7 rounded-full px-2.5 text-xs">Week</Button>
            <Button
              variant={mode === "day" ? "primary" : "ghost"}
              onClick={() => onMode("day")}
              data-onboarding="calendar-day-button"
              className="h-7 rounded-full px-2.5 text-xs"
            >
              Day
            </Button>
          </div>
          </div>
        </div>
      )}
      {tentativeOptions && tentativeOptions.length > 0 && (
        <p data-onboarding="tentative-choices-banner" className="mb-2 truncate text-[11px] text-amber-600/95 dark:text-amber-200/95">
          Choose 1 of {tentativeOptionSummary?.optionCount ?? tentativeOptions.length} for {tentativeChoiceTitle ?? "session group"}
          {tentativeOptionSummary
            ? ` · ${tentativeOptionSummary.minBlocks === tentativeOptionSummary.maxBlocks
              ? `${tentativeOptionSummary.minBlocks} weekly block${tentativeOptionSummary.minBlocks === 1 ? "" : "s"} each`
              : "multiple weekly blocks"}`
            : ""}
        </p>
      )}
      <div className="min-h-0 flex-1">
      {mode === "month" ? (
        <>
          <div className="grid grid-cols-7 gap-2 text-xs text-slate-500">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="px-2 py-1">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {monthDays.map((day) => {
              const key = formatDateKey(day);
              const dayTasks = (taskByDay[key] ?? []).sort(taskComparator);
              const daySessions = (sessionByDate[key] ?? []).slice(0, 2);
              const inMonth = day.getMonth() === selectedDate.getMonth();
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => {
                    onSelectDate(day);
                    onMode("day");
                  }}
                  className={`min-h-[132px] rounded-2xl border p-2 text-left transition ${inMonth ? "border-slate-200 dark:border-white/10" : "border-transparent opacity-45"} ${sameCalendarDate(day, selectedDate) ? "ring-2 ring-slate-900/10 dark:ring-white/20" : ""}`}
                >
                  <p className="mb-1 flex items-center gap-1.5 text-xs">
                    <span>{day.getDate()}</span>
                    {(hebcalItemsByDate[key]?.length ?? 0) > 0 ? (
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.7)]"
                        title="Jewish holiday or special day"
                        aria-label="Jewish holiday or special day"
                      />
                    ) : null}
                  </p>
                  <div className="space-y-1">
                    {daySessions.map((session) => (
                      <div key={session.instanceKey} className="rounded-xl px-2 py-1 text-[11px] font-medium text-slate-900 dark:text-slate-100" style={softCourseStyle(session.course.color)}>
                        {session.course.name}
                      </div>
                    ))}
                    {dayTasks.slice(0, 2).map((task) => (
                      <div key={task.id} className="rounded-xl border border-slate-200/80 px-2 py-1 text-[11px] font-medium text-slate-700 dark:border-white/10 dark:text-slate-200" style={softCourseStyle(courseMap[task.courseId as string]?.color ?? "#94a3b8")}>
                        {task.title}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      ) : mode === "week" ? (
        weekTransition ? (
          <div className="h-full min-h-0 overflow-hidden rounded-[28px] border border-slate-200/80 dark:border-white/10">
            <div
              className="flex h-full min-h-0"
              style={{
                transition: weekTransitionActive
                  ? "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)"
                  : "none",
                transform:
                  weekTransition.direction === "next"
                    ? `translateX(${weekTransitionActive ? "-100%" : "0%"})`
                    : `translateX(${weekTransitionActive ? "0%" : "-100%"})`
              }}
            >
              {weekTransition.direction === "next" ? (
                <>
                  <div className="h-full w-full shrink-0 min-h-0">{renderWeekGrid(weekTransitionData?.from ?? buildWeekOccurrencesByDay(weekTransition.fromDate), weekTransition.fromDate)}</div>
                  <div className="h-full w-full shrink-0 min-h-0">{renderWeekGrid(weekTransitionData?.to ?? buildWeekOccurrencesByDay(weekTransition.toDate), weekTransition.toDate)}</div>
                </>
              ) : (
                <>
                  <div className="h-full w-full shrink-0 min-h-0">{renderWeekGrid(weekTransitionData?.to ?? buildWeekOccurrencesByDay(weekTransition.toDate), weekTransition.toDate)}</div>
                  <div className="h-full w-full shrink-0 min-h-0">{renderWeekGrid(weekTransitionData?.from ?? buildWeekOccurrencesByDay(weekTransition.fromDate), weekTransition.fromDate)}</div>
                </>
              )}
            </div>
          </div>
        ) : (
          renderWeekGrid(weekOccurrencesByDay, selectedDate)
        )
      ) : (
        <div data-onboarding="calendar-day-planner" className="grid h-full min-h-0 gap-4 xl:grid-cols-[1.25fr_0.9fr]">
          <div
            className="flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/60 dark:border-white/10 dark:bg-white/[0.02]"
            style={
              dayTransition
                ? {
                    transition: dayTransitionActive ? "transform 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 320ms ease" : "none",
                    transform:
                      dayTransition.direction === "next"
                        ? `translateX(${dayTransitionActive ? "0%" : "14%"})`
                        : `translateX(${dayTransitionActive ? "0%" : "-14%"})`,
                    opacity: dayTransitionActive ? 1 : 0.96
                  }
                : undefined
            }
          >
            <div className="border-b border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
              <h4 className="font-semibold">{selectedDate.toLocaleDateString(undefined, { weekday: "long" })}</h4>
              <p className="text-sm text-slate-500 dark:text-slate-400">{selectedDate.toLocaleDateString(undefined, { month: "long", day: "numeric" })}</p>
            </div>
            <div className="border-b border-slate-200/80 bg-slate-50/60 px-4 py-2.5 dark:border-white/10 dark:bg-white/[0.02]">
              {hebcalHolidayFetchBusy ? (
                <p className="mb-2 text-[10px] text-slate-400 dark:text-slate-500">Loading holidays…</p>
              ) : null}
              <div className="flex min-h-[22px] flex-col gap-0.5">
                {selectedDaySessions.filter((item) => item.meeting.isAllDay).map((session) => (
                  <button
                    key={session.instanceKey}
                    type="button"
                    onClick={() => onSessionClick(session.course.id, session.meeting.id!, session.date)}
                    dir="auto"
                    className="w-full rounded-lg px-2 py-0.5 text-start text-[10px] font-medium leading-tight text-slate-900"
                    style={softCourseStyle(session.course.color)}
                  >
                    {session.meeting.title?.trim() || session.course.name}
                  </button>
                ))}
                {(hebcalItemsByDate[selectedKey] ?? []).map((h) => (
                  <div
                    key={h.id}
                    dir="auto"
                    title={h.label}
                    className={`flex w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight ${hebcalPillClasses(h.subcat)}`}
                  >
                    <Star className="h-3 w-3 shrink-0 fill-current opacity-90" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{h.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div
              ref={syncCalendarScrollEl}
              onScroll={(event) => {
                const el = event.currentTarget;
                calendarScrollTopRef.current = el.scrollTop;
              }}
              className="calendar-scroll-area min-h-0 flex-1 overflow-auto calendar-scroll-area-active"
            >
              <div ref={dayGridBodyRef} className="relative grid grid-cols-[72px_minmax(0,1fr)]">
                <div className="border-r border-slate-200/80 dark:border-white/10">
                  {timelineHours.map((hour) => (
                    <div key={hour} className="border-b border-slate-200/70 px-3 py-2 text-xs text-slate-400 dark:border-white/10" style={{ height: `${dayHourHeight}px` }}>
                      {String(hour).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>
                <div
                  className={`relative ${draggingSession || draggingTaskId || draggingWorkBlock ? "bg-slate-50/40 dark:bg-white/[0.02]" : ""}`}
                  onMouseDown={(event) => {
                    if (event.button !== 0 || draggingSession) return;
                    const rawTarget = event.target;
                    const target = rawTarget instanceof Element ? rawTarget : null;
                    const blocked = Boolean(target?.closest("[data-calendar-interactive='true'],button,input,textarea,select,a,[role='button']"));
                    if (blocked) return;
                    onClearSessionSelection?.();
                    startCreateSession(selectedDate, event.clientY, event.clientX, event.currentTarget.getBoundingClientRect(), dayHourHeight);
                  }}
                  onMouseMove={(event) => {
                    if (resizingWorkBlock) {
                      const bounds = event.currentTarget.getBoundingClientRect();
                      const pointerMinutes = minutesFromPointer(event.clientY, bounds, dayHourHeight);
                      const minAllowedMinutes = getMinimumAllowedMinutesForDate(selectedDate);
                      const dk = formatDateKey(selectedDate);
                      if (resizingWorkBlock.edge === "start") {
                        const clampedStart = Math.max(minAllowedMinutes, Math.min(pointerMinutes, resizingWorkBlock.endMinutes - 15));
                        setWorkBlockResizePreview({
                          id: resizingWorkBlock.id,
                          startMinutes: clampedStart,
                          endMinutes: resizingWorkBlock.endMinutes,
                          dateKey: dk
                        });
                      } else {
                        const dayEndMinutes = (timelineHours[timelineHours.length - 1] + 1) * 60;
                        const clampedEnd = Math.min(dayEndMinutes, Math.max(pointerMinutes, resizingWorkBlock.startMinutes + 15));
                        setWorkBlockResizePreview({
                          id: resizingWorkBlock.id,
                          startMinutes: resizingWorkBlock.startMinutes,
                          endMinutes: clampedEnd,
                          dateKey: dk
                        });
                      }
                      return;
                    }
                    if (draggingWorkBlock) {
                      const minAllowedMinutes = getMinimumAllowedMinutesForDate(selectedDate);
                      const slot = calculateDraggedSlot(
                        event.clientY,
                        event.currentTarget.getBoundingClientRect(),
                        draggingWorkBlock.durationMinutes,
                        minAllowedMinutes,
                        dayHourHeight
                      );
                      if (slot.startMinutes >= minAllowedMinutes) {
                        setWorkBlockDragPreview({ id: draggingWorkBlock.id, ...slot, dateKey: formatDateKey(selectedDate) });
                      }
                      return;
                    }
                    if (!creatingSession || !sameCalendarDate(creatingSession.date, selectedDate)) return;
                    updateCreateSession(event.clientY, event.clientX, event.currentTarget.getBoundingClientRect(), dayHourHeight);
                  }}
                  onMouseUp={() => {
                    if (resizingWorkBlock) {
                      if (workBlockResizePreview && workBlockResizePreview.id === resizingWorkBlock.id) {
                        const rk = workBlockResizePreview.dateKey ?? formatDateKey(selectedDate);
                        const anchor = new Date(`${rk}T12:00:00`);
                        onUpdateWorkBlock({
                          id: resizingWorkBlock.id,
                          startAt: buildIsoAtMinutes(anchor, workBlockResizePreview.startMinutes),
                          endAt: buildIsoAtMinutes(anchor, workBlockResizePreview.endMinutes)
                        });
                      }
                      setResizingWorkBlock(null);
                      setWorkBlockResizePreview(null);
                      return;
                    }
                    if (draggingWorkBlock) {
                      if (workBlockDragPreview && workBlockDragPreview.id === draggingWorkBlock.id) {
                        const dk = workBlockDragPreview.dateKey ?? formatDateKey(selectedDate);
                        const anchor = new Date(`${dk}T12:00:00`);
                        onUpdateWorkBlock({
                          id: draggingWorkBlock.id,
                          startAt: buildIsoAtMinutes(anchor, workBlockDragPreview.startMinutes),
                          endAt: buildIsoAtMinutes(anchor, workBlockDragPreview.endMinutes)
                        });
                      }
                      setDraggingWorkBlock(null);
                      setWorkBlockDragPreview(null);
                      return;
                    }
                    if (!creatingSession || !sameCalendarDate(creatingSession.date, selectedDate)) return;
                    finishCreateSession();
                  }}
                  onMouseLeave={() => {
                    if (resizingWorkBlock) return;
                    if (draggingWorkBlock) return;
                    if (!creatingSession || !sameCalendarDate(creatingSession.date, selectedDate)) return;
                    finishCreateSession();
                  }}
                  onDragOver={(event) => {
                    if (draggingSession) {
                      event.preventDefault();
                      const pointerOffsetMinutes = Math.round(
                        draggingSession.durationMinutes * Math.max(0, Math.min(1, draggingSession.grabOffsetRatio))
                      );
                      const slot = calculateDraggedSlot(
                        event.clientY,
                        event.currentTarget.getBoundingClientRect(),
                        draggingSession.durationMinutes,
                        undefined,
                        dayHourHeight,
                        pointerOffsetMinutes
                      );
                      setDragPreview({ date: selectedDate, ...slot });
                      return;
                    }

                    const taskId = draggingTaskId ?? event.dataTransfer.getData("application/x-task-id");
                    if (!taskId) return;
                    event.preventDefault();
                    const task = tasks.find((t) => t.id === taskId);
                    const durationMinutes = workBlockDurationMinutesForTask(task);
                    const minAllowedMinutes = timelineHours[0] * 60;
                    const slot = calculateDraggedSlot(
                      event.clientY,
                      event.currentTarget.getBoundingClientRect(),
                      durationMinutes,
                      minAllowedMinutes,
                      dayHourHeight
                    );
                    if (slot.startMinutes < minAllowedMinutes) return;
                    setTaskDropPreview(slot);
                  }}
                  onDrop={(event) => {
                    if (draggingSession) {
                      event.preventDefault();
                      const pointerOffsetMinutes = Math.round(
                        draggingSession.durationMinutes * Math.max(0, Math.min(1, draggingSession.grabOffsetRatio))
                      );
                      const slot = calculateDraggedSlot(
                        event.clientY,
                        event.currentTarget.getBoundingClientRect(),
                        draggingSession.durationMinutes,
                        undefined,
                        dayHourHeight,
                        pointerOffsetMinutes
                      );
                      const course = courses.find((item) => item.id === draggingSession.courseId);
                      const meeting = course?.meetings.find((item) => item.id === draggingSession.meetingId);
                      const recurrenceCadence = meeting?.recurrence?.cadence ?? "weekly";
                      if (meeting && recurrenceCadence !== "none") {
                        setRecurrenceMovePrompt({
                          courseId: draggingSession.courseId,
                          meetingId: draggingSession.meetingId,
                          sourceDate: draggingSession.sourceDate,
                          targetDate: selectedDate,
                          startMinutes: slot.startMinutes
                        });
                      } else {
                        moveMeetingAtMinutes(
                          draggingSession.courseId,
                          draggingSession.meetingId,
                          selectedDate,
                          slot.startMinutes
                        );
                      }
                      setDragPreview(null);
                      setDraggingSession(null);
                      return;
                    }

                    const taskId = draggingTaskId ?? event.dataTransfer.getData("application/x-task-id");
                    if (!taskId) return;
                    event.preventDefault();
                    const task = tasks.find((t) => t.id === taskId);
                    if (!task) return;
                    const durationMinutes = workBlockDurationMinutesForTask(task);
                    const minAllowedMinutes = timelineHours[0] * 60;
                    const slot = calculateDraggedSlot(event.clientY, event.currentTarget.getBoundingClientRect(), durationMinutes, minAllowedMinutes, dayHourHeight);
                    if (slot.startMinutes < minAllowedMinutes) return;
                    const startAt = buildIsoAtMinutes(selectedDate, slot.startMinutes);
                    const endAt = buildIsoAtMinutes(selectedDate, slot.endMinutes);
                    const course = courseMap[task.courseId as string];
                    onAddWorkBlock({
                      taskId: task.id,
                      courseId: task.courseId,
                      startAt,
                      endAt,
                      status: "scheduled",
                      titleSnapshot: task.title,
                      colorSnapshot: course?.color
                    });
                    setTaskDropPreview(null);
                    setDraggingTaskId(null);
                  }}
                >
                  {timelineHours.map((hour) => (
                    <div key={hour} className="border-b border-slate-200/70 dark:border-white/10" style={{ height: `${dayHourHeight}px` }} />
                  ))}
                  {creatingSession && creatingSession.hasDragged && sameCalendarDate(creatingSession.date, selectedDate) && (
                    <div
                      ref={tentativeBlockRef}
                      className="pointer-events-none absolute left-[8px] right-[8px] rounded-[18px] border-2 border-dashed border-sky-400/70 bg-sky-100/45"
                      style={{
                        top: ((creatingSession.startMinutes - timelineHours[0] * 60) / 60) * dayHourHeight,
                        height: Math.max(28, ((creatingSession.endMinutes - creatingSession.startMinutes) / 60) * dayHourHeight)
                      }}
                    />
                  )}
                  {quickCreateDraft && quickCreateDraft.mode === "create" && sameCalendarDate(quickCreateDraft.date, selectedDate) && (
                    <div
                      ref={quickDraftBlockRef}
                      className="pointer-events-none absolute left-[8px] right-[8px] rounded-[18px] border border-sky-400/60 bg-sky-100/50"
                      style={{
                        top: ((parseTimeValue(quickCreateDraft.start) - timelineHours[0]) * dayHourHeight),
                        height: Math.max(28, (parseTimeValue(quickCreateDraft.end) - parseTimeValue(quickCreateDraft.start)) * dayHourHeight)
                      }}
                    >
                      <div className="px-2 py-1 text-[11px] font-medium text-sky-900/80 dark:text-sky-100/80">
                        {quickCreateDraft.title.trim() || "New Session"}
                      </div>
                    </div>
                  )}
                  {dragPreview && sameCalendarDate(dragPreview.date, selectedDate) && (
                    <div
                      className="pointer-events-none absolute left-[8px] right-[8px] z-20 rounded-[18px] border-2 border-dashed border-violet-500/60 bg-violet-100/40"
                      style={{
                        top: ((dragPreview.startMinutes - timelineHours[0] * 60) / 60) * dayHourHeight,
                        height: Math.max(28, ((dragPreview.endMinutes - dragPreview.startMinutes) / 60) * dayHourHeight)
                      }}
                    >
                      <div className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-medium text-violet-700 shadow-sm">
                        {formatHourMinutes(dragPreview.startMinutes)} - {formatHourMinutes(dragPreview.endMinutes)}
                      </div>
                    </div>
                  )}
                  {taskDropPreview && (
                    <div
                      className="pointer-events-none absolute left-[8px] right-[8px] z-20 rounded-[18px] border-2 border-dashed border-emerald-400/70 bg-emerald-100/30"
                      style={{
                        top: ((taskDropPreview.startMinutes - timelineHours[0] * 60) / 60) * dayHourHeight,
                        height: Math.max(28, ((taskDropPreview.endMinutes - taskDropPreview.startMinutes) / 60) * dayHourHeight)
                      }}
                    >
                      <div className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-medium text-emerald-700 shadow-sm">
                        {formatHourMinutes(taskDropPreview.startMinutes)} - {formatHourMinutes(taskDropPreview.endMinutes)}
                      </div>
                    </div>
                  )}
                  {layoutOverlappingEvents(selectedDaySessions.filter((item) => !item.meeting.isAllDay)).map((session) => {
                    const startHour = parseTimeValue(session.meeting.start);
                    const endHour = parseTimeValue(session.meeting.end);
                    const top = Math.max(0, (startHour - timelineHours[0]) * dayHourHeight);
                    const height = Math.max(28, (endHour - startHour) * dayHourHeight);
                    const overlapStepPct = session.totalColumns > 1 ? Math.min(10, 100 / (session.totalColumns * 2)) : 0;
                    const overlapWidthPct = session.totalColumns > 1 ? 100 - overlapStepPct * (session.totalColumns - 1) : 100;
                    const isFreshlyAddedCourse = newlyAddedCourseId === session.course.id;
                    return (
                      <button
                        type="button"
                        key={session.instanceKey}
                        data-calendar-interactive="true"
                        draggable
                        onMouseDown={(event) => {
                          // Prevent empty-grid drag-create handlers from firing when interacting with an existing session.
                          event.stopPropagation();
                        }}
                        onDragStart={(event) => {
                          const durationMinutes = Math.max(30, Math.round((parseTimeValue(session.meeting.end) - parseTimeValue(session.meeting.start)) * 60));
                          const rect = event.currentTarget.getBoundingClientRect();
                          const grabOffsetRatio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
                          setDraggingSession({
                            courseId: session.course.id,
                            meetingId: session.meeting.id!,
                            durationMinutes,
                            grabOffsetRatio: Math.max(0, Math.min(1, grabOffsetRatio)),
                            sourceDate: session.date
                          });
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", session.meeting.id!);
                        }}
                        onDragEnd={() => {
                          setDraggingSession(null);
                          setDragPreview(null);
                        }}
                        onClick={() => onSessionClick(session.course.id, session.meeting.id!, session.date)}
                        onDoubleClick={(event) => {
                          onSessionDoubleClick?.(session.course.id, session.meeting.id!, session.date);
                          openQuickEditorForSession(
                            session.course,
                            session.meeting,
                            session.date,
                            event.currentTarget.getBoundingClientRect()
                          );
                        }}
                        dir="auto"
                        className="absolute rounded-[22px] border px-4 py-3 text-start shadow-[0_10px_28px_rgba(15,23,42,0.08)]"
                        style={{
                          ...softCourseStyle(session.course.color),
                          top,
                          height,
                          borderColor:
                            selectedSession?.courseId === session.course.id &&
                            selectedSession?.meetingId === session.meeting.id &&
                            sameCalendarDate(selectedSession.anchorDate, session.date)
                              ? "rgba(250,204,21,0.72)"
                              : `${session.course.color}50`,
                          left: `calc(${session.column * overlapStepPct}% + 8px)`,
                          width: `calc(${overlapWidthPct}% - 16px)`,
                          zIndex: 10 + session.column,
                          boxShadow:
                            selectedSession?.courseId === session.course.id &&
                            selectedSession?.meetingId === session.meeting.id &&
                            sameCalendarDate(selectedSession.anchorDate, session.date)
                              ? "0 0 0 1px rgba(250,204,21,0.55), 0 0 14px rgba(250,204,21,0.20), 0 10px 28px rgba(15,23,42,0.08)"
                              : isFreshlyAddedCourse
                                ? "0 0 0 1px rgba(34,197,94,0.45), 0 0 18px rgba(16,185,129,0.26), 0 10px 28px rgba(15,23,42,0.08)"
                                : undefined
                        }}
                      >
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{session.course.name}</p>
                        <p className="text-xs text-slate-700 dark:text-white/95">{session.meeting.title || formatSessionType(session.meeting.type)}</p>
                        <p className="text-xs text-slate-700 dark:text-white/90">{session.meeting.start} - {session.meeting.end}</p>
                        {session.meeting.location && <p className="text-xs text-slate-700 dark:text-white/90">{session.meeting.location}</p>}
                      </button>
                    );
                  })}
                  {selectedDayWorkBlocks.map((block) => {
                    const blockStartMinutes = minutesFromIso(block.startAt);
                    const blockEndMinutes = minutesFromIso(block.endAt);
                    const resizePreview = workBlockResizePreview && workBlockResizePreview.id === block.id ? workBlockResizePreview : null;
                    const preview = workBlockDragPreview && workBlockDragPreview.id === block.id ? workBlockDragPreview : null;
                    const startMinutes = resizePreview ? resizePreview.startMinutes : preview ? preview.startMinutes : blockStartMinutes;
                    const endMinutes = resizePreview ? resizePreview.endMinutes : preview ? preview.endMinutes : blockEndMinutes;
                    const top = Math.max(0, ((startMinutes - timelineHours[0] * 60) / 60) * dayHourHeight);
                    const height = Math.max(28, ((endMinutes - startMinutes) / 60) * dayHourHeight);
                    const isCompactBlock = height < 68;
                    const course = courseMap[block.courseId as string];
                    const linkedTask = tasks.find((task) => task.id === block.taskId);
                    const color = block.colorSnapshot ?? course?.color ?? "#10b981";
                    return (
                      <button
                        key={block.id}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const minAllowedMinutes = getMinimumAllowedMinutesForDate(selectedDate);
                          if (minAllowedMinutes >= (timelineHours[timelineHours.length - 1] + 1) * 60) return;
                          setDraggingWorkBlock({ id: block.id, durationMinutes: endMinutes - startMinutes });
                          setWorkBlockDragPreview({
                            id: block.id,
                            startMinutes,
                            endMinutes,
                            dateKey: formatDateKey(selectedDate)
                          });
                        }}
                        onDoubleClick={() => setActiveWorkBlockId(block.id)}
                        className={`absolute overflow-hidden rounded-[22px] border text-start shadow-[0_10px_28px_rgba(15,23,42,0.08)] ${
                          isCompactBlock ? "px-3 py-1.5" : "px-4 py-3"
                        }`}
                        style={{
                          ...softCourseStyle(color),
                          top,
                          height,
                          borderColor: `${color}55`,
                          left: "10px",
                          width: "calc(100% - 20px)"
                        }}
                      >
                        <p className={`font-semibold text-slate-900 dark:text-white ${isCompactBlock ? "truncate text-xs leading-4" : "text-sm"}`}>
                          {linkedTask?.title ?? block.titleSnapshot ?? "Work block"}
                        </p>
                        <p className={`text-slate-700 dark:text-white/90 ${isCompactBlock ? "truncate text-[11px] leading-4" : "text-xs"}`}>
                          {new Date(block.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - {new Date(block.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <span
                          className={`absolute left-3 right-3 top-0.5 h-1.5 cursor-ns-resize rounded-full bg-white/20 opacity-0 transition-opacity hover:opacity-100 ${isCompactBlock ? "h-1" : ""}`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const minAllowedMinutes = getMinimumAllowedMinutesForDate(selectedDate);
                            if (minAllowedMinutes >= (timelineHours[timelineHours.length - 1] + 1) * 60) return;
                            setResizingWorkBlock({
                              id: block.id,
                              edge: "start",
                              startMinutes,
                              endMinutes,
                              dateKey: formatDateKey(selectedDate)
                            });
                            setWorkBlockResizePreview({
                              id: block.id,
                              startMinutes: Math.max(startMinutes, minAllowedMinutes),
                              endMinutes,
                              dateKey: formatDateKey(selectedDate)
                            });
                          }}
                        />
                        <span
                          className={`absolute left-3 right-3 bottom-0.5 h-1.5 cursor-ns-resize rounded-full bg-white/20 opacity-0 transition-opacity hover:opacity-100 ${isCompactBlock ? "h-1" : ""}`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            const minAllowedMinutes = getMinimumAllowedMinutesForDate(selectedDate);
                            if (minAllowedMinutes >= (timelineHours[timelineHours.length - 1] + 1) * 60) return;
                            setResizingWorkBlock({
                              id: block.id,
                              edge: "end",
                              startMinutes,
                              endMinutes,
                              dateKey: formatDateKey(selectedDate)
                            });
                            setWorkBlockResizePreview({
                              id: block.id,
                              startMinutes,
                              endMinutes,
                              dateKey: formatDateKey(selectedDate)
                            });
                          }}
                        />
                      </button>
                    );
                  })}
                  {sameCalendarDate(selectedDate, today) && currentTimeTopDay !== null && (
                    <div className="pointer-events-none absolute left-0 right-0 z-10" style={{ top: currentTimeTopDay }}>
                      <div className="h-px bg-rose-400/70" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Panel className="min-h-0 bg-white/90 dark:bg-[#101317]/90">
            <div className="mb-2 flex items-center justify-between px-4 pt-2.5">
              <div>
                <h3 className="text-base font-semibold">Tasks</h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Drag into the schedule to time-block.</p>
              </div>
            </div>
            <div className="calendar-scroll-area min-h-0 max-h-[84vh] overflow-auto px-2 pb-3">
              {courses
                .filter((course) => !course.archived)
                .map((course) => {
                  const courseTasks = tasksByCourseId.get(course.id) ?? [];
                  if (courseTasks.length === 0) return null;
                  return (
                    <div key={course.id} className="mb-3 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-white/10">
                      <div className="flex items-center justify-between bg-slate-50/70 px-3 py-2 dark:bg-white/[0.03]">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: course.color }} />
                          <p className="text-sm font-semibold">{course.code}</p>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{courseTasks.length}</p>
                      </div>
                      <div className="divide-y divide-slate-200/70 dark:divide-white/10">
                        {courseTasks.map((task) => (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={(event) => {
                              setDraggingTaskId(task.id);
                              event.dataTransfer.effectAllowed = "copy";
                              event.dataTransfer.setData("application/x-task-id", task.id);
                            }}
                            onDragEnd={() => {
                              setDraggingTaskId(null);
                              setTaskDropPreview(null);
                            }}
                            className="group flex cursor-grab items-center justify-between gap-3 px-3 py-2.5 active:cursor-grabbing"
                          >
                            <button type="button" onClick={() => onOpenTask(task.id)} className="min-w-0 flex-1 text-start">
                              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{task.title}</p>
                              <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                                {task.status} · {(() => {
                                  const bookedBlock = bookedBlockByTaskId.get(task.id);
                                  return bookedBlock
                                    ? `Booked ${new Date(bookedBlock.startAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${new Date(bookedBlock.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                                    : "Still not booked";
                                })()}
                              </p>
                            </button>
                            {futureScheduledTaskIds.has(task.id) && (
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.8)]" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          </Panel>

          {activeWorkBlockId && (() => {
            const block = workBlocks.find((b) => b.id === activeWorkBlockId);
            const task = block ? tasks.find((t) => t.id === block.taskId) : undefined;
            if (!block) return null;
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                <Panel className="w-full max-w-md bg-white/95 p-5 dark:bg-[#101317]/95">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold">Work block</h3>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{block.titleSnapshot ?? task?.title ?? "Task"}</p>
                    </div>
                    <Button variant="ghost" onClick={() => setActiveWorkBlockId(null)} className="h-10 w-10 p-0">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mb-4 text-sm text-slate-600 dark:text-slate-300">
                    {new Date(block.startAt).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })} –{" "}
                    {new Date(block.endAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="grid gap-2">
                    <Button
                      onClick={() => {
                        onUpdateWorkBlock({ id: block.id, status: "completed" });
                        setActiveWorkBlockId(null);
                      }}
                    >
                      Mark block complete
                    </Button>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          const start = new Date(block.startAt);
                          const end = new Date(block.endAt);
                          start.setMinutes(start.getMinutes() + 30);
                          end.setMinutes(end.getMinutes() + 30);
                          onUpdateWorkBlock({ id: block.id, startAt: start.toISOString(), endAt: end.toISOString() });
                          setActiveWorkBlockId(null);
                        }}
                      >
                        +30m
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const start = new Date(block.startAt);
                          const end = new Date(block.endAt);
                          start.setMinutes(start.getMinutes() + 60);
                          end.setMinutes(end.getMinutes() + 60);
                          onUpdateWorkBlock({ id: block.id, startAt: start.toISOString(), endAt: end.toISOString() });
                          setActiveWorkBlockId(null);
                        }}
                      >
                        +60m
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const start = new Date(block.startAt);
                          const end = new Date(block.endAt);
                          start.setDate(start.getDate() + 1);
                          end.setDate(end.getDate() + 1);
                          onUpdateWorkBlock({ id: block.id, startAt: start.toISOString(), endAt: end.toISOString() });
                          setActiveWorkBlockId(null);
                        }}
                      >
                        Tomorrow
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        onOpenTask(block.taskId);
                        setActiveWorkBlockId(null);
                      }}
                    >
                      Open task
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        onDeleteWorkBlock(block.id);
                        setActiveWorkBlockId(null);
                      }}
                      className="border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/10"
                    >
                      Delete block
                    </Button>
                  </div>
                </Panel>
              </div>
            );
          })()}
        </div>
      )}
      </div>
      {quickCreateDraft && quickCreateAnchor && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[45]">
          <button type="button" className="absolute inset-0" onClick={() => { setQuickCreateDraft(null); setQuickCreateAnchor(null); }} aria-label="Close quick session creator" />
          <Panel
            id="quick-create-popover"
            className="absolute w-[300px] max-w-[calc(100vw-1.5rem)] overflow-y-auto animate-fadeSlide bg-white/95 p-2.5 shadow-[0_14px_32px_rgba(15,23,42,0.24)] dark:bg-[#11151d]/95"
            style={{ left: `${quickCreateAnchor.left}px`, top: `${quickCreateAnchor.top}px`, maxHeight: "calc(100vh - 24px)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <input value={quickCreateDraft.title} onChange={(event) => setQuickCreateDraft((curr) => curr ? { ...curr, title: event.target.value } : curr)} placeholder={quickCreateDraft.mode === "edit" ? "Session title" : "New Event"} className="w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-base font-semibold outline-none placeholder:text-slate-400" />
            <input value={quickCreateDraft.location} onChange={(event) => setQuickCreateDraft((curr) => curr ? { ...curr, location: event.target.value } : curr)} placeholder="Add Location or Video Call" className="mt-0.5 w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-xs outline-none placeholder:text-slate-400" />
            <button
              type="button"
              onClick={() => setQuickCreateDraft((curr) => curr ? { ...curr, detailsOpen: !curr.detailsOpen } : curr)}
              className="mt-1.5 w-full rounded-lg border border-slate-200/80 bg-slate-50/70 px-2 py-1.5 text-left text-xs transition hover:bg-slate-100/80 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.06]"
            >
              {quickCreateDraft.date.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" })}{" "}
              {quickCreateDraft.isAllDay ? "All-day" : `${quickCreateDraft.start} to ${quickCreateDraft.end}`}
            </button>
            <div className={`grid overflow-hidden transition-all duration-200 ease-out ${quickCreateDraft.detailsOpen ? "mt-2 max-h-80 opacity-100" : "max-h-0 opacity-0"}`}>
              <div className="grid gap-2 rounded-lg border border-slate-200/80 bg-slate-50/60 p-2 dark:border-white/10 dark:bg-white/[0.03]">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={quickCreateDraft.isAllDay}
                    onChange={(event) => setQuickCreateDraft((curr) => (curr ? { ...curr, isAllDay: event.target.checked } : curr))}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  all-day
                </label>
                <select
                  value={quickCreateDraft.courseId}
                  disabled={quickCreateDraft.mode === "edit"}
                  onChange={(event) => setQuickCreateDraft((curr) => curr ? { ...curr, courseId: event.target.value } : curr)}
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.05]"
                >
                  {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                </select>
                <select
                  value={quickCreateDraft.sessionType}
                  onChange={(event) => setQuickCreateDraft((curr) => curr ? { ...curr, sessionType: event.target.value as QuickSessionType } : curr)}
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-white/10 dark:bg-white/[0.05]"
                >
                  <option value="lecture">Lecture</option>
                  <option value="tutorial">Tirgul</option>
                </select>
                {!quickCreateDraft.isAllDay && (
                  <div className="grid grid-cols-2 gap-2">
                    <input type="time" value={quickCreateDraft.start} onChange={(event) => setQuickCreateDraft((curr) => curr ? { ...curr, start: event.target.value } : curr)} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-white/10 dark:bg-white/[0.05]" />
                    <input type="time" value={quickCreateDraft.end} onChange={(event) => setQuickCreateDraft((curr) => curr ? { ...curr, end: event.target.value } : curr)} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-white/10 dark:bg-white/[0.05]" />
                  </div>
                )}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <input
                    type="date"
                    value={formatDateKey(quickCreateDraft.date)}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (!next) return;
                      setQuickCreateDraft((curr) => (curr ? { ...curr, date: new Date(`${next}T12:00:00`) } : curr));
                    }}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-white/10 dark:bg-white/[0.05]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    onClick={() =>
                      setQuickCreateDraft((curr) => {
                        if (!curr) return curr;
                        const next = new Date(curr.date);
                        next.setDate(next.getDate() + 7);
                        return { ...curr, date: next };
                      })
                    }
                  >
                    +1 week
                  </Button>
                </div>
                <select value={quickCreateDraft.cadence} onChange={(event) => setQuickCreateDraft((curr) => curr ? { ...curr, cadence: event.target.value as SessionCadence } : curr)} className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none dark:border-white/10 dark:bg-white/[0.05]">
                  <option value="none">Does not repeat</option>
                  <option value="weekly">Repeats weekly</option>
                </select>
                {quickCreateDraft.cadence === "weekly" && (
                  <div className="flex flex-wrap gap-1">
                    {weekDays.map((day) => {
                      const active = quickCreateDraft.repeatDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setQuickCreateDraft((curr) => {
                            if (!curr) return curr;
                            const next = active ? curr.repeatDays.filter((d) => d !== day) : [...curr.repeatDays, day];
                            return { ...curr, repeatDays: next.length > 0 ? next : [day] };
                          })}
                          className={`rounded-full px-2 py-1 text-[11px] ${active ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-slate-200/70 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300"}`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => { setQuickCreateDraft(null); setQuickCreateAnchor(null); }}>Cancel</Button>
              <Button
                onClick={() => {
                  const course = courses.find((c) => c.id === quickCreateDraft.courseId);
                  if (!course) return;
                  if (quickCreateDraft.mode === "edit" && quickCreateDraft.meetingId) {
                    onUpdateCourse({
                      id: course.id,
                      meetings: course.meetings.map((meeting) =>
                        meeting.id === quickCreateDraft.meetingId
                          ? {
                              ...meeting,
                              day: getWeekDayFromDate(quickCreateDraft.date),
                              start: quickCreateDraft.isAllDay ? "00:00" : quickCreateDraft.start,
                              end: quickCreateDraft.isAllDay ? "23:59" : quickCreateDraft.end,
                              anchorDate: new Date(`${formatDateKey(quickCreateDraft.date)}T12:00:00`).toISOString(),
                              title: quickCreateDraft.title.trim() || undefined,
                              location: quickCreateDraft.location.trim() || undefined,
                              type: quickCreateDraft.sessionType,
                              isAllDay: quickCreateDraft.isAllDay,
                              recurrence:
                                quickCreateDraft.cadence === "weekly"
                                  ? {
                                      ...(meeting.recurrence ?? {}),
                                      cadence: "weekly",
                                      interval: meeting.recurrence?.interval ?? 1,
                                      daysOfWeek: quickCreateDraft.repeatDays
                                    }
                                  : { cadence: "none", interval: 1 }
                            }
                          : meeting
                      )
                    });
                  } else {
                    const meeting = buildCourseMeeting({
                      day: getWeekDayFromDate(quickCreateDraft.date),
                      start: quickCreateDraft.start,
                      end: quickCreateDraft.end,
                      anchorDate: formatDateKey(quickCreateDraft.date),
                      title: quickCreateDraft.title,
                      location: quickCreateDraft.location,
                      notes: "",
                      type: quickCreateDraft.sessionType,
                      isAllDay: quickCreateDraft.isAllDay,
                      cadence: quickCreateDraft.cadence,
                      interval: 1,
                      repeatDays: quickCreateDraft.repeatDays,
                      until: "",
                      count: ""
                    });
                    onUpdateCourse({ id: course.id, meetings: [...course.meetings, meeting] });
                  }
                  setQuickCreateDraft(null);
                  setQuickCreateAnchor(null);
                }}
              >
                {quickCreateDraft.mode === "edit" ? "Save" : "Add session"}
              </Button>
            </div>
          </Panel>
        </div>,
        document.body
      )}
      {recurrenceMovePrompt && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 px-4">
          <Panel className="w-full max-w-md bg-white/95 p-5 dark:bg-[#101317]/95">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Recurring class change</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Apply this move to only this class instance or to the series from now on.
                </p>
              </div>
              <Button variant="ghost" onClick={() => setRecurrenceMovePrompt(null)} className="h-10 w-10 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  moveMeetingSingleOccurrenceAtMinutes(
                    recurrenceMovePrompt.courseId,
                    recurrenceMovePrompt.meetingId,
                    recurrenceMovePrompt.sourceDate,
                    recurrenceMovePrompt.targetDate,
                    recurrenceMovePrompt.startMinutes
                  );
                  setRecurrenceMovePrompt(null);
                }}
              >
                Only this session
              </Button>
              <Button
                onClick={() => {
                  moveMeetingAtMinutes(
                    recurrenceMovePrompt.courseId,
                    recurrenceMovePrompt.meetingId,
                    recurrenceMovePrompt.targetDate,
                    recurrenceMovePrompt.startMinutes
                  );
                  setRecurrenceMovePrompt(null);
                }}
              >
                This and future sessions
              </Button>
            </div>
          </Panel>
        </div>
      )}
    </Panel>
  );
}

const TASK_COMPOSER_MAX_FILES = 12;
const TASK_DETAIL_MAX_ATTACHMENTS = 24;

function TaskComposer({
  courses,
  initialCourseId,
  onClose,
  onSave
}: {
  courses: Course[];
  initialCourseId?: string | "general";
  onClose: () => void;
  onSave: (input: {
    id?: string;
    title: string;
    description?: string;
    courseId?: string | "general";
    dueAt?: string;
    priority?: TaskPriority;
    attachments?: TaskAttachment[];
  }) => void | Promise<void>;
}) {
  const { user: composerUser } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [courseId, setCourseId] = useState<string | "general" | "">(initialCourseId ?? "");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueAt, setDueAt] = useState("");
  const [isCommandHeld, setIsCommandHeld] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [fileHint, setFileHint] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCourseId(initialCourseId ?? "");
  }, [initialCourseId]);

  const removePending = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const onPickFiles = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setFileHint(null);
      const list = event.target.files;
      if (!list?.length) return;
      const next: File[] = [...pendingFiles];
      for (const file of Array.from(list)) {
        if (file.size > TASK_ATTACHMENT_MAX_BYTES) {
          setFileHint(`Skipped "${file.name}" — larger than ${Math.round(TASK_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB.`);
          continue;
        }
        if (next.length >= TASK_COMPOSER_MAX_FILES) {
          setFileHint(`At most ${TASK_COMPOSER_MAX_FILES} files.`);
          break;
        }
        next.push(file);
      }
      setPendingFiles(next);
      event.target.value = "";
    },
    [pendingFiles]
  );

  const handleCreateTask = useCallback(async () => {
    if (!title.trim() || !courseId || saving) {
      return;
    }
    setSaving(true);
    setFileHint(null);
    const taskId = createId("task");
    try {
      const attachments: TaskAttachment[] = [];
      for (const file of pendingFiles) {
        const attId = createId("tatt");
        const meta = createTaskAttachmentMeta(file, attId);
        await saveTaskAttachmentBlob(composerUser?.id, taskId, attId, file);
        attachments.push(meta);
      }
      await Promise.resolve(
        onSave({
          id: taskId,
          title,
          description,
          courseId: courseId as string | "general",
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          priority,
          attachments: attachments.length ? attachments : undefined
        })
      );
      onClose();
    } catch (e) {
      void deleteTaskAttachmentBlobsForTask(composerUser?.id, taskId).catch(() => {});
      setFileHint(e instanceof Error ? e.message : "Could not save attachments.");
    } finally {
      setSaving(false);
    }
  }, [courseId, description, dueAt, onClose, onSave, pendingFiles, priority, saving, title]);

  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey) {
        setIsCommandHeld(true);
      }
      if (event.key !== "Enter") return;
      if (!(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      void handleCreateTask();
    }
    function onWindowKeyUp(event: KeyboardEvent) {
      if (!event.metaKey && !event.ctrlKey) {
        setIsCommandHeld(false);
      }
    }
    function onWindowBlur() {
      setIsCommandHeld(false);
    }
    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("keyup", onWindowKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("keyup", onWindowKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [handleCreateTask]);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/65 p-3 backdrop-blur-sm">
      <Panel
        className="w-full max-w-2xl bg-white/95 dark:bg-slate-950/95"
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          if (!(event.metaKey || event.ctrlKey)) return;
          event.preventDefault();
          void handleCreateTask();
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">New Assignment</h3>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <select
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
          >
            <option value="" disabled>
              Select course
            </option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.code} {course.name}
              </option>
            ))}
            <option value="general">General</option>
          </select>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={courseId ? "Assignment title" : "Select course first"}
            disabled={!courseId}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/5"
          />
          <input
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            type="datetime-local"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
          />
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as TaskPriority)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <div className="md:col-span-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={TASK_ATTACHMENT_ACCEPT}
                className="hidden"
                onChange={onPickFiles}
              />
              <Button
                type="button"
                variant="outline"
                className="inline-flex items-center gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={!courseId || saving}
              >
                <Paperclip className="h-4 w-4" aria-hidden />
                Attach files
              </Button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                PDF, Office, images, zip — stored in this browser (IndexedDB).
              </span>
            </div>
            {pendingFiles.length > 0 ? (
              <ul className="space-y-1 rounded-lg border border-slate-200/90 bg-slate-50/80 p-2 text-xs dark:border-white/10 dark:bg-white/[0.04]">
                {pendingFiles.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{file.name}</span>
                    <button
                      type="button"
                      className="shrink-0 rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
                      onClick={() => removePending(index)}
                      aria-label={`Remove ${file.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {fileHint ? <p className="text-xs text-amber-700 dark:text-amber-300">{fileHint}</p> : null}
          </div>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description"
            className="md:col-span-2 min-h-[100px] rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
          />
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleCreateTask()}
            disabled={!courseId || !title.trim() || saving}
            className={isCommandHeld ? "cmd-save-active" : ""}
          >
            {saving ? "Saving…" : "Save Task"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function TaskDetailModal({
  task,
  courses,
  workBlocks,
  onClose,
  onSave
}: {
  task: Task;
  courses: Course[];
  workBlocks: WorkBlock[];
  onClose: () => void;
  onSave: (task: Partial<Task> & { id: string }) => void;
}) {
  const { user: detailUser } = useAuth();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [courseId, setCourseId] = useState<string | "general">(task.courseId);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueAt, setDueAt] = useState(toLocalDateInput(task.dueAt));
  const [attachments, setAttachments] = useState<TaskAttachment[]>(task.attachments ?? []);
  const [pendingFilesById, setPendingFilesById] = useState<Record<string, File>>({});
  const [attachErr, setAttachErr] = useState<string | null>(null);
  const [blobReady, setBlobReady] = useState<Record<string, boolean>>({});
  const [detailSaving, setDetailSaving] = useState(false);
  const [isCommandHeld, setIsCommandHeld] = useState(false);
  const taskFileInputRef = useRef<HTMLInputElement>(null);

  const attachmentLocalSig = useMemo(() => {
    const attPart = attachments.map((a) => `${a.id}:${a.size}`).join("|");
    const pendPart = Object.keys(pendingFilesById)
      .sort()
      .map((id) => `${id}:${pendingFilesById[id]?.size ?? 0}`)
      .join(",");
    return `${attPart}|${pendPart}`;
  }, [attachments, pendingFilesById]);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setCourseId(task.courseId);
    setStatus(task.status);
    setPriority(task.priority);
    setDueAt(toLocalDateInput(task.dueAt));
    setAttachments(task.attachments ?? []);
    setPendingFilesById({});
    setAttachErr(null);
  }, [task]);

  useEffect(() => {
    let cancelled = false;
    const list = attachments;
    void (async () => {
      await new Promise<void>((r) => queueMicrotask(() => r()));
      const next: Record<string, boolean> = {};
      for (const a of list) {
        if (pendingFilesById[a.id]) {
          next[a.id] = true;
          continue;
        }
        const b = await getTaskAttachmentBlob(detailUser?.id, task.id, a.id);
        next[a.id] = !!(b && b.size > 0);
      }
      if (!cancelled) setBlobReady(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [task.id, attachmentLocalSig, pendingFilesById]);

  const detectedLinks = useMemo(() => {
    const matches = description.match(/https?:\/\/[^\s]+/g) ?? [];
    return Array.from(new Set(matches));
  }, [description]);

  const nextBookedBlock = useMemo(() => getNextScheduledBlock(task.id, workBlocks), [task.id, workBlocks]);
  const bookingStatusLabel = nextBookedBlock
    ? `Booked ${new Date(nextBookedBlock.startAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${new Date(nextBookedBlock.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "Still not booked";

  const handleTaskAttachFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const list = Array.from(input.files ?? []);
    input.value = "";
    if (!list.length) return;
    setAttachErr(null);
    for (const file of list) {
      if (file.size > TASK_ATTACHMENT_MAX_BYTES) {
        setAttachErr(
          `"${file.name}" is too large (${formatFileBytes(file.size)}). Max is ${formatFileBytes(TASK_ATTACHMENT_MAX_BYTES)}.`
        );
        return;
      }
    }
    if (attachments.length + list.length > TASK_DETAIL_MAX_ATTACHMENTS) {
      setAttachErr(`At most ${TASK_DETAIL_MAX_ATTACHMENTS} files per task.`);
      return;
    }
    const additions: TaskAttachment[] = [];
    const filesById: Record<string, File> = {};
    for (const file of list) {
      const attId = createId("tatt");
      additions.push(createTaskAttachmentMeta(file, attId));
      filesById[attId] = file;
    }
    setAttachments((prev) => [...prev, ...additions]);
    setPendingFilesById((prev) => ({ ...prev, ...filesById }));
  };

  const removeTaskAttachment = (att: TaskAttachment) => {
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    setPendingFilesById((prev) => {
      if (!prev[att.id]) return prev;
      const next = { ...prev };
      delete next[att.id];
      return next;
    });
    setBlobReady((prev) => {
      const next = { ...prev };
      delete next[att.id];
      return next;
    });
  };

  const openTaskAttachment = async (att: TaskAttachment) => {
    const pending = pendingFilesById[att.id];
    if (pending) {
      const url = URL.createObjectURL(pending);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      return;
    }
    const blob = await getTaskAttachmentBlob(detailUser?.id, task.id, att.id);
    if (!blob?.size) return;
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  };

  async function handleSave() {
    if (detailSaving) return;
    const normalizedDueAt = dueAt
      ? (() => {
          const [year, month, day] = dueAt.split("-").map(Number);
          const date = new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
          return date.toISOString();
        })()
      : undefined;
    setDetailSaving(true);
    setAttachErr(null);
    try {
      for (const a of attachments) {
        const file = pendingFilesById[a.id];
        if (!file) continue;
        await saveTaskAttachmentBlob(detailUser?.id, task.id, a.id, file);
        const verify = await getTaskAttachmentBlob(detailUser?.id, task.id, a.id);
        if (!verify || verify.size < 1) {
          throw new Error("Upload failed or storage is unavailable. Please try again.");
        }
      }
      const prev = task.attachments ?? [];
      for (const p of prev) {
        if (!attachments.some((x) => x.id === p.id)) {
          await deleteTaskAttachmentBlob(detailUser?.id, task.id, p.id);
        }
      }
      onSave({
        id: task.id,
        title: title.trim() || task.title,
        description,
        courseId,
        status,
        priority,
        effort: task.effort,
        dueAt: normalizedDueAt,
        attachments
      });
      setPendingFilesById({});
      onClose();
    } catch (e) {
      setAttachErr(e instanceof Error ? e.message : "Could not update attachments.");
    } finally {
      setDetailSaving(false);
    }
  }

  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey) {
        setIsCommandHeld(true);
      }
      if (event.key !== "Enter") return;
      if (!(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      void handleSave();
    }
    function onWindowKeyUp(event: KeyboardEvent) {
      if (!event.metaKey && !event.ctrlKey) {
        setIsCommandHeld(false);
      }
    }
    function onWindowBlur() {
      setIsCommandHeld(false);
    }
    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("keyup", onWindowKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("keyup", onWindowKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [title, description, courseId, status, priority, dueAt, task, attachments, pendingFilesById, detailSaving]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!detailSaving) onClose();
      }}
    >
      <Panel
        className="w-full max-w-2xl bg-white/96 dark:bg-[#101317]/96"
        onClick={(event) => event.stopPropagation()}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            if (!(event.metaKey || event.ctrlKey)) return;
            event.preventDefault();
            void handleSave();
          }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold tracking-tight">Task details</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Review and edit this task.</p>
            </div>
            <Button variant="ghost" onClick={onClose} disabled={detailSaving} className="h-10 w-10 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
            <div className="space-y-1.5">
              <input value={dueAt} onChange={(event) => setDueAt(event.target.value)} type="date" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
              <p className="px-1 text-xs text-slate-500 dark:text-slate-400">{bookingStatusLabel}</p>
            </div>
            <select value={courseId} onChange={(event) => setCourseId(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]">
              <option value="general">General</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.code} {course.name}</option>)}
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]">
              <option value="backlog">Backlog</option>
              <option value="next">Next</option>
              <option value="in-progress">In progress</option>
              <option value="done">Done</option>
            </select>
            <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-[120px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none md:col-span-2 dark:border-white/10 dark:bg-white/[0.04]" />
            {detectedLinks.length > 0 && (
              <div className="md:col-span-2 rounded-2xl border border-slate-200/80 bg-slate-50/60 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Detected links</p>
                <div className="space-y-1">
                  {detectedLinks.map((link) => (
                    <a
                      key={link}
                      href={link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="block truncate text-sm text-sky-600 underline underline-offset-2 hover:text-sky-500 dark:text-sky-300 dark:hover:text-sky-200"
                    >
                      {link}
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div className="md:col-span-2 space-y-2 rounded-2xl border border-slate-200/80 bg-slate-50/60 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Files ({attachments.length}/{TASK_DETAIL_MAX_ATTACHMENTS})
                </p>
                <div className="flex items-center gap-2">
                  <input
                    ref={taskFileInputRef}
                    type="file"
                    multiple
                    accept={TASK_ATTACHMENT_ACCEPT}
                    className="hidden"
                    disabled={detailSaving}
                    onChange={handleTaskAttachFiles}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                    disabled={detailSaving || attachments.length >= TASK_DETAIL_MAX_ATTACHMENTS}
                    onClick={() => taskFileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden />
                    Add files
                  </Button>
                </div>
              </div>
              <p className="text-[10px] leading-snug text-slate-400 dark:text-slate-500">
                Stored in this browser (IndexedDB). New files and removals apply when you save. Click a file to preview.
              </p>
              {attachErr ? <p className="text-xs text-rose-600 dark:text-rose-400">{attachErr}</p> : null}
              {attachments.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No files yet. Use Add files for PDFs or docs from your course site.</p>
              ) : (
                <ul className="space-y-1.5">
                  {attachments.map((att) => {
                    const probe = blobReady[att.id];
                    const definitelyMissing = probe === false;
                    return (
                      <li
                        key={att.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-xs dark:border-white/10 dark:bg-[#15181d]/90"
                      >
                        <button
                          type="button"
                          disabled={definitelyMissing}
                          onClick={() => void openTaskAttachment(att)}
                          className={`min-w-0 flex-1 truncate text-left ${definitelyMissing ? "cursor-not-allowed text-slate-400" : "text-sky-600 underline-offset-2 hover:underline dark:text-sky-300"}`}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {att.name}
                          </span>
                          <span className="ml-2 text-[10px] text-slate-400">{formatFileBytes(att.size)}</span>
                          {definitelyMissing ? (
                            <span className="ml-2 text-[10px] text-amber-600 dark:text-amber-400">(missing)</span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className="shrink-0 rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
                          aria-label={`Remove ${att.name}`}
                          onClick={() => void removeTaskAttachment(att)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={detailSaving}>
              Close
            </Button>
            <Button type="submit" disabled={detailSaving} className={isCommandHeld ? "cmd-save-active" : ""}>
              {detailSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

function AddCourseModal({
  newCourseName,
  setNewCourseName,
  newCourseCode,
  setNewCourseCode,
  newCourseColor,
  setNewCourseColor,
  onClose,
  onCreate
}: {
  newCourseName: string;
  setNewCourseName: (value: string) => void;
  newCourseCode: string;
  setNewCourseCode: (value: string) => void;
  newCourseColor: string;
  setNewCourseColor: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <Panel className="w-full max-w-xl bg-white/96 dark:bg-[#101317]/96" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">Add course</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Create a course, then pick its color once.</p>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-10 w-10 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid gap-3">
          <input
            value={newCourseName}
            onChange={(event) => setNewCourseName(event.target.value)}
            placeholder="Course name"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]"
          />
          <input
            value={newCourseCode}
            onChange={(event) => setNewCourseCode(event.target.value)}
            placeholder="Short label (optional)"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]"
          />
          <div>
            <p className="mb-2 text-sm font-medium">Course color</p>
            <div className="flex flex-wrap gap-2 rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              {coursePalette.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewCourseColor(color)}
                  className={`h-8 w-8 rounded-full border-2 transition ${newCourseColor === color ? "scale-110 border-slate-900 dark:border-white" : "border-transparent"}`}
                  style={{ backgroundColor: color, boxShadow: `0 0 0 1px ${color}40, 0 10px 24px ${color}30` }}
                  aria-label={`Choose course color ${color}`}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onCreate}>Create course</Button>
        </div>
      </Panel>
    </div>
  );
}

function CourseEditorModal({
  editName,
  setEditName,
  editCode,
  setEditCode,
  editInstructor,
  setEditInstructor,
  editNotes,
  setEditNotes,
  editProgressMode,
  setEditProgressMode,
  editManualProgress,
  setEditManualProgress,
  editColor,
  setEditColor,
  onClose,
  onSave,
  onArchive,
  onDelete
}: {
  editName: string;
  setEditName: (value: string) => void;
  editCode: string;
  setEditCode: (value: string) => void;
  editInstructor: string;
  setEditInstructor: (value: string) => void;
  editNotes: string;
  setEditNotes: (value: string) => void;
  editProgressMode: "manual" | "computed";
  setEditProgressMode: (value: "manual" | "computed") => void;
  editManualProgress: number;
  setEditManualProgress: (value: number) => void;
  editColor: string;
  setEditColor: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <Panel className="w-full max-w-2xl bg-white/96 dark:bg-[#101317]/96" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">Edit course</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Update the course details and display style.</p>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-10 w-10 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="Course name" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
          <input value={editCode} onChange={(event) => setEditCode(event.target.value)} placeholder="Short label" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
          <input value={editInstructor} onChange={(event) => setEditInstructor(event.target.value)} placeholder="Instructor" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
          <div className="md:col-span-2">
            <p className="mb-2 text-sm font-medium">Course color</p>
            <div className="flex flex-wrap gap-2">
              {coursePalette.map((color, index) => (
                <button
                  key={`${color}-${index}`}
                  type="button"
                  onClick={() => setEditColor(color)}
                  className={`h-8 w-8 rounded-full border-2 transition ${editColor === color ? "scale-110 border-slate-900 dark:border-white" : "border-transparent"}`}
                  style={{ backgroundColor: color, boxShadow: `0 0 0 1px ${color}40, 0 10px 24px ${color}30` }}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Progress tracking</p>
            <select value={editProgressMode} onChange={(event) => setEditProgressMode(event.target.value as "manual" | "computed")} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]">
              <option value="manual">Manual percent</option>
              <option value="computed">From completed tasks</option>
            </select>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Progress percent</p>
            <input value={editManualProgress} type="number" min={0} max={100} onChange={(event) => setEditManualProgress(Number(event.target.value) || 0)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
          </div>
          <textarea value={editNotes} onChange={(event) => setEditNotes(event.target.value)} placeholder="Course notes" className="min-h-[120px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none md:col-span-2 dark:border-white/10 dark:bg-white/[0.04]" />
        </div>
        <div className="mt-4 flex justify-between">
          <div className="flex gap-2">
            <Button variant="outline" className="text-rose-500" onClick={onArchive}>Archive</Button>
            <Button variant="outline" className="text-rose-600" onClick={onDelete}>Delete</Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={onSave}>Save changes</Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function SessionEditorModal({
  courses,
  selectedCourseId,
  selectedDate,
  sessionDraft,
  onClose,
  onSave
}: {
  courses: Course[];
  selectedCourseId: string | "all";
  selectedDate: Date;
  sessionDraft?: { courseId?: string; meetingId?: string; anchorDate?: Date; start?: string; end?: string };
  onClose: () => void;
  onSave: (courseId: string, meetings: CourseMeeting[], replaceMode: "replace" | "append") => void;
}) {
  const editingCourse = sessionDraft?.courseId ? courses.find((course) => course.id === sessionDraft.courseId) : undefined;
  const editingMeeting = editingCourse?.meetings.find((meeting) => meeting.id === sessionDraft?.meetingId);
  const defaultDate = sessionDraft?.anchorDate ?? selectedDate;
  const initialCourseId =
    editingCourse?.id ??
    (selectedCourseId !== "all" && courses.some((course) => course.id === selectedCourseId) ? selectedCourseId : courses[0]?.id ?? "");
  const initialDay = getWeekDayFromDate(defaultDate);
  const [courseId, setCourseId] = useState(initialCourseId);
  const [title, setTitle] = useState(editingMeeting ? (editingMeeting.title?.trim() || editingCourse?.name || "") : "");
  const [start, setStart] = useState(editingMeeting?.start ?? sessionDraft?.start ?? "09:00");
  const [end, setEnd] = useState(editingMeeting?.end ?? sessionDraft?.end ?? "10:30");
  const [location, setLocation] = useState(editingMeeting?.location ?? "");
  const [notes, setNotes] = useState(editingMeeting?.notes ?? "");
  const [type, setType] = useState<CourseMeeting["type"]>(editingMeeting?.type ?? "lecture");
  const [isAllDay, setIsAllDay] = useState(editingMeeting?.isAllDay ?? false);
  const [anchorDate, setAnchorDate] = useState(formatDateKey(new Date(editingMeeting?.anchorDate ?? defaultDate)));
  const [cadence, setCadence] = useState<SessionCadence>(editingMeeting?.recurrence?.cadence ?? "weekly");
  const [interval, setInterval] = useState(editingMeeting?.recurrence?.interval ?? 1);
  const [repeatDays, setRepeatDays] = useState<WeekDay[]>(editingMeeting?.recurrence?.daysOfWeek ?? [editingMeeting?.day ?? initialDay]);
  const [until, setUntil] = useState(editingMeeting?.recurrence?.until?.slice(0, 10) ?? "");
  const [count, setCount] = useState(editingMeeting?.recurrence?.count ? String(editingMeeting.recurrence.count) : "");

  useEffect(() => {
    const nextMeeting = editingCourse?.meetings.find((meeting) => meeting.id === sessionDraft?.meetingId);
    const nextDate = sessionDraft?.anchorDate ?? selectedDate;
    setCourseId(editingCourse?.id ?? initialCourseId);
    setTitle(nextMeeting ? (nextMeeting.title?.trim() || editingCourse?.name || "") : "");
    setStart(nextMeeting?.start ?? sessionDraft?.start ?? "09:00");
    setEnd(nextMeeting?.end ?? sessionDraft?.end ?? "10:30");
    setLocation(nextMeeting?.location ?? "");
    setNotes(nextMeeting?.notes ?? "");
    setType(nextMeeting?.type ?? "lecture");
    setIsAllDay(nextMeeting?.isAllDay ?? false);
    setAnchorDate(formatDateKey(new Date(nextMeeting?.anchorDate ?? nextDate)));
    setCadence(nextMeeting?.recurrence?.cadence ?? "weekly");
    setInterval(nextMeeting?.recurrence?.interval ?? 1);
    setRepeatDays(nextMeeting?.recurrence?.daysOfWeek ?? [nextMeeting?.day ?? getWeekDayFromDate(nextDate)]);
    setUntil(nextMeeting?.recurrence?.until?.slice(0, 10) ?? "");
    setCount(nextMeeting?.recurrence?.count ? String(nextMeeting.recurrence.count) : "");
  }, [editingCourse, sessionDraft, selectedDate, initialCourseId]);

  const conflicts = useMemo(() => {
    if (isAllDay || !courseId) return [];
    const meeting = buildCourseMeeting({
      existing: editingMeeting,
      day: getWeekDayFromDate(new Date(`${anchorDate}T12:00:00`)),
      start,
      end,
      anchorDate,
      title,
      location,
      notes,
      type,
      isAllDay,
      cadence,
      interval,
      repeatDays,
      until,
      count
    });
    return detectMeetingConflicts(courses, courseId, meeting, editingMeeting?.id);
  }, [courses, courseId, editingMeeting, start, end, anchorDate, title, location, notes, type, isAllDay, cadence, interval, repeatDays, until, count]);

  function saveSession() {
    if (!courseId) return;
    const course = courses.find((item) => item.id === courseId);
    if (!course) return;
    const meeting = buildCourseMeeting({
      existing: editingMeeting,
      day: getWeekDayFromDate(new Date(`${anchorDate}T12:00:00`)),
      start,
      end,
      anchorDate,
      title,
      location,
      notes,
      type,
      isAllDay,
      cadence,
      interval,
      repeatDays,
      until,
      count
    });
    if (editingMeeting) {
      onSave(
        courseId,
        course.meetings.map((item) => (item.id === editingMeeting.id ? meeting : item)),
        "replace"
      );
    } else {
      onSave(courseId, [meeting], "append");
    }
  }

  function duplicateSession() {
    if (!courseId) return;
    const meeting = buildCourseMeeting({
      day: getWeekDayFromDate(new Date(`${anchorDate}T12:00:00`)),
      start,
      end,
      anchorDate,
      title,
      location,
      notes,
      type,
      isAllDay,
      cadence,
      interval,
      repeatDays,
      until,
      count,
      existing: undefined,
      id: createId("meeting"),
      seriesId: createId("series")
    });
    onSave(courseId, [meeting], "append");
  }

  function deleteSession() {
    if (!editingMeeting || !courseId) return;
    const course = courses.find((item) => item.id === courseId);
    if (!course) return;
    onSave(courseId, course.meetings.filter((item) => item.id !== editingMeeting.id), "replace");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <Panel className="flex max-h-[88vh] w-full max-w-[960px] flex-col overflow-hidden bg-white/96 dark:bg-[#101317]/96" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between border-b border-slate-200/80 pb-3 dark:border-white/10">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">{editingMeeting ? "Edit session" : "Add session"}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Course sessions behave like real calendar events now.</p>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-10 w-10 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto pr-1">
        <div className="grid gap-2.5 md:grid-cols-2">
          <select value={courseId} onChange={(event) => setCourseId(event.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]">
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Session title (optional)" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
          <select value={type} onChange={(event) => setType(event.target.value as CourseMeeting["type"])} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]">
            <option value="lecture">Lecture</option>
            <option value="lab">Lab</option>
            <option value="tutorial">Tutorial</option>
            <option value="office-hours">Office hours</option>
            <option value="exam">Exam</option>
            <option value="study">Study block</option>
          </select>
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm dark:border-white/10 dark:bg-white/[0.04]">
            <input checked={isAllDay} onChange={(event) => setIsAllDay(event.target.checked)} type="checkbox" />
            Full day
          </label>
          <input value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} type="date" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
            {getWeekDayFromDate(new Date(`${anchorDate}T12:00:00`))}
          </div>
          {!isAllDay && <input value={start} onChange={(event) => setStart(event.target.value)} type="time" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />}
          {!isAllDay && <input value={end} onChange={(event) => setEnd(event.target.value)} type="time" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />}
          <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
          <select value={cadence} onChange={(event) => setCadence(event.target.value as SessionCadence)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]">
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <input value={interval} onChange={(event) => setInterval(Math.max(1, Number(event.target.value) || 1))} type="number" min={1} placeholder="Every" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
          {cadence === "weekly" && (
            <div className="md:col-span-2">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">Repeats on</p>
              <div className="flex flex-wrap gap-1.5">
                {weekDays.map((weekDay) => {
                  const active = repeatDays.includes(weekDay);
                  return (
                    <button
                      key={weekDay}
                      type="button"
                      onClick={() => setRepeatDays((current) => active ? current.filter((item) => item !== weekDay) : [...current, weekDay])}
                      className={`rounded-full px-3 py-1 text-xs ${active ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300"}`}
                    >
                      {weekDay}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <input value={until} onChange={(event) => setUntil(event.target.value)} type="date" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
          <input value={count} onChange={(event) => setCount(event.target.value)} type="number" min={1} placeholder="Occurrences limit" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes" className="min-h-[72px] max-h-[112px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none md:col-span-2 dark:border-white/10 dark:bg-white/[0.04]" />
          {conflicts.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 md:col-span-2 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="font-medium">Possible conflicts</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {conflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}
              </ul>
            </div>
          )}
        </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-200/80 pt-3 dark:border-white/10">
          <div className="flex gap-2">
            {editingMeeting && (
              <>
                <Button variant="outline" onClick={duplicateSession}>
                  <Copy className="mr-1 h-4 w-4" />
                  Duplicate
                </Button>
                <Button variant="outline" className="text-rose-500" onClick={deleteSession}>
                  <Trash2 className="mr-1 h-4 w-4" />
                  Delete
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={saveSession}>{editingMeeting ? "Save changes" : "Add to calendar"}</Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function parseTimeValue(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours + minutes / 60;
}

function formatHourMinutes(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function softCourseStyle(color: string): CSSProperties {
  return {
    background: `linear-gradient(135deg, ${color}38, ${color}20)`,
    boxShadow: `0 0 0 1px ${color}42, 0 10px 26px ${color}24, inset 0 1px 0 rgba(255,255,255,0.35)`
  };
}

function sameCalendarDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** `data-week-column` value (YYYY-MM-DD) under the pointer, for week-view work blocks. */
function resolveWeekColumnKeyFromPoint(clientX: number, clientY: number): string | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const node of stack) {
    if (!(node instanceof HTMLElement)) continue;
    const host = node.closest("[data-week-column]");
    if (host instanceof HTMLElement && host.dataset.weekColumn) {
      return host.dataset.weekColumn;
    }
  }
  return null;
}

type SessionOccurrence = {
  course: Course;
  meeting: CourseMeeting;
  date: Date;
  instanceKey: string;
};

type PositionedOccurrence = SessionOccurrence & {
  column: number;
  totalColumns: number;
};

function formatDateKey(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function getWeekDayFromDate(date: Date): WeekDay {
  return weekDays[date.getDay()];
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeekGrid(date: Date, weekStartsOn: "monday" | "sunday"): Date {
  const next = new Date(date);
  const day = next.getDay();
  const offset = weekStartsOn === "monday" ? (day + 6) % 7 : day;
  next.setDate(next.getDate() - offset);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getCurrentTimePosition(now: Date, hourStart: number, hourEnd: number, hourHeight = 80): number | null {
  const value = now.getHours() + now.getMinutes() / 60;
  if (value < hourStart || value > hourEnd) return null;
  return (value - hourStart) * hourHeight;
}

function buildCourseMeeting({
  existing,
  day,
  start,
  end,
  anchorDate,
  title,
  location,
  notes,
  type,
  isAllDay,
  cadence,
  interval,
  repeatDays,
  until,
  count,
  id,
  seriesId
}: {
  existing?: CourseMeeting;
  day: WeekDay;
  start: string;
  end: string;
  anchorDate: string;
  title: string;
  location: string;
  notes: string;
  type: CourseMeeting["type"];
  isAllDay: boolean;
  cadence: SessionCadence;
  interval: number;
  repeatDays: WeekDay[];
  until: string;
  count: string;
  id?: string;
  seriesId?: string;
}): CourseMeeting {
  return {
    id: id ?? existing?.id ?? createId("meeting"),
    day,
    start: isAllDay ? "00:00" : start,
    end: isAllDay ? "23:59" : end,
    anchorDate: anchorDate ? new Date(`${anchorDate}T12:00:00`).toISOString() : undefined,
    title: title.trim() || undefined,
    location: location.trim() || undefined,
    notes: notes.trim() || undefined,
    type,
    isAllDay,
    recurrence: {
      cadence,
      interval: Math.max(1, interval),
      daysOfWeek: cadence === "weekly" ? repeatDays : undefined,
      until: until ? new Date(`${until}T23:59:59`).toISOString() : undefined,
      count: count ? Math.max(1, Number(count)) : undefined
    },
    seriesId: seriesId ?? existing?.seriesId ?? createId("series")
  };
}

function groupOccurrencesByDate(occurrences: SessionOccurrence[]): Record<string, SessionOccurrence[]> {
  return occurrences.reduce<Record<string, SessionOccurrence[]>>((acc, occurrence) => {
    const key = formatDateKey(occurrence.date);
    acc[key] = [...(acc[key] ?? []), occurrence];
    return acc;
  }, {});
}

function meetingOccursOnDate(meeting: CourseMeeting, date: Date): boolean {
  const recurrence = meeting.recurrence ?? { cadence: "weekly", interval: 1, daysOfWeek: [meeting.day] };
  const targetKey = formatDateKey(date);
  const anchor = meeting.anchorDate ? new Date(meeting.anchorDate) : undefined;
  const anchorKey = anchor ? formatDateKey(anchor) : undefined;
  const weekDay = getWeekDayFromDate(date);
  if (recurrence.exceptions?.includes(targetKey)) return false;

  if (recurrence.until && new Date(recurrence.until).getTime() < date.getTime()) return false;

  if (recurrence.cadence === "none") {
    return anchorKey ? anchorKey === targetKey : weekDay === meeting.day;
  }

  if (recurrence.cadence === "daily") {
    if (!anchor) return true;
    const diff = Math.floor((startOfDay(date).getTime() - startOfDay(anchor).getTime()) / (24 * 60 * 60 * 1000));
    return diff >= 0 && diff % Math.max(1, recurrence.interval) === 0;
  }

  if (recurrence.cadence === "weekly") {
    const days = recurrence.daysOfWeek?.length ? recurrence.daysOfWeek : [meeting.day];
    if (!days.includes(weekDay)) return false;
    if (!anchor) return true;
    const anchorWeek = startOfWeekGrid(anchor, "sunday");
    const currentWeek = startOfWeekGrid(date, "sunday");
    const diffWeeks = Math.round((currentWeek.getTime() - anchorWeek.getTime()) / (7 * 24 * 60 * 60 * 1000));
    return diffWeeks >= 0 && diffWeeks % Math.max(1, recurrence.interval) === 0;
  }

  if (!anchor) return false;
  const monthDiff = (date.getFullYear() - anchor.getFullYear()) * 12 + (date.getMonth() - anchor.getMonth());
  return monthDiff >= 0 && monthDiff % Math.max(1, recurrence.interval) === 0 && date.getDate() === anchor.getDate();
}

function expandMeetingOccurrences(courses: Course[], rangeStart: Date, rangeEnd: Date): SessionOccurrence[] {
  const dates: Date[] = [];
  for (let cursor = startOfDay(rangeStart); cursor.getTime() <= startOfDay(rangeEnd).getTime(); cursor = addDays(cursor, 1)) {
    dates.push(new Date(cursor));
  }
  return courses.flatMap((course) =>
    course.meetings.flatMap((meeting) =>
      dates
        .filter((date) => meetingOccursOnDate(meeting, date))
        .map((date) => ({
          course,
          meeting,
          date,
          instanceKey: `${meeting.id}-${formatDateKey(date)}`
        }))
    )
  );
}

function layoutOverlappingEvents(occurrences: SessionOccurrence[]): PositionedOccurrence[] {
  const sorted = [...occurrences].sort((a, b) => parseTimeValue(a.meeting.start) - parseTimeValue(b.meeting.start));
  const active: PositionedOccurrence[] = [];
  const result: PositionedOccurrence[] = [];

  sorted.forEach((occurrence) => {
    const start = parseTimeValue(occurrence.meeting.start);
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (parseTimeValue(active[index].meeting.end) <= start) {
        active.splice(index, 1);
      }
    }
    const usedColumns = new Set(active.map((item) => item.column));
    let column = 0;
    while (usedColumns.has(column)) column += 1;
    const positioned: PositionedOccurrence = {
      ...occurrence,
      column,
      totalColumns: Math.max(active.length + 1, column + 1)
    };
    active.push(positioned);
    active.forEach((item) => {
      item.totalColumns = Math.max(item.totalColumns, positioned.totalColumns);
    });
    result.push(positioned);
  });

  return result;
}

function detectMeetingConflicts(courses: Course[], courseId: string, draftMeeting: CourseMeeting, ignoreMeetingId?: string): string[] {
  const previewCourse = courses.find((course) => course.id === courseId);
  if (!previewCourse) return [];
  const previewOccurrences = expandMeetingOccurrences([{ ...previewCourse, meetings: [draftMeeting] }], new Date(), addDays(new Date(), 60));
  const existingOccurrences = expandMeetingOccurrences(
    courses.map((course) => ({
      ...course,
      meetings: course.meetings.filter((meeting) => meeting.id !== ignoreMeetingId)
    })),
    new Date(),
    addDays(new Date(), 60)
  );
  const conflicts = new Set<string>();
  previewOccurrences.forEach((preview) => {
    existingOccurrences.forEach((existing) => {
      if (formatDateKey(preview.date) !== formatDateKey(existing.date)) return;
      if (preview.meeting.isAllDay || existing.meeting.isAllDay) {
        conflicts.add(`${existing.course.name} on ${existing.date.toLocaleDateString()}`);
        return;
      }
      const previewStart = parseTimeValue(preview.meeting.start);
      const previewEnd = parseTimeValue(preview.meeting.end);
      const existingStart = parseTimeValue(existing.meeting.start);
      const existingEnd = parseTimeValue(existing.meeting.end);
      if (previewStart < existingEnd && existingStart < previewEnd) {
        conflicts.add(`${existing.course.name} on ${existing.date.toLocaleDateString()} at ${existing.meeting.start}`);
      }
    });
  });
  return [...conflicts].slice(0, 5);
}

function formatSessionType(type?: CourseMeeting["type"]): string {
  switch (type) {
    case "lab":
      return "Lab";
    case "tutorial":
      return "Tirgul";
    case "office-hours":
      return "Office hours";
    case "exam":
      return "Exam";
    case "study":
      return "Study block";
    default:
      return "Lecture";
  }
}
