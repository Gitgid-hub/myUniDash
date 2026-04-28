import type { OnboardingStep } from "@/lib/onboarding";

export const MINIMAL_CORE_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to School OS",
    body: "This quick tour sets up your semester flow: degree, course, calendar hours, then planning views.",
    action: "none",
    placement: "auto",
    ensureView: "dashboard"
  },
  {
    id: "settings",
    title: "Open settings",
    body: "Start from Settings to configure your degree before adding courses.",
    targetSelector: "[data-onboarding='settings-button']",
    action: "none",
    placement: "bottom",
    ensureView: "dashboard"
  },
  {
    id: "degree",
    title: "Choose your degree",
    body: "Search your degree and press Load roadmap to open your degree course list.",
    targetSelector: "[data-onboarding='settings-degree-panel']",
    action: "none",
    placement: "left",
    ensureView: "dashboard",
    ensureUtilityOpen: false,
    ensureSettingsOpen: true,
    ensureCatalogPickerOpen: false
  },
  {
    id: "add-course",
    title: "Add one course",
    body: "From the roadmap list, add one course you are taking this semester.",
    targetSelector: "[data-onboarding='courses-add-button']",
    action: "none",
    placement: "right",
    ensureView: "courses"
  },
  {
    id: "calendar-hours",
    title: "Calendar course hours",
    body: "Now check the course in Calendar with its day, hour, and location. If Tirgul options appear, choose one.",
    targetSelector: "[data-onboarding='calendar-week-grid']",
    action: "none",
    placement: "right",
    ensureView: "calendar"
  },
  {
    id: "calendar-weekly",
    title: "Weekly overview",
    body: "Use Week view as your main scheduling overview for classes, overlaps, and planning.",
    targetSelector: "[data-onboarding='calendar-week-grid']",
    action: "none",
    placement: "bottom",
    ensureView: "calendar"
  },
  {
    id: "calendar-day",
    title: "Daily focus",
    body: "This is your daily planner. Drag a task from the right Tasks list into a time slot to book it and see the green booked indicator.",
    targetSelector: "[data-onboarding='calendar-day-planner']",
    action: "clickTarget",
    placement: "bottom",
    ensureView: "calendar"
  },
  {
    id: "class-notes",
    title: "Class notes",
    body: "Class Notes is where you write summaries and generate study cards.",
    targetSelector: "[data-onboarding='nav-class-notes']",
    action: "clickTarget",
    placement: "right",
    ensureView: "class-notes"
  },
  {
    id: "kanban",
    title: "Kanban board",
    body: "Kanban gives a board view of tasks by stage so you can move work from planned to done.",
    targetSelector: "[data-onboarding='nav-kanban']",
    action: "clickTarget",
    placement: "right",
    ensureView: "kanban"
  },
  {
    id: "done",
    title: "You're ready",
    body: "Great — your semester flow is ready. You can replay onboarding anytime from Guide.",
    action: "none",
    placement: "auto",
    ensureView: "dashboard",
    ensureSettingsOpen: false
  }
];
