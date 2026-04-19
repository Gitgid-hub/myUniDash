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
  attachments: string[];
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
  /** Slides / PDFs attached to this note (binary stored locally per browser). */
  attachments: ClassNoteAttachment[];
}

export interface UIState {
  activeView: MainView;
  selectedCourseId: ID | "all";
  theme: ThemeMode;
  showTaskComposer: boolean;
  showSearch: boolean;
  focusedTaskId?: ID;
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
  kind: "task" | "course";
  title: string;
  subtitle: string;
  score: number;
}
