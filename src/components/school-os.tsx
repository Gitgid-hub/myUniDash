"use client";

import {
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent
} from "react";
import type { ComponentType } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Star,
  StickyNote,
  Cog,
  KanbanSquare,
  LayoutDashboard,
  Moon,
  Sun,
  Timer,
  TriangleAlert,
  X
} from "lucide-react";
import { defaultClassNoteTitle } from "@/components/class-notes-panel";
import { ByCourseView } from "@/components/by-course-view";
import { ByPriorityView } from "@/components/by-priority-view";
import { MetricCard } from "@/components/metric-card";
import { OnboardingTour } from "@/components/onboarding-tour";
import { usePruneClassNoteAttachmentBlobs } from "@/lib/class-note-attachment-blobs";
import { deleteTaskAttachmentBlobsForTask } from "@/lib/task-attachment-blobs";
import { getWeekKey, nowIso, startOfDay } from "@/lib/date";
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
  PersonalEvent,
  Task,
  TaskAttachment,
  TaskPriority,
  TaskStatus,
  WorkBlock
} from "@/lib/types";
import { getTabGuideSheet } from "@/lib/view-tab-guide";
import { schoolOsViewTitle } from "@/lib/school-os-view-title";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { Button, Panel } from "@/components/ui";
import { createId } from "@/lib/id";
import { useAuth } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import { pushSchoolOsToast } from "@/lib/global-app-toasts";
import {
  addDays,
  buildSyntheticCourseForPersonalEvent,
  buildSyntheticMeetingForPersonalEvent,
  expandMeetingOccurrences,
  expandPersonalEventOccurrences,
  formatDateKey,
  formatSessionType,
  getWeekDayFromDate,
  parseTimeValue,
  PERSONAL_EVENTS_COURSE_ID
} from "@/lib/calendar-occurrences";
import { buildSchoolSessionsIcs } from "@/lib/ical-export";
import { CalendarSyncModal } from "@/components/calendar-sync-modal";
import { isAdminEmail } from "@/lib/admin-emails";
import { PanoptoFolderPromptModal } from "@/components/panopto-folder-prompt-modal";
import { shouldOfferPanoptoFolderPastePrompt } from "@/lib/panopto-folder-url";
import type { WorkspaceUserRow } from "@/lib/workspace-user-admin";
import type { EarlyAccessRequestRow } from "@/lib/early-access-types";
import { coursePalette } from "@/lib/color-utils";
import { toLocalDateTimeInput } from "@/lib/date-format";
import { isTaskBlockUnderway } from "@/lib/work-block-utils";
import { fileToDataUrl } from "@/lib/file-utils";
import { AddCourseModal } from "@/components/modals/add-course-modal";
import { CourseEditorModal } from "@/components/modals/course-editor-modal";
import { SessionEditorModal } from "@/components/modals/session-editor-modal";
import { AiTaskImportModal, type AiParsedTaskDraft } from "@/components/modals/ai-task-import-modal";
import { TaskComposer } from "@/components/modals/task-composer";
import { TaskDetailModal } from "@/components/modals/task-detail-modal";
import { TaskList } from "@/components/views/dashboard-view";
import { taskComparator } from "@/lib/task-comparator";
import type { FeatureRequestItem } from "@/lib/feature-request-item";
import { SchoolOsLayout } from "@/components/school-os/school-os-layout";
import { CatalogImportModal } from "@/components/school-os/catalog-import-modal";
import {
  LazyCalendarView,
  LazyClassNotesPanel,
  LazyCoursesView,
  LazyDashboardView,
  LazyKanbanView
} from "@/components/school-os/school-os-lazy-views";
import { UserRequestsAdminView } from "@/components/school-os/user-requests-admin-view";
import { WeeklyCatchUpOverlays } from "@/components/school-os/weekly-catch-up-overlays";
import { AppleCalendarSyncPanel } from "@/components/school-os/apple-calendar-sync-panel";
import { SchoolOsAppConfirm } from "@/components/school-os/school-os-app-confirm";
import { SchoolOsMainToolbar, SchoolOsUtilityDrawer } from "@/components/school-os/school-os-utility-drawer";
import { SchoolOsSearchOverlay } from "@/components/school-os/school-os-search-overlay";
import { useWeeklyCatchUp } from "@/hooks/use-weekly-catch-up";
import { useCatalogDegreePicker } from "@/hooks/use-catalog-degree-picker";
import { useCatalogImport } from "@/hooks/use-catalog-import";
import { useOnboardingTour } from "@/hooks/use-onboarding-tour";
import { usePendingSessionChoiceFlow } from "@/hooks/use-pending-session-choice-flow";

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
/** Demo weekly catch-up uses tag `demo-weekly-catchup` (see `use-weekly-catch-up`) so QA can regenerate the same week (dedupe uses `catchup:…`). */
const MAX_FEATURE_REQUEST_SCREENSHOTS = 3;
const FEATURE_REQUEST_DONE_STORAGE_KEY = "school-os:feature-requests-done:v1";
/** Latest `created_at` (ISO) among requests the admin has opened on the User Requests view; used for “new since last visit” in the nav. */
const USER_REQUESTS_SEEN_WATERMARK_KEY = "school-os:user-requests-seen-watermark:v1";
const KANBAN_BOARD_LAYOUT_STORAGE_KEY = "school-os:kanban-board-layout:v1";
/** Legacy sentinel kept only for any stale references during migration; use PERSONAL_EVENTS_COURSE_ID from calendar-occurrences. */
const _LEGACY_PERSONAL_EVENTS_COURSE_ID = "course-unrelated-sessions"; void _LEGACY_PERSONAL_EVENTS_COURSE_ID;

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

type CalendarUndoEntry =
  | { type: "replace-course"; course: Course }
  | { type: "delete-work-block"; id: string }
  | { type: "replace-work-block"; block: WorkBlock }
  | { type: "insert-work-block"; block: WorkBlock }
  | { type: "replace-personal-event"; event: PersonalEvent }
  | { type: "delete-personal-event"; id: string }
  | { type: "restore-split-personal-event"; original: PersonalEvent; detachedId: string };

type TaskUndoEntry =
  | {
      type: "toggle";
      id: string;
      status: TaskStatus;
      completedAt?: string;
    }
  | {
      type: "delete";
      task: Task;
    };

const MemoByCourseView = memo(ByCourseView);
const MemoByPriorityView = memo(ByPriorityView);
const MemoTaskList = memo(TaskList);

function readKanbanBoardLayout(): "by-course" | "due-queue" {
  if (typeof window === "undefined") return "by-course";
  return window.localStorage.getItem(KANBAN_BOARD_LAYOUT_STORAGE_KEY) === "due-queue" ? "due-queue" : "by-course";
}

function SchoolOsViewSuspenseFallback() {
  return (
    <div className="flex min-h-[32vh] items-center justify-center text-sm text-slate-500 dark:text-slate-400">
      Loading…
    </div>
  );
}

export function SchoolOS() {
  const { state, ready, dispatch, addTask, updateTask, toggleTaskDone, addCourse } = useSchoolStore();
  const { user, enabled: authEnabled } = useAuth();
  usePruneClassNoteAttachmentBlobs(state.classNotes);
  const [kanbanTab, setKanbanTab] = useState<"board" | "completed">("board");
  const [kanbanBoardLayout, setKanbanBoardLayoutState] = useState<"by-course" | "due-queue">(readKanbanBoardLayout);
  const setKanbanBoardLayout = useCallback((layout: "by-course" | "due-queue") => {
    setKanbanBoardLayoutState(layout);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KANBAN_BOARD_LAYOUT_STORAGE_KEY, layout);
    }
  }, []);
  const [composerInitialCourseId, setComposerInitialCourseId] = useState<string | "general" | undefined>(undefined);
  const [aiTaskImportOpen, setAiTaskImportOpen] = useState(false);
  const [aiTaskImportCourseId, setAiTaskImportCourseId] = useState<string | "general" | "">("");
  const [aiTaskImportText, setAiTaskImportText] = useState("");
  const [aiTaskImportItems, setAiTaskImportItems] = useState<AiParsedTaskDraft[]>([]);
  const [aiTaskImportParsing, setAiTaskImportParsing] = useState(false);
  const [aiTaskImportError, setAiTaskImportError] = useState<string | null>(null);
  const [aiTaskImportCreating, setAiTaskImportCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [calendarMode, setCalendarMode] = useState<"month" | "week" | "day">("week");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => new Date());
  const [calendarSyncModalOpen, setCalendarSyncModalOpen] = useState(false);
  const [calendarAppOrigin, setCalendarAppOrigin] = useState("");
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseCode, setNewCourseCode] = useState("");
  const [newCourseColor, setNewCourseColor] = useState(coursePalette[0]);
  /** After catalog session-picker completes, show Panopto paste prompt for this course. */
  const pendingPanoptoAfterSessionChoiceRef = useRef<{ courseId: string; courseName: string } | null>(null);
  const [panoptoFolderPrompt, setPanoptoFolderPrompt] = useState<{ courseId: string; courseName: string } | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editInstructor, setEditInstructor] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPanoptoFolderUrl, setEditPanoptoFolderUrl] = useState("");
  const [editColor, setEditColor] = useState(coursePalette[0]);
  const [isUtilityOpen, setIsUtilityOpen] = useState(false);
  /** Which main tab the Guide drawer was opened for (shortcuts text). */
  const [tabGuideFor, setTabGuideFor] = useState<MainView>("dashboard");
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
  const [workspaceUsers, setWorkspaceUsers] = useState<WorkspaceUserRow[]>([]);
  const [workspaceUsersLoading, setWorkspaceUsersLoading] = useState(false);
  const [workspaceUsersError, setWorkspaceUsersError] = useState<string | null>(null);
  const [earlyAccessRequests, setEarlyAccessRequests] = useState<EarlyAccessRequestRow[]>([]);
  const [earlyAccessLoading, setEarlyAccessLoading] = useState(false);
  const [earlyAccessError, setEarlyAccessError] = useState<string | null>(null);
  const [grantingEarlyAccessEmail, setGrantingEarlyAccessEmail] = useState<string | null>(null);
  const [selectedRequestScreenshot, setSelectedRequestScreenshot] = useState<{ dataUrl: string; alt: string } | null>(null);
  const [doneFeatureRequestMap, setDoneFeatureRequestMap] = useState<Record<string, string>>({});
  const [userRequestsSeenWatermark, setUserRequestsSeenWatermark] = useState<string | null>(null);
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
  const [appConfirm, setAppConfirm] = useState<{
    title: string;
    description: string;
    variant?: "default" | "danger";
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
  } | null>(null);
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
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const degreePicker = useCatalogDegreePicker({
    isSettingsOpen,
    isCatalogPickerOpen,
    setCatalogError
  });
  const {
    catalogDegreeSearchQuery,
    setCatalogDegreeSearchQuery,
    isCatalogDegreeOptionsOpen,
    setIsCatalogDegreeOptionsOpen,
    catalogDegreeSearchLoading,
    catalogDegreeOptions,
    catalogDegree,
    setCatalogDegree,
    selectedCatalogDegreeOption
  } = degreePicker;

  const getAuthHeader = useCallback(async (): Promise<Record<string, string>> => {
    const supabase = getSupabaseClient();
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }, []);

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
      case "replace-personal-event":
        dispatch({ type: "update-personal-event", payload: previous.event });
        return;
      case "delete-personal-event":
        dispatch({ type: "delete-personal-event", payload: previous.id });
        return;
      case "restore-split-personal-event":
        dispatch({ type: "delete-personal-event", payload: previous.detachedId });
        dispatch({ type: "update-personal-event", payload: previous.original });
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

  const updatePersonalEventWithUndo = useCallback((event: Partial<PersonalEvent> & { id: string }) => {
    const previous = (state.personalEvents ?? []).find((e) => e.id === event.id);
    if (previous) {
      pushCalendarUndoEntry({ type: "replace-personal-event", event: previous });
    }
    dispatch({ type: "update-personal-event", payload: event });
  }, [dispatch, pushCalendarUndoEntry, state.personalEvents]);

  const addPersonalEventWithUndo = useCallback((event: Omit<PersonalEvent, "createdAt" | "updatedAt">) => {
    pushCalendarUndoEntry({ type: "delete-personal-event", id: event.id });
    dispatch({ type: "add-personal-event", payload: event });
  }, [dispatch, pushCalendarUndoEntry]);

  const splitPersonalEventWithUndo = useCallback((original: PersonalEvent, detachedId: string, updatedOriginal: Partial<PersonalEvent> & { id: string }, newEvent: Omit<PersonalEvent, "createdAt" | "updatedAt">) => {
    pushCalendarUndoEntry({ type: "restore-split-personal-event", original, detachedId });
    dispatch({ type: "update-personal-event", payload: updatedOriginal });
    dispatch({ type: "add-personal-event", payload: newEvent });
  }, [dispatch, pushCalendarUndoEntry]);

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

  const pushTaskUndoEntry = useCallback((entry: TaskUndoEntry) => {
    taskUndoStackRef.current.push(entry);
    if (taskUndoStackRef.current.length > 80) {
      taskUndoStackRef.current.shift();
    }
  }, []);

  const toggleTaskDoneWithUndo = useCallback((id: string) => {
    const previous = state.tasks.find((task) => task.id === id);
    if (!previous) return;
    pushTaskUndoEntry({
      type: "toggle",
      id: previous.id,
      status: previous.status,
      completedAt: previous.completedAt
    });
    toggleTaskDone(id);
  }, [pushTaskUndoEntry, state.tasks, toggleTaskDone]);

  const undoTaskToggle = useCallback(() => {
    const previous = taskUndoStackRef.current.pop();
    if (!previous) return;
    if (previous.type === "delete") {
      dispatch({
        type: "add-task",
        payload: {
          id: previous.task.id,
          title: previous.task.title,
          description: previous.task.description,
          courseId: previous.task.courseId,
          status: previous.task.status,
          dueAt: previous.task.dueAt,
          priority: previous.task.priority,
          effort: previous.task.effort,
          tags: previous.task.tags,
          attachments: previous.task.attachments,
          recurring: previous.task.recurring
        }
      });
      return;
    }
    dispatch({
      type: "update-task",
      payload: {
        id: previous.id,
        status: previous.status,
        completedAt: previous.completedAt
      }
    });
  }, [dispatch]);

  const openQuickFeedbackShortcut = useCallback(() => {
    setIsSettingsOpen(true);
    window.setTimeout(() => {
      const el = document.querySelector("[data-onboarding='feature-request-panel']");
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const ta = el.querySelector("textarea");
        if (ta instanceof HTMLTextAreaElement) {
          ta.focus();
        }
      }
    }, 160);
  }, []);

  const openTabGuide = useCallback(
    (view?: MainView) => {
      setTabGuideFor(view ?? state.ui.activeView);
      setIsUtilityOpen(true);
    },
    [state.ui.activeView]
  );

  const schedulePanoptoFolderPrompt = useCallback((courseId: string, courseName: string, code: string) => {
    if (!shouldOfferPanoptoFolderPastePrompt({ code, name: courseName, panoptoFolderUrl: undefined })) return;
    window.setTimeout(() => {
      setPanoptoFolderPrompt({ courseId, courseName });
    }, 0);
  }, []);

  const {
    pendingSessionChoiceFlow,
    setPendingSessionChoiceFlow,
    activeChoiceSet,
    tentativeCalendarOptions,
    selectTentativeCalendarOption
  } = usePendingSessionChoiceFlow({
    courses: state.courses,
    dispatch,
    schedulePanoptoFolderPrompt,
    pendingPanoptoAfterSessionChoiceRef
  });

  const catalogRetreatFnsRef = useRef<{ reset: () => void } | null>(null);

  const onboardingTour = useOnboardingTour({
    ready,
    courses: state.courses,
    tasks: state.tasks,
    onboardingCompletedAt: state.ui.onboardingCompletedAt ?? null,
    activeView: state.ui.activeView,
    showTaskComposer: state.ui.showTaskComposer,
    dispatch,
    isCatalogPickerOpen,
    isUtilityOpen,
    isSettingsOpen,
    pendingSessionChoiceFlow,
    setPendingSessionChoiceFlow,
    setCalendarMode,
    setIsUtilityOpen,
    setTabGuideFor,
    setIsSettingsOpen,
    setIsCatalogPickerOpen,
    setIsCourseActionsOpen,
    resetCatalogForAddCourseRetreat: () => {
      catalogRetreatFnsRef.current?.reset();
    }
  });

  const catalogImport = useCatalogImport({
    userId: user?.id,
    courses: state.courses,
    dispatch,
    addCourse,
    getAuthHeader,
    schedulePanoptoFolderPrompt,
    pendingPanoptoAfterSessionChoiceRef,
    setPendingSessionChoiceFlow,
    setFreshlyAddedCourseId: onboardingTour.setFreshlyAddedCourseId,
    setVisibleCourseIds,
    setIsCatalogPickerOpen,
    setIsSettingsOpen,
    setIsCourseActionsOpen,
    setCalendarMode,
    catalogDegreeOptions,
    catalogDegree,
    setCatalogDegree,
    setCatalogDegreeSearchQuery,
    setIsCatalogDegreeOptionsOpen,
    setCatalogError,
    isCatalogPickerOpen,
    onboardingActive: onboardingTour.onboardingActive,
    markDegreeRoadmapStale: onboardingTour.markDegreeRoadmapStale,
    setOnboardingRoadmapLoaded: onboardingTour.setOnboardingRoadmapLoaded
  });
  catalogRetreatFnsRef.current = {
    reset: () => {
      catalogImport.setCatalogViewMode("search");
      catalogImport.setCatalogQuery("");
    }
  };

  const {
    catalogQuery,
    setCatalogQuery,
    catalogLoading,
    catalogRefreshing,
    catalogResults,
    catalogFreshness,
    catalogImportingId,
    catalogDegreeImporting,
    catalogViewMode,
    refreshCatalog,
    importCatalogCourse,
    importFullDegreePlan,
    selectCatalogDegreeOption,
    groupedRoadmapCourses
  } = catalogImport;

  const {
    onboardingActive,
    onboardingStepIndex,
    onboardingTargetElement,
    onboardingStepForTour,
    onboardingCatalogLocked,
    onboardingCourseGlowId,
    setFreshlyAddedCourseId,
    beginOnboarding,
    advanceOnboarding,
    retreatOnboarding,
    skipOnboarding
  } = onboardingTour;

  const openCourseEditorForPanopto = useCallback((courseId: string) => {
    dispatch({ type: "set-course-filter", payload: courseId });
    setIsCourseEditorOpen(true);
    window.setTimeout(() => {
      const el = document.getElementById("course-panopto-folder-url");
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el instanceof HTMLInputElement) el.focus();
    }, 180);
  }, [dispatch]);

  useKeyboardShortcuts({
    openSearch: () => dispatch({ type: "set-search", payload: true }),
    openQuickFeedback: openQuickFeedbackShortcut,
    undoCalendarChange,
    undoTaskToggle,
    markFocusedDone: () => {
      if (state.ui.focusedTaskId) {
        toggleTaskDoneWithUndo(state.ui.focusedTaskId);
      }
    },
    switchView: (view) => dispatch({ type: "set-view", payload: view }),
    setFocusedTask: (id) => dispatch({ type: "set-focus", payload: id }),
    getActiveView: () => state.ui.activeView,
    openNewTask: () => {
      if (state.ui.showTaskComposer || state.ui.showSearch) return;
      setComposerInitialCourseId(undefined);
      dispatch({ type: "set-composer", payload: true });
    }
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
  const selectedCourse =
    state.ui.selectedCourseId === "all"
      ? undefined
      : state.courses.find((course) => course.id === state.ui.selectedCourseId);

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

  const isAdmin = useMemo(() => isAdminEmail(user?.email), [user?.email]);
  const visibleNavItems = useMemo(
    () => navItems.filter((item) => (item.id === "user-requests" ? isAdmin : true)),
    [isAdmin]
  );

  const gitSyncedForRequests = useMemo(
    () => Boolean(gitSyncStatus.available && gitSyncStatus.clean && gitSyncStatus.ahead === 0),
    [gitSyncStatus.available, gitSyncStatus.clean, gitSyncStatus.ahead]
  );

  const visibleAdminFeatureRequests = useMemo(
    () =>
      adminFeatureRequests.filter(
        (request) => !(doneFeatureRequestMap[String(request.id)] && gitSyncedForRequests)
      ),
    [adminFeatureRequests, doneFeatureRequestMap, gitSyncedForRequests]
  );

  const userRequestsNavCount = visibleAdminFeatureRequests.length;
  const userRequestsNavHasUnseen = useMemo(() => {
    if (!isAdmin || !userRequestsSeenWatermark || visibleAdminFeatureRequests.length === 0) return false;
    const seenMs = new Date(userRequestsSeenWatermark).getTime();
    if (Number.isNaN(seenMs)) return false;
    return visibleAdminFeatureRequests.some((r) => new Date(r.created_at).getTime() > seenMs);
  }, [isAdmin, userRequestsSeenWatermark, visibleAdminFeatureRequests]);

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

  const loadWorkspaceUsers = useCallback(async () => {
    if (!isAdmin) return;
    setWorkspaceUsersLoading(true);
    setWorkspaceUsersError(null);
    try {
      const headers = await getAuthHeader();
      const res = await fetch("/api/admin/workspace-users", { headers, cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? "Failed to load accounts.");
      }
      setWorkspaceUsers(payload.users ?? []);
    } catch (error) {
      setWorkspaceUsersError(error instanceof Error ? error.message : "Failed to load accounts.");
    } finally {
      setWorkspaceUsersLoading(false);
    }
  }, [getAuthHeader, isAdmin]);

  const loadEarlyAccessRequests = useCallback(async () => {
    if (!isAdmin) return;
    setEarlyAccessLoading(true);
    setEarlyAccessError(null);
    try {
      const headers = await getAuthHeader();
      const res = await fetch("/api/admin/early-access-requests", { headers, cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? "Failed to load early access requests.");
      }
      setEarlyAccessRequests(payload.requests ?? []);
    } catch (error) {
      setEarlyAccessError(error instanceof Error ? error.message : "Failed to load early access requests.");
    } finally {
      setEarlyAccessLoading(false);
    }
  }, [getAuthHeader, isAdmin]);

  const grantEarlyAccess = useCallback(
    async (email: string) => {
      if (!isAdmin) return;
      setGrantingEarlyAccessEmail(email);
      setEarlyAccessError(null);
      try {
        const headers = {
          "Content-Type": "application/json",
          ...(await getAuthHeader())
        };
        const res = await fetch("/api/admin/early-access-grant", {
          method: "POST",
          headers,
          body: JSON.stringify({ email })
        });
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload.error ?? "Failed to grant access.");
        }
        await loadEarlyAccessRequests();
      } catch (error) {
        setEarlyAccessError(error instanceof Error ? error.message : "Failed to grant access.");
      } finally {
        setGrantingEarlyAccessEmail(null);
      }
    },
    [getAuthHeader, isAdmin, loadEarlyAccessRequests]
  );

  const deleteAdminFeatureRequest = useCallback((requestId: number) => {
    if (!isAdmin) return;
    setAppConfirm({
      title: "Delete this request?",
      description: "This permanently removes the user's feature request from the admin list.",
      variant: "danger",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      onConfirm: () => {
        void (async () => {
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
        })();
      }
    });
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
    if (!isSettingsOpen || !isAdmin) return;
    void loadWorkspaceUsers();
  }, [isAdmin, isSettingsOpen, loadWorkspaceUsers]);

  useEffect(() => {
    if (!isSettingsOpen || !isAdmin) return;
    void loadEarlyAccessRequests();
  }, [isAdmin, isSettingsOpen, loadEarlyAccessRequests]);

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
    if (!isAdmin || typeof window === "undefined") return;
    const raw = window.localStorage.getItem(USER_REQUESTS_SEEN_WATERMARK_KEY);
    if (raw) {
      setUserRequestsSeenWatermark((prev) => prev ?? raw);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin && state.ui.activeView === "user-requests") {
      dispatch({ type: "set-view", payload: "dashboard" });
    }
  }, [dispatch, isAdmin, state.ui.activeView]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadAdminFeatureRequests();
    const id = window.setInterval(() => {
      void loadAdminFeatureRequests();
    }, 45_000);
    return () => window.clearInterval(id);
  }, [isAdmin, loadAdminFeatureRequests]);

  useEffect(() => {
    if (!isAdmin) return;
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
    const intervalId = window.setInterval(() => {
      void checkGitSync();
    }, 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [getAuthHeader, isAdmin]);

  useEffect(() => {
    if (!isAdmin || typeof window === "undefined") return;
    if (userRequestsSeenWatermark !== null) return;
    if (adminRequestsLoading) return;
    if (adminFeatureRequests.length === 0) return;
    const basis =
      visibleAdminFeatureRequests.length > 0 ? visibleAdminFeatureRequests : adminFeatureRequests;
    const maxCreated = basis.reduce(
      (best, r) => (new Date(r.created_at).getTime() >= new Date(best).getTime() ? r.created_at : best),
      basis[0].created_at
    );
    const existing = window.localStorage.getItem(USER_REQUESTS_SEEN_WATERMARK_KEY);
    if (existing) {
      setUserRequestsSeenWatermark(existing);
    } else {
      window.localStorage.setItem(USER_REQUESTS_SEEN_WATERMARK_KEY, maxCreated);
      setUserRequestsSeenWatermark(maxCreated);
    }
  }, [isAdmin, userRequestsSeenWatermark, adminRequestsLoading, adminFeatureRequests, visibleAdminFeatureRequests]);

  useEffect(() => {
    if (!isAdmin || typeof window === "undefined") return;
    if (state.ui.activeView !== "user-requests") return;
    if (adminRequestsLoading) return;
    if (adminFeatureRequests.length === 0) return;
    const basis =
      visibleAdminFeatureRequests.length > 0 ? visibleAdminFeatureRequests : adminFeatureRequests;
    const maxCreated = basis.reduce(
      (best, r) => (new Date(r.created_at).getTime() >= new Date(best).getTime() ? r.created_at : best),
      basis[0].created_at
    );
    window.localStorage.setItem(USER_REQUESTS_SEEN_WATERMARK_KEY, maxCreated);
    setUserRequestsSeenWatermark(maxCreated);
  }, [
    isAdmin,
    state.ui.activeView,
    adminRequestsLoading,
    adminFeatureRequests,
    visibleAdminFeatureRequests
  ]);

  useEffect(() => {
    if (!selectedCourse) {
      return;
    }
    setEditName(selectedCourse.name);
    setEditCode(selectedCourse.code);
    setEditInstructor(selectedCourse.instructor ?? "");
    setEditNotes(selectedCourse.notes ?? "");
    setEditPanoptoFolderUrl(selectedCourse.panoptoFolderUrl ?? "");
    setEditColor(selectedCourse.color);
  }, [selectedCourse]);

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

  const utilityGuideSheet = useMemo(() => getTabGuideSheet(tabGuideFor), [tabGuideFor]);

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
          title: "Feedback & bugs (request box)",
          subtitle: "Settings → send features, bugs, or QR issues",
          terms:
            "feedback bug bugs feature request user request report issue problem qr suggestion request box missing broken",
          score: 14
        },
        {
          id: "cmd-open-guide",
          title: "Guide",
          subtitle: "Shortcuts, replay onboarding",
          terms: "guide help shortcuts keyboard utility tour onboarding replay book",
          score: 13
        },
        {
          id: "cmd-calendar-week",
          title: "Calendar — week view",
          subtitle: "Open Calendar in week layout",
          terms: "week weekly calendar schedule timetable",
          score: 12
        },
        {
          id: "cmd-calendar-day",
          title: "Calendar — day view",
          subtitle: "Open Calendar in day layout",
          terms: "day daily calendar agenda",
          score: 12
        },
        {
          id: "cmd-calendar-month",
          title: "Calendar — month view",
          subtitle: "Open Calendar in month layout",
          terms: "month monthly calendar overview",
          score: 12
        },
        {
          id: "cmd-dashboard",
          title: "Dashboard",
          subtitle: "Main overview",
          terms: "dashboard home overview metrics",
          score: 10
        },
        {
          id: "cmd-kanban",
          title: "Kanban",
          subtitle: "Board view for tasks",
          terms: "kanban board tasks swimlane",
          score: 10
        },
        {
          id: "cmd-ai-task-import",
          title: "Task generator",
          subtitle: "Paste a plan and generate tasks",
          terms: "task generator plan import tasks parse deadlines milestones",
          score: 12
        },
        {
          id: "cmd-class-notes",
          title: "Class Notes",
          subtitle: "Lecture notes and drafts",
          terms: "class notes lecture summaries notes tab",
          score: 10
        },
        {
          id: "cmd-courses",
          title: "Courses",
          subtitle: "Course list and catalog",
          terms: "courses catalog roadmap",
          score: 9
        },
        {
          id: "cmd-settings",
          title: "Settings",
          subtitle: "Account, degree, preferences",
          terms: "settings account preferences sign out degree theme",
          score: 9
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
          kind: (item.id.startsWith("cmd-") ? "command" : "feature") as "command" | "feature",
          title: item.title,
          subtitle: item.subtitle,
          score: item.score + Number(item.title.toLowerCase().includes(q))
        }));

      return [...base, ...noteResults, ...featureResults]
        .sort((a, b) => b.score - a.score)
        .slice(0, 24);
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
  const catchUpEligibleCourses = useMemo(
    () => activeCourses.filter((course) => course.id !== PERSONAL_EVENTS_COURSE_ID),
    [activeCourses]
  );

  const weeklyCatchUp = useWeeklyCatchUp({
    ready,
    activeView: state.ui.activeView,
    catchUpEligibleCourses,
    activeCourses,
    tasks: state.tasks,
    catchUpPromptedWeekKey: state.ui?.catchUpPromptedWeekKey,
    catchUpSubmittedWeekKeys: state.ui?.catchUpSubmittedWeekKeys,
    weeklyCatchUpAutoPrompt: state.ui?.weeklyCatchUpAutoPrompt ?? true,
    dispatch,
    addTask,
    setKanbanTab
  });

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

  const kanbanTasks = useMemo(() => [...state.tasks].sort(taskComparator), [state.tasks]);

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
      if (task) {
        pushTaskUndoEntry({ type: "delete", task });
      }
      if (task?.attachments?.length) {
        void deleteTaskAttachmentBlobsForTask(user?.id, id).catch(() => {});
      }
      dispatch({ type: "delete-task", payload: id });
    },
    [dispatch, pushTaskUndoEntry, state.tasks, user?.id]
  );
  const handleOpenComposer = useCallback((courseId?: string | "general") => {
    setComposerInitialCourseId(courseId);
    dispatch({ type: "set-composer", payload: true });
  }, [dispatch]);
  const handleOpenAiTaskImport = useCallback(
    () => {
      setAiTaskImportOpen(true);
      setAiTaskImportError(null);
      setAiTaskImportItems([]);
      setAiTaskImportCreating(false);
      setAiTaskImportParsing(false);
      setAiTaskImportText("");
      setAiTaskImportCourseId("");
    },
    []
  );
  const handleParseAiTaskImport = useCallback(async () => {
    if (!aiTaskImportCourseId) {
      setAiTaskImportError("Choose a course before parsing.");
      return;
    }
    if (aiTaskImportCourseId !== "general" && !state.courses.some((course) => course.id === aiTaskImportCourseId && !course.archived)) {
      setAiTaskImportError("Selected course is no longer available.");
      return;
    }
    const text = aiTaskImportText.trim();
    if (!text) {
      setAiTaskImportError("Paste your task plan text first.");
      return;
    }
    setAiTaskImportParsing(true);
    setAiTaskImportError(null);
    try {
      const headers = {
        "Content-Type": "application/json",
        ...(await getAuthHeader())
      };
      const res = await fetch("/api/tasks/parse-plan", {
        method: "POST",
        headers,
        body: JSON.stringify({ sourceText: text })
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? "Could not parse tasks.");
      }
      const raw = Array.isArray(payload.tasks) ? payload.tasks : [];
      const mapped: AiParsedTaskDraft[] = raw
        .map((task: Record<string, unknown>, index: number) => {
          const title = typeof task.title === "string" ? task.title.trim() : "";
          if (!title) return null;
          const description = typeof task.description === "string" ? task.description.trim() : "";
          const dueIso = typeof task.dueAt === "string" ? task.dueAt : "";
          const due = dueIso ? new Date(dueIso) : null;
          const dueAt = due && !Number.isNaN(due.getTime()) ? toLocalDateTimeInput(due) : "";
          const phase = typeof task.phase === "string" ? task.phase.trim() : "";
          const priorityToken = typeof task.priority === "string" ? task.priority : "";
          const priority: TaskPriority =
            priorityToken === "low" || priorityToken === "medium" || priorityToken === "high" || priorityToken === "urgent"
              ? priorityToken
              : "medium";
          return {
            id: `ai-task-${index}-${Math.random().toString(36).slice(2, 8)}`,
            title,
            description,
            dueAt,
            priority,
            include: true,
            phase: phase || undefined
          } satisfies AiParsedTaskDraft;
        })
        .filter((task: AiParsedTaskDraft | null): task is AiParsedTaskDraft => Boolean(task));
      setAiTaskImportItems(mapped);
      if (mapped.length === 0) {
        setAiTaskImportError("No actionable tasks detected. Try clearer bullets with dates.");
      }
    } catch (error) {
      setAiTaskImportError(error instanceof Error ? error.message : "Could not parse tasks.");
    } finally {
      setAiTaskImportParsing(false);
    }
  }, [aiTaskImportCourseId, aiTaskImportText, getAuthHeader, state.courses]);
  const handleCreateAiImportedTasks = useCallback(async () => {
    if (!aiTaskImportCourseId) {
      setAiTaskImportError("Choose a course before creating tasks.");
      return;
    }
    if (aiTaskImportCourseId !== "general" && !state.courses.some((course) => course.id === aiTaskImportCourseId && !course.archived)) {
      setAiTaskImportError("Selected course is no longer available.");
      return;
    }
    const selected = aiTaskImportItems.filter((item) => item.include && item.title.trim().length > 0);
    if (selected.length === 0) {
      setAiTaskImportError("Select at least one parsed task.");
      return;
    }
    setAiTaskImportCreating(true);
    try {
      for (const item of selected) {
        const description = [item.phase ? `Phase: ${item.phase}` : "", item.description]
          .filter((part) => part.trim().length > 0)
          .join("\n");
        handleCreateTask({
          title: item.title.trim(),
          description,
          courseId: aiTaskImportCourseId,
          dueAt: item.dueAt ? new Date(item.dueAt).toISOString() : undefined,
          priority: item.priority,
          status: "backlog"
        });
      }
      pushSchoolOsToast({ kind: "success", message: `Created ${selected.length} task${selected.length === 1 ? "" : "s"}.` });
      setAiTaskImportOpen(false);
      setAiTaskImportItems([]);
      setAiTaskImportText("");
      setAiTaskImportError(null);
      setAiTaskImportCreating(false);
      dispatch({ type: "set-view", payload: "kanban" });
    } finally {
      setAiTaskImportCreating(false);
    }
  }, [aiTaskImportCourseId, aiTaskImportItems, dispatch, handleCreateTask, state.courses]);
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

  const appleCalendarAutoSync = state.ui?.appleCalendarAutoSync ?? false;

  const calendarCloudSignedIn = authEnabled && Boolean(user);

  const handleOpenCalendarSync = useCallback(() => {
    dispatch({ type: "ensure-calendar-feed-token" });
    if (typeof window !== "undefined") {
      setCalendarAppOrigin(window.location.origin);
    }
    setCalendarSyncModalOpen(true);
  }, [dispatch]);

  const handleDownloadSessionsIcs = useCallback(() => {
    try {
      const { text, eventCount } = buildSchoolSessionsIcs(state.courses, new Date(), state.personalEvents ?? []);
      if (eventCount === 0) {
        pushSchoolOsToast({
          kind: "error",
          message: "No class sessions in the export window. Add weekly meetings to your courses first."
        });
        return;
      }
      const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `school-os-classes-${formatDateKey(new Date())}.ics`;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      pushSchoolOsToast({
        kind: "success",
        message: `Downloaded ${eventCount} session${eventCount === 1 ? "" : "s"} (.ics).`
      });
    } catch {
      pushSchoolOsToast({ kind: "error", message: "Could not build the calendar file." });
    }
  }, [state.courses]);

  const handleRotateCalendarFeedToken = useCallback(() => {
    dispatch({ type: "rotate-calendar-feed-token" });
  }, [dispatch]);

  const calendarSessionSignature = useMemo(
    () =>
      state.courses
        .map((course) => `${course.id}:${course.meetings.length}:${course.updatedAt}`)
        .sort()
        .join("|"),
    [state.courses]
  );
  const previousCalendarSessionSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    const current = calendarSessionSignature;
    if (previousCalendarSessionSignatureRef.current === null) {
      previousCalendarSessionSignatureRef.current = current;
      return;
    }
    if (previousCalendarSessionSignatureRef.current === current) return;
    previousCalendarSessionSignatureRef.current = current;
    if (!appleCalendarAutoSync) return;
    dispatch({ type: "ensure-calendar-feed-token" });
    if (!calendarCloudSignedIn) {
      pushSchoolOsToast({
        kind: "error",
        message: "Apple auto-sync needs cloud sign-in. Sign in, then add the subscription link once."
      });
      return;
    }
    pushSchoolOsToast({
      kind: "success",
      message: "Session updated. Apple Calendar subscription will refresh automatically."
    });
  }, [appleCalendarAutoSync, calendarCloudSignedIn, calendarSessionSignature, dispatch, ready]);

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

  const selectedPersonalEvent = selectedCalendarSession?.courseId === PERSONAL_EVENTS_COURSE_ID
    ? (state.personalEvents ?? []).find((e) => e.id === selectedCalendarSession.meetingId)
    : undefined;
  const selectedSessionCourse = selectedCalendarSession
    ? selectedCalendarSession.courseId === PERSONAL_EVENTS_COURSE_ID
      ? selectedPersonalEvent ? buildSyntheticCourseForPersonalEvent(selectedPersonalEvent) : undefined
      : activeCourses.find((c) => c.id === selectedCalendarSession.courseId)
    : undefined;
  const selectedSessionMeeting = selectedCalendarSession
    ? selectedCalendarSession.courseId === PERSONAL_EVENTS_COURSE_ID
      ? selectedPersonalEvent ? buildSyntheticMeetingForPersonalEvent(selectedPersonalEvent) : undefined
      : selectedSessionCourse?.meetings.find((m) => m.id === selectedCalendarSession.meetingId)
    : undefined;

  useEffect(() => {
    if (selectedCalendarSession && (!selectedSessionCourse || !selectedSessionMeeting)) {
      setSelectedCalendarSession(null);
    }
  }, [selectedCalendarSession, selectedSessionCourse, selectedSessionMeeting]);

  const deleteSelectedSession = useCallback((scope: "single" | "series") => {
    if (!selectedCalendarSession || !selectedSessionCourse || !selectedSessionMeeting) return;
    if (selectedCalendarSession.courseId === PERSONAL_EVENTS_COURSE_ID && selectedPersonalEvent) {
      if (scope === "series" || (selectedPersonalEvent.recurrence?.cadence ?? "weekly") === "none") {
        dispatch({ type: "delete-personal-event", payload: selectedPersonalEvent.id });
      } else {
        const dateKey = formatDateKey(selectedCalendarSession.anchorDate);
        const recurrence = selectedPersonalEvent.recurrence ?? { cadence: "weekly" as const, interval: 1, daysOfWeek: [selectedPersonalEvent.day] };
        const nextExceptions = Array.from(new Set([...(recurrence.exceptions ?? []), dateKey]));
        dispatch({ type: "update-personal-event", payload: { id: selectedPersonalEvent.id, recurrence: { ...recurrence, exceptions: nextExceptions } } });
      }
      setSelectedCalendarSession(null);
      return;
    }
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
  }, [dispatch, selectedCalendarSession, selectedPersonalEvent, selectedSessionCourse, selectedSessionMeeting, updateCourseWithUndo]);

  const deleteSelectedSessionFuture = useCallback(() => {
    if (!selectedCalendarSession || !selectedSessionCourse || !selectedSessionMeeting) return;
    if (selectedCalendarSession.courseId === PERSONAL_EVENTS_COURSE_ID && selectedPersonalEvent) {
      const recurrence = selectedPersonalEvent.recurrence;
      if (!recurrence || recurrence.cadence === "none") { deleteSelectedSession("single"); return; }
      const untilDate = new Date(selectedCalendarSession.anchorDate);
      untilDate.setDate(untilDate.getDate() - 1);
      const untilIso = new Date(`${formatDateKey(untilDate)}T23:59:59`).toISOString();
      dispatch({ type: "update-personal-event", payload: { id: selectedPersonalEvent.id, recurrence: { ...recurrence, until: untilIso } } });
      setSelectedCalendarSession(null);
      return;
    }
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
  }, [deleteSelectedSession, dispatch, selectedCalendarSession, selectedPersonalEvent, selectedSessionCourse, selectedSessionMeeting, updateCourseWithUndo]);

  const [copiedSessionMeeting, setCopiedSessionMeeting] = useState<CourseMeeting | null>(null);

  useEffect(() => {
    const onCalendarKeyDown = (event: KeyboardEvent) => {
      const onCalendar = state.ui.activeView === "calendar";
      const onClassNotes = state.ui.activeView === "class-notes";
      if (!onCalendar && !onClassNotes) return;
      if (!selectedCalendarSession || !selectedSessionCourse || !selectedSessionMeeting) return;
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (typing) return;

      if (onCalendar && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        event.stopPropagation();
        const recurrenceCadence = selectedSessionMeeting.recurrence?.cadence ?? "weekly";
        if (recurrenceCadence === "weekly") {
          setSessionDeletePrompt({
            courseId: selectedCalendarSession.courseId,
            meetingId: selectedCalendarSession.meetingId,
            anchorDate: selectedCalendarSession.anchorDate
          });
        } else {
          deleteSelectedSession("single");
        }
        return;
      }
      if (!event.metaKey && !event.ctrlKey && (event.key.toLowerCase() === "n" || event.key === "מ")) {
        event.preventDefault();
        event.stopPropagation();
        openClassNoteDraftForSession(selectedCalendarSession.courseId, selectedCalendarSession.meetingId, selectedCalendarSession.anchorDate);
        return;
      }
      if (onCalendar && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        event.stopPropagation();
        setCopiedSessionMeeting({ ...selectedSessionMeeting });
        pushSchoolOsToast({ kind: "success", message: "Session copied." });
        return;
      }
      if (onCalendar && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v" && copiedSessionMeeting) {
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
        if (selectedPersonalEvent) {
          dispatch({
            type: "add-personal-event",
            payload: {
              id: pasted.id ?? createId("pevt"),
              title: pasted.title?.trim() || selectedPersonalEvent.title,
              color: selectedPersonalEvent.color,
              day: pasted.day,
              start: pasted.start,
              end: pasted.end,
              location: pasted.location,
              notes: pasted.notes,
              isAllDay: pasted.isAllDay,
              anchorDate: pasted.anchorDate,
              recurrence: pasted.recurrence
            }
          });
        } else {
          updateCourseWithUndo({
            id: selectedSessionCourse.id,
            meetings: [...selectedSessionCourse.meetings, pasted]
          });
        }
        pushSchoolOsToast({ kind: "success", message: "Session duplicated." });
      }
    };
    window.addEventListener("keydown", onCalendarKeyDown, true);
    return () => window.removeEventListener("keydown", onCalendarKeyDown, true);
  }, [
    copiedSessionMeeting,
    deleteSelectedSession,
    deleteSelectedSessionFuture,
    dispatch,
    openClassNoteDraftForSession,
    selectedCalendarDate,
    selectedCalendarSession,
    selectedPersonalEvent,
    selectedSessionCourse,
    selectedSessionMeeting,
    state.ui.activeView,
    updateCourseWithUndo
  ]);

  const todaysSessionOccurrences = useMemo(() => {
    const day = new Date();
    const start = startOfDay(day);
    const end = startOfDay(day);
    return [
      ...expandMeetingOccurrences(activeCourses, start, end),
      ...expandPersonalEventOccurrences(state.personalEvents ?? [], start, end)
    ];
  }, [activeCourses, state.personalEvents]);

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
    schedulePanoptoFolderPrompt(newCourseId, trimmedName, normalizedCode);
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <div className="animate-pulse text-lg">Booting School OS...</div>
      </div>
    );
  }

  return (
    <>
      <SchoolOsLayout
        sidebar={
          <>
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
                const showRequestsBadge = item.id === "user-requests" && isAdmin && userRequestsNavCount > 0;
                const requestsBadgeLabel =
                  userRequestsNavCount > 99 ? "99+" : String(userRequestsNavCount);
                /** Loud alert only when there are unseen requests and you are not already on this tab. */
                const requestsBadgeAlert =
                  item.id === "user-requests" &&
                  userRequestsNavHasUnseen &&
                  state.ui.activeView !== "user-requests";
                return (
                  <button
                    key={item.id}
                    onClick={() => dispatch({ type: "set-view", payload: item.id })}
                    data-onboarding={`nav-${item.id}`}
                    className={`flex w-full min-w-0 items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-[15px] transition ${active ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-500 hover:bg-slate-100/80 dark:text-slate-400 dark:hover:bg-white/[0.04]"}`}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2.5">
                      <Icon className="h-[15px] w-[15px] shrink-0" />
                      <span className="min-w-0 truncate">{item.label}</span>
                    </span>
                    {showRequestsBadge ? (
                      <span className="flex shrink-0 items-center gap-1.5">
                        {requestsBadgeAlert ? (
                          <span
                            className="relative flex h-2 w-2"
                            title="New request since you last opened User Requests"
                            aria-hidden
                          >
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_0_2px_rgba(255,255,255,0.35)] dark:shadow-[0_0_0_2px_rgba(15,23,42,0.5)]" />
                          </span>
                        ) : null}
                        <span
                          className={`min-w-[1.35rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums ${
                            requestsBadgeAlert
                              ? active
                                ? "bg-rose-600 text-white shadow-sm dark:bg-rose-600"
                                : "bg-rose-600 text-white shadow-sm dark:bg-rose-500"
                              : active
                                ? "border border-slate-300/90 bg-slate-900/[0.07] text-slate-800 shadow-none dark:border-white/15 dark:bg-white/[0.12] dark:text-slate-100"
                                : "border border-slate-200/90 bg-slate-200/75 text-slate-600 shadow-none dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-400"
                          }`}
                          title={`${userRequestsNavCount} pending user request${userRequestsNavCount === 1 ? "" : "s"}`}
                        >
                          {requestsBadgeLabel}
                        </span>
                      </span>
                    ) : null}
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
          </>
        }
        main={
        <main
          className={
            state.ui.activeView === "kanban" || state.ui.activeView === "calendar" || state.ui.activeView === "class-notes"
              ? "animate-fadeSlide flex h-full min-h-0 flex-col gap-5 overflow-hidden"
              : "animate-fadeSlide space-y-5"
          }
        >
          {state.ui.activeView !== "calendar" && (
            <SchoolOsMainToolbar
              viewTitle={schoolOsViewTitle(state.ui.activeView)}
              activeView={state.ui.activeView}
              onOpenSearch={() => dispatch({ type: "set-search", payload: true })}
              onOpenGuide={() => openTabGuide()}
            />
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
              <Suspense fallback={<SchoolOsViewSuspenseFallback />}>
                <LazyDashboardView
                  courses={activeCourses}
                  tasks={filteredTasks.filter((task) => task.status !== "done")}
                  workBlocks={state.workBlocks}
                  onToggleDone={toggleTaskDoneWithUndo}
                  onFocus={handleFocusTask}
                  focusedTaskId={state.ui.focusedTaskId}
                  analytics={analytics}
                />
              </Suspense>
            </>
          )}
          {state.ui.activeView === "kanban" && (
            <div className="flex min-h-0 flex-1 flex-col">
              <Suspense fallback={<SchoolOsViewSuspenseFallback />}>
                <LazyKanbanView
                tasks={kanbanTab === "board" ? kanbanBoardTasks : kanbanCompletedTasks}
                tab={kanbanTab}
                onTabChange={setKanbanTab}
                boardLayout={kanbanBoardLayout}
                onBoardLayoutChange={setKanbanBoardLayout}
                boardCount={kanbanBoardTotal}
                completedCount={kanbanCompletedTotal}
                thisWeekCompletedCount={completedThisWeek}
                weeklyCompletedBuckets={kanbanWeeklyBuckets}
                courses={state.courses}
                workBlocks={state.workBlocks}
                onUpdate={updateTask}
                onDelete={handleDeleteTask}
                onFocus={handleFocusTask}
                onToggleDone={handleKanbanToggleDone}
                onOpenComposer={handleOpenComposer}
                onOpenAiImport={handleOpenAiTaskImport}
                onOpenTabGuide={() => openTabGuide("kanban")}
                glowTaskIds={weeklyCatchUp.catchUpGlowTaskIds}
                />
              </Suspense>
            </div>
          )}
          {state.ui.activeView === "calendar" && (
            <Suspense fallback={<SchoolOsViewSuspenseFallback />}>
              <LazyCalendarView
              tasks={state.tasks}
              workBlocks={state.workBlocks}
              courses={activeCourses}
              personalEvents={state.personalEvents ?? []}
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
              onAddCourse={addCourse}
              onAddPersonalEvent={addPersonalEventWithUndo}
              onUpdatePersonalEvent={updatePersonalEventWithUndo}
              onDeletePersonalEvent={(id) => dispatch({ type: "delete-personal-event", payload: id })}
              onSplitPersonalEvent={splitPersonalEventWithUndo}
              onAddWorkBlock={addWorkBlockWithUndo}
              onUpdateWorkBlock={updateWorkBlockWithUndo}
              onDeleteWorkBlock={deleteWorkBlockWithUndo}
              onOpenTask={handleFocusTask}
              tentativeOptions={tentativeCalendarOptions}
              tentativeChoiceTitle={activeChoiceSet?.label}
              onPickTentativeOption={selectTentativeCalendarOption}
              newlyAddedCourseId={onboardingCourseGlowId}
              onOpenWeeklyCatchUp={weeklyCatchUp.onOpenWeeklyCatchUpFromCalendar}
              onAppleCalendarSync={handleOpenCalendarSync}
              onOpenTabGuide={() => openTabGuide("calendar")}
              catchUpOwnerToolbar={
                isAdmin ? (
                  <Button
                    variant="outline"
                    className="h-8 shrink-0 text-xs"
                    type="button"
                    title="QA: clears prior demo catch-up tasks, then opens a fixed Sun–Thu week (virtual date in src/lib/demo-weekly-catchup.ts). Real Weekly catch-up still uses actual time. Demo tasks are removed when you leave Kanban or close this modal."
                    onClick={weeklyCatchUp.onDemoWeeklyCatchUp}
                  >
                    Demo catch-up
                  </Button>
                ) : null
              }
              />
            </Suspense>
          )}
                    {state.ui.activeView === "courses" && (
            <Suspense fallback={<SchoolOsViewSuspenseFallback />}>
              <LazyCoursesView
              activeCoursesCount={activeCourses.length}
              importedCoursesCount={importedCoursesCount}
              manualCoursesCount={manualCoursesCount}
              archivedCourses={archivedCourses}
              visibleCoursesInSidebar={visibleCoursesInSidebar}
              courseListMode={courseListMode}
              onCourseListModeChange={setCourseListMode}
              selectedCourseId={state.ui.selectedCourseId}
              onOpenCourseEditor={(courseId) => {
                dispatch({ type: "set-course-filter", payload: courseId });
                setIsCourseEditorOpen(true);
              }}
              isCourseActionsOpen={isCourseActionsOpen}
              onToggleCourseActions={() => setIsCourseActionsOpen((v) => !v)}
              onOpenAddManual={() => {
                setIsAddCourseOpen(true);
                setIsCourseActionsOpen(false);
              }}
              onOpenCatalogImport={() => {
                setIsCatalogPickerOpen(true);
                setIsCourseActionsOpen(false);
              }}
              onOpenPanoptoForCourse={openCourseEditorForPanopto}
              onUnarchiveCourse={(courseId) => {
                dispatch({ type: "unarchive-course", payload: courseId });
                setCourseListMode("all");
                dispatch({ type: "set-course-filter", payload: courseId });
              }}
              onRequestArchiveCourse={(course) => {
                setAppConfirm({
                  title: "Archive this course?",
                  description:
                    "It will be hidden from the calendar and active lists until you restore it. Sessions and other data stay saved.",
                  confirmLabel: "Archive",
                  cancelLabel: "Cancel",
                  onConfirm: () => {
                    dispatch({ type: "archive-course", payload: course.id });
                    dispatch({ type: "set-course-filter", payload: "all" });
                  }
                });
              }}
              onRequestDeleteCourse={(course) => {
                setAppConfirm({
                  title: "Delete this course?",
                  description:
                    "This permanently removes the course and deletes related tasks, work blocks, and class notes.",
                  variant: "danger",
                  confirmLabel: "Delete",
                  cancelLabel: "Cancel",
                  onConfirm: () => {
                    dispatch({ type: "delete-course", payload: course.id });
                    dispatch({ type: "set-course-filter", payload: "all" });
                  }
                });
              }}
            />
            </Suspense>
          )}
          {state.ui.activeView === "user-requests" && isAdmin && (
            <UserRequestsAdminView
              gitSyncStatus={gitSyncStatus}
              adminRequestsError={adminRequestsError}
              adminRequestsLoading={adminRequestsLoading}
              visibleAdminFeatureRequests={visibleAdminFeatureRequests}
              doneFeatureRequestMap={doneFeatureRequestMap}
              onToggleDoneForRequest={(requestId) => {
                const requestKey = String(requestId);
                setDoneFeatureRequestMap((prev) => {
                  const next = { ...prev };
                  if (next[requestKey]) {
                    delete next[requestKey];
                  } else {
                    next[requestKey] = new Date().toISOString();
                  }
                  return next;
                });
              }}
              onDeleteRequest={deleteAdminFeatureRequest}
              deletingRequestId={deletingRequestId}
              onRefresh={loadAdminFeatureRequests}
              onOpenScreenshot={setSelectedRequestScreenshot}
            />
          )}
          {state.ui.activeView === "by-course" && <MemoByCourseView tasks={filteredTasks} courses={activeCourses} onToggleDone={toggleTaskDoneWithUndo} onFocus={handleFocusTask} />}
          {state.ui.activeView === "by-priority" && <MemoByPriorityView tasks={filteredTasks} onToggleDone={toggleTaskDoneWithUndo} onFocus={handleFocusTask} />}
          {state.ui.activeView === "class-notes" && (
            <div className="min-h-0 flex-1 overflow-auto pr-1">
              <Suspense fallback={<SchoolOsViewSuspenseFallback />}>
                <LazyClassNotesPanel
                  courses={state.courses}
                  classNotes={state.classNotes ?? []}
                  openNoteId={classNoteEditorId}
                  onOpenNote={setClassNoteEditorId}
                  onCreateNote={(input) => dispatch({ type: "add-class-note", payload: input })}
                  onUpdateNote={(payload) => dispatch({ type: "update-class-note", payload })}
                  onDeleteNote={(id) => dispatch({ type: "delete-class-note", payload: id })}
                  onPublishNote={(id) => dispatch({ type: "publish-class-note", payload: id })}
                  onOpenTabGuide={() => openTabGuide("class-notes")}
                />
              </Suspense>
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
              title={schoolOsViewTitle(state.ui.activeView)}
            />
          )}
        </main>
        }
      />

      <SchoolOsUtilityDrawer
        open={isUtilityOpen}
        guideSheet={utilityGuideSheet}
        onClose={() => setIsUtilityOpen(false)}
        onReplayOnboarding={() => {
          setIsUtilityOpen(false);
          beginOnboarding();
        }}
      />

      {isSettingsOpen && (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close settings drawer"
            className="absolute inset-0 bg-slate-950/18 backdrop-blur-[1px] dark:bg-black/35"
            onClick={() => setIsSettingsOpen(false)}
          />
          <aside className="absolute inset-y-4 right-4 flex w-[min(420px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] flex-col gap-4 overflow-y-auto rounded-[32px] border border-slate-200/80 bg-[#f7f8fa]/96 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.16)] backdrop-blur-2xl dark:border-white/10 dark:bg-[#0f1115]/96 dark:shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
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

            <AppleCalendarSyncPanel
              appleCalendarAutoSync={appleCalendarAutoSync}
              onAutoSyncChange={(next) => {
                dispatch({ type: "set-apple-calendar-auto-sync", payload: next });
                if (next) {
                  handleOpenCalendarSync();
                }
              }}
              onManageSubscription={handleOpenCalendarSync}
            />

            {isAdmin && (
              <Panel className="bg-white/92 dark:bg-[#101317]/92" data-onboarding="admin-workspace-users">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="font-semibold">Live accounts</h3>
                  <Button variant="outline" className="h-7 shrink-0 px-2 text-xs" onClick={() => void loadWorkspaceUsers()} disabled={workspaceUsersLoading}>
                    Refresh
                  </Button>
                </div>
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                  Supabase users who can sign in to this deployment. <span className="font-medium">Last activity</span> is the later of last sign-in or last cloud workspace save.
                </p>
                {workspaceUsersError ? <p className="text-xs text-rose-500">{workspaceUsersError}</p> : null}
                {workspaceUsersLoading && workspaceUsers.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Loading…</p>
                ) : workspaceUsers.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No users returned.</p>
                ) : (
                  <div className="max-h-56 overflow-x-auto overflow-y-auto rounded-xl border border-slate-200/80 dark:border-white/10">
                    <table className="w-full min-w-[280px] border-collapse text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-200/80 text-slate-500 dark:border-white/10 dark:text-slate-400">
                          <th className="sticky top-0 bg-white/95 py-1.5 pe-2 ps-2 font-medium dark:bg-[#101317]/95">Email</th>
                          <th className="sticky top-0 bg-white/95 py-1.5 pe-2 ps-0 font-medium dark:bg-[#101317]/95">Last activity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workspaceUsers.map((row) => (
                          <tr key={row.id} className="border-b border-slate-100/90 last:border-0 dark:border-white/[0.06]">
                            <td className="max-w-[140px] truncate py-1.5 pe-2 ps-2 align-top text-slate-800 dark:text-slate-100" title={row.email}>
                              {row.email || "—"}
                            </td>
                            <td className="whitespace-nowrap py-1.5 pe-2 align-top text-slate-600 dark:text-slate-300">
                              {row.last_activity_at
                                ? new Date(row.last_activity_at).toLocaleString(undefined, {
                                    dateStyle: "medium",
                                    timeStyle: "short"
                                  })
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            )}

            {isAdmin && (
              <Panel className="bg-white/92 dark:bg-[#101317]/92" data-onboarding="admin-early-access-requests">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="font-semibold">Early access requests</h3>
                  <Button variant="outline" className="h-7 shrink-0 px-2 text-xs" onClick={() => void loadEarlyAccessRequests()} disabled={earlyAccessLoading}>
                    Refresh
                  </Button>
                </div>
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                  Stealth beta: pending requests from &quot;Request early access&quot;, then recent granted rows. Grant adds the email to the allowlist so they can sign up or use Google.
                </p>
                {earlyAccessError ? <p className="text-xs text-rose-500">{earlyAccessError}</p> : null}
                {earlyAccessLoading && earlyAccessRequests.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Loading…</p>
                ) : earlyAccessRequests.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No requests yet.</p>
                ) : (
                  <div className="max-h-64 overflow-x-auto overflow-y-auto rounded-xl border border-slate-200/80 dark:border-white/10">
                    <table className="w-full min-w-[320px] border-collapse text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-200/80 text-slate-500 dark:border-white/10 dark:text-slate-400">
                          <th className="sticky top-0 bg-white/95 py-1.5 pe-2 ps-2 font-medium dark:bg-[#101317]/95">Email</th>
                          <th className="sticky top-0 bg-white/95 py-1.5 pe-2 ps-0 font-medium dark:bg-[#101317]/95">Status</th>
                          <th className="sticky top-0 bg-white/95 py-1.5 pe-2 ps-0 font-medium dark:bg-[#101317]/95">Requested</th>
                          <th className="sticky top-0 bg-white/95 py-1.5 pe-2 ps-0 font-medium dark:bg-[#101317]/95" />
                        </tr>
                      </thead>
                      <tbody>
                        {earlyAccessRequests.map((row) => (
                          <tr key={row.id} className="border-b border-slate-100/90 align-top last:border-0 dark:border-white/[0.06]">
                            <td className="max-w-[120px] truncate py-1.5 pe-2 ps-2 text-slate-800 dark:text-slate-100" title={row.email}>
                              {row.email}
                            </td>
                            <td className="whitespace-nowrap py-1.5 pe-2 text-slate-600 dark:text-slate-300">{row.status}</td>
                            <td className="whitespace-nowrap py-1.5 pe-2 text-slate-600 dark:text-slate-300">
                              {new Date(row.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                            </td>
                            <td className="py-1.5 pe-2 ps-0">
                              {row.status === "pending" ? (
                                <Button
                                  variant="outline"
                                  className="h-7 px-2 text-[10px]"
                                  disabled={grantingEarlyAccessEmail === row.email}
                                  onClick={() => void grantEarlyAccess(row.email)}
                                >
                                  {grantingEarlyAccessEmail === row.email ? "…" : "Grant access"}
                                </Button>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {earlyAccessRequests.some((r) => r.message) ? (
                      <div className="mt-2 space-y-1 border-t border-slate-200/80 pt-2 text-[10px] text-slate-500 dark:border-white/10 dark:text-slate-400">
                        {earlyAccessRequests.filter((r) => r.message).map((row) => (
                          <p key={`msg-${row.id}`}>
                            <span className="font-medium text-slate-600 dark:text-slate-300">{row.email}:</span> {row.message}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </Panel>
            )}

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
        step={onboardingStepForTour}
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

      <CatalogImportModal
        open={isCatalogPickerOpen}
        onboardingCatalogLocked={onboardingCatalogLocked}
        catalogDegreeSearchQuery={catalogDegreeSearchQuery}
        onCatalogDegreeSearchQueryChange={setCatalogDegreeSearchQuery}
        isCatalogDegreeOptionsOpen={isCatalogDegreeOptionsOpen}
        onCatalogDegreeOptionsOpen={() => setIsCatalogDegreeOptionsOpen(true)}
        onCatalogDegreeOptionsCloseEscape={() => setIsCatalogDegreeOptionsOpen(false)}
        catalogDegreeOptions={catalogDegreeOptions}
        catalogDegree={catalogDegree}
        onSelectCatalogDegree={selectCatalogDegreeOption}
        catalogQuery={catalogQuery}
        onCatalogQueryChange={setCatalogQuery}
        onRefreshCatalog={refreshCatalog}
        catalogRefreshing={catalogRefreshing}
        selectedCatalogDegreeLabel={selectedCatalogDegreeOption?.label}
        catalogDegreeIdDisplay={catalogDegree}
        catalogFreshness={catalogFreshness}
        catalogError={catalogError}
        catalogLoading={catalogLoading}
        catalogViewMode={catalogViewMode}
        catalogResults={catalogResults}
        groupedRoadmapCourses={groupedRoadmapCourses}
        catalogImportingId={catalogImportingId}
        onImportCatalogCourse={importCatalogCourse}
        onClose={() => {
          setIsCatalogPickerOpen(false);
          setCatalogError(null);
        }}
      />

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
          editPanoptoFolderUrl={editPanoptoFolderUrl}
          setEditPanoptoFolderUrl={setEditPanoptoFolderUrl}
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
                panoptoFolderUrl: editPanoptoFolderUrl.trim() || undefined,
                progressMode: selectedCourse.progressMode,
                manualProgress: selectedCourse.manualProgress,
                color: editColor
              }
            });
            setIsCourseEditorOpen(false);
          }}
          courseArchived={selectedCourse.archived}
          onArchive={() => {
            setAppConfirm({
              title: "Archive this course?",
              description:
                "It will be hidden from the calendar and active lists until you restore it. Sessions and other data stay saved.",
              confirmLabel: "Archive",
              cancelLabel: "Cancel",
              onConfirm: () => {
                dispatch({ type: "archive-course", payload: selectedCourse.id });
                dispatch({ type: "set-course-filter", payload: "all" });
                setIsCourseEditorOpen(false);
              }
            });
          }}
          onRestore={() => {
            dispatch({ type: "unarchive-course", payload: selectedCourse.id });
            setCourseListMode("all");
            dispatch({ type: "set-course-filter", payload: selectedCourse.id });
            setIsCourseEditorOpen(false);
          }}
          onDelete={() => {
            setAppConfirm({
              title: "Delete this course?",
              description:
                "This permanently removes the course and deletes related tasks, work blocks, and class notes.",
              variant: "danger",
              confirmLabel: "Delete",
              cancelLabel: "Cancel",
              onConfirm: () => {
                dispatch({ type: "delete-course", payload: selectedCourse.id });
                dispatch({ type: "set-course-filter", payload: "all" });
                setIsCourseEditorOpen(false);
              }
            });
          }}
        />
      )}

      {isSessionEditorOpen && (
        <SessionEditorModal
          courses={[
            ...activeCourses,
            {
              id: PERSONAL_EVENTS_COURSE_ID, name: "Personal events", code: "PRIVATE", color: "#64748b",
              archived: false, notes: "", grading: [], progressMode: "manual", manualProgress: 0,
              createdAt: "", updatedAt: "",
              meetings: (state.personalEvents ?? []).map((e) => buildSyntheticMeetingForPersonalEvent(e))
            }
          ]}
          selectedCourseId={state.ui.selectedCourseId}
          selectedDate={selectedCalendarDate}
          sessionDraft={sessionDraft}
          onClose={() => {
            setIsSessionEditorOpen(false);
            setSessionDraft(undefined);
          }}
          onSave={(courseId, meetings, replaceMode) => {
            if (courseId === PERSONAL_EVENTS_COURSE_ID) {
              const editingMeetingId = sessionDraft?.meetingId;
              const editingEventId = editingMeetingId;
              if (editingEventId) {
                const newMeeting = meetings.find((m) => m.id === editingEventId) ?? meetings[0];
                if (newMeeting) {
                  dispatch({
                    type: "update-personal-event",
                    payload: {
                      id: editingEventId,
                      title: newMeeting.title?.trim() || "Personal event",
                      day: newMeeting.day,
                      start: newMeeting.start,
                      end: newMeeting.end,
                      location: newMeeting.location,
                      notes: newMeeting.notes,
                      isAllDay: newMeeting.isAllDay,
                      anchorDate: newMeeting.anchorDate,
                      recurrence: newMeeting.recurrence
                    }
                  });
                }
              } else {
                for (const newMeeting of meetings) {
                  dispatch({
                    type: "add-personal-event",
                    payload: {
                      id: newMeeting.id ?? createId("pevt"),
                      title: newMeeting.title?.trim() || "Personal event",
                      color: "#64748b",
                      day: newMeeting.day,
                      start: newMeeting.start,
                      end: newMeeting.end,
                      location: newMeeting.location,
                      notes: newMeeting.notes,
                      isAllDay: newMeeting.isAllDay,
                      anchorDate: newMeeting.anchorDate,
                      recurrence: newMeeting.recurrence
                    }
                  });
                }
              }
              setIsSessionEditorOpen(false);
              setSessionDraft(undefined);
              return;
            }

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
      {aiTaskImportOpen && (
        <AiTaskImportModal
          courses={activeCourses}
          selectedCourseId={aiTaskImportCourseId}
          planText={aiTaskImportText}
          items={aiTaskImportItems}
          parsing={aiTaskImportParsing}
          creating={aiTaskImportCreating}
          error={aiTaskImportError}
          onClose={() => setAiTaskImportOpen(false)}
          onChangeCourse={setAiTaskImportCourseId}
          onChangeText={setAiTaskImportText}
          onParse={() => void handleParseAiTaskImport()}
          onToggleInclude={(id) =>
            setAiTaskImportItems((current) => current.map((item) => (item.id === id ? { ...item, include: !item.include } : item)))
          }
          onChangeItem={(id, patch) =>
            setAiTaskImportItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
          }
          onCreate={() => void handleCreateAiImportedTasks()}
        />
      )}
      <WeeklyCatchUpOverlays {...weeklyCatchUp.overlayProps} />
      <PanoptoFolderPromptModal
        open={panoptoFolderPrompt !== null}
        courseName={panoptoFolderPrompt?.courseName ?? ""}
        onAddLater={() => setPanoptoFolderPrompt(null)}
        onSave={(url) => {
          if (!panoptoFolderPrompt) return;
          dispatch({
            type: "update-course",
            payload: { id: panoptoFolderPrompt.courseId, panoptoFolderUrl: url.trim() }
          });
          setPanoptoFolderPrompt(null);
        }}
      />
      <CalendarSyncModal
        open={calendarSyncModalOpen}
        onClose={() => setCalendarSyncModalOpen(false)}
        appOrigin={calendarAppOrigin}
        calendarFeedToken={state.ui.calendarFeedToken}
        cloudSignedIn={calendarCloudSignedIn}
        onRotateFeedToken={handleRotateCalendarFeedToken}
        onDownloadIcs={handleDownloadSessionsIcs}
      />

      <SchoolOsSearchOverlay
        open={state.ui.showSearch}
        query={searchQuery}
        onQueryChange={setSearchQuery}
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
            } else if (result.kind === "feature" || result.kind === "command") {
              if (result.id === "user-requests-tab" && isAdmin) {
                dispatch({ type: "set-view", payload: "user-requests" });
              } else if (result.id === "cmd-open-guide") {
                openTabGuide();
              } else if (result.id === "cmd-calendar-week") {
                dispatch({ type: "set-view", payload: "calendar" });
                setCalendarMode("week");
              } else if (result.id === "cmd-calendar-day") {
                dispatch({ type: "set-view", payload: "calendar" });
                setCalendarMode("day");
              } else if (result.id === "cmd-calendar-month") {
                dispatch({ type: "set-view", payload: "calendar" });
                setCalendarMode("month");
              } else if (result.id === "cmd-dashboard") {
                dispatch({ type: "set-view", payload: "dashboard" });
              } else if (result.id === "cmd-kanban") {
                dispatch({ type: "set-view", payload: "kanban" });
              } else if (result.id === "cmd-ai-task-import") {
                dispatch({ type: "set-view", payload: "kanban" });
                handleOpenAiTaskImport();
              } else if (result.id === "cmd-class-notes") {
                dispatch({ type: "set-view", payload: "class-notes" });
              } else if (result.id === "cmd-courses") {
                dispatch({ type: "set-view", payload: "courses" });
              } else if (result.id === "cmd-settings") {
                setIsSettingsOpen(true);
              } else {
                setIsSettingsOpen(true);
                const selector =
                  result.id === "feature-request-panel"
                    ? "[data-onboarding='feature-request-panel']"
                    : result.id === "settings-degree-panel"
                      ? "[data-onboarding='settings-degree-panel']"
                      : null;
                if (selector) {
                  window.setTimeout(() => {
                    const el = document.querySelector(selector);
                    if (el instanceof HTMLElement) {
                      el.scrollIntoView({ behavior: "smooth", block: "center" });
                      if (result.id === "feature-request-panel") {
                        const ta = el.querySelector("textarea");
                        if (ta instanceof HTMLTextAreaElement) {
                          ta.focus();
                        }
                      }
                    }
                  }, 120);
                }
              }
            }
            dispatch({ type: "set-search", payload: false });
        }}
      />

      <SchoolOsAppConfirm
        confirm={appConfirm}
        onCancel={() => setAppConfirm(null)}
        onConfirm={() => {
          const pending = appConfirm;
          setAppConfirm(null);
          pending?.onConfirm();
        }}
      />
    </>
  );
}

