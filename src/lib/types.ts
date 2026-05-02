export type ID = string;

export type ThemeMode = "dark" | "light" | "system";

export type TaskStatus = "backlog" | "next" | "in-progress" | "done";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type ProgressMode = "manual" | "computed";
export type WeekDay = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export interface ReminderSettings {
  offsetsHours: number[];
}

export interface SessionRecurrence {
  cadence: "none" | "daily" | "weekly" | "monthly";
  interval: number;
  daysOfWeek?: WeekDay[];
  until?: string;
  count?: number;
  exceptions?: string[];
}

export interface CourseMeeting {
  id?: ID;
  day: WeekDay;
  start: string;
  end: string;
  anchorDate?: string;
  title?: string;
  location?: string;
  notes?: string;
  type?: "lecture" | "lab" | "tutorial" | "office-hours" | "exam" | "study";
  isAllDay?: boolean;
  overlapLayer?: "foreground" | "background";
  recurrence?: SessionRecurrence;
  seriesId?: ID;
}

export interface GradingComponent {
  label: string;
  weight: number;
}

export interface Course {
  id: ID;
  name: string;
  code: string;
  /** Optional Panopto “course folder” list URL; overrides built-in lookup by `code` when set. */
  panoptoFolderUrl?: string;
  source?: string;
  externalCourseId?: string;
  catalogLastSyncedAt?: string;
  color: string;
  archived: boolean;
  instructor?: string;
  notes: string;
  meetings: CourseMeeting[];
  grading: GradingComponent[];
  progressMode: ProgressMode;
  manualProgress: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecurrenceRule {
  cadence: "daily" | "weekly" | "monthly";
  interval: number;
}

/** File bytes live in IndexedDB (`task-attachment-blobs`); metadata syncs in persisted state. */
export interface TaskAttachment {
  id: ID;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface Task {
  id: ID;
  title: string;
  description: string;
  courseId: ID | "general";
  status: TaskStatus;
  dueAt?: string;
  priority: TaskPriority;
  effort: number;
  tags: string[];
  recurring?: RecurrenceRule;
  attachments: TaskAttachment[];
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkBlockStatus = "scheduled" | "completed" | "skipped";

export interface WorkBlock {
  id: ID;
  taskId: ID;
  courseId: ID | "general";
  startAt: string;
  endAt: string;
  status: WorkBlockStatus;
  createdAt: string;
  titleSnapshot?: string;
  colorSnapshot?: string;
}

export type MainView =
  | "dashboard"
  | "courses"
  | "user-requests"
  | "today"
  | "upcoming"
  | "overdue"
  | "by-course"
  | "by-priority"
  | "list"
  | "kanban"
  | "calendar"
  | "class-notes";

export type ClassNoteStatus = "draft" | "saved";

/** Paragraph / block direction for the rich note body (Hebrew). */
export type ClassNoteEditorTextDir = "ltr" | "rtl" | "auto";

/** File bytes live in IndexedDB (keyed by note + attachment); this record syncs in `user_states` JSON. */
export interface ClassNoteAttachment {
  id: ID;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export interface ClassNote {
  id: ID;
  courseId: ID;
  /** Calendar date of the class instance (YYYY-MM-DD). */
  occurredOn: string;
  meetingId?: ID;
  title: string;
  /** Rich HTML (TipTap) or legacy Markdown; see `looksLikeStoredHtml` in `class-note-body`. */
  bodyMarkdown: string;
  /** Editor block direction; defaults to `auto` for mixed Hebrew/Latin. */
  editorTextDir?: ClassNoteEditorTextDir;
  status: ClassNoteStatus;
  createdAt: string;
  updatedAt: string;
  /** Decks / PDFs + screenshot images (binary in IndexedDB per browser; images may also appear inline in `bodyMarkdown`). */
  attachments: ClassNoteAttachment[];
}

export interface UIState {
  activeView: MainView;
  selectedCourseId: ID | "all";
  theme: ThemeMode;
  showTaskComposer: boolean;
  showSearch: boolean;
  focusedTaskId?: ID;
  /** Timestamp when first-run onboarding was dismissed/completed. */
  onboardingCompletedAt?: string;
  /** YYYY-MM-DD of week Sunday when the weekly catch-up modal was last auto-opened or completed (Sun–Thu academic week). */
  catchUpPromptedWeekKey?: string;
  /** YYYY-MM-DD week-Sunday keys whose catch-up Generate has been submitted; used to lock the modal until the next week opens. */
  catchUpSubmittedWeekKeys?: string[];
}

export interface SchoolState {
  courses: Course[];
  tasks: Task[];
  workBlocks: WorkBlock[];
  classNotes: ClassNote[];
  reminderSettings: ReminderSettings;
  ui: UIState;
}

export interface Store {
  getState: () => Promise<SchoolState>;
  setState: (state: SchoolState) => Promise<void>;
}

export interface SearchResult {
  id: string;
  kind: "task" | "course" | "note" | "feature" | "command";
  title: string;
  subtitle: string;
  score: number;
}
