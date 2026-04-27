import type { OnboardingStep } from "@/lib/onboarding";

export const MINIMAL_CORE_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome to School OS",
    body: "This quick tour shows the core flow. It takes under a minute and you can skip anytime.",
    action: "none",
    placement: "auto",
    ensureView: "dashboard"
  },
  {
    id: "account",
    title: "Open settings",
    body: "Use Settings for your account details, sign out, and essential preferences.",
    targetSelector: "[data-onboarding='settings-button']",
    action: "none",
    placement: "bottom",
    ensureView: "dashboard"
  },
  {
    id: "courses",
    title: "Add your courses",
    body: "Use this Add button to create your course list manually.",
    targetSelector: "[data-onboarding='courses-add-button']",
    action: "clickTarget",
    placement: "right",
    ensureView: "dashboard",
    ensureUtilityOpen: false
  },
  {
    id: "degree",
    title: "Choose your degree",
    body: "Pick your degree in Settings before importing courses. Then use Open HUJI import to add relevant courses.",
    targetSelector: "[data-onboarding='settings-degree-panel']",
    action: "none",
    placement: "left",
    ensureView: "dashboard",
    ensureUtilityOpen: false,
    ensureSettingsOpen: true,
    ensureCatalogPickerOpen: false
  },
  {
    id: "calendar",
    title: "Open the calendar",
    body: "Go to Calendar to see sessions and plan your week.",
    targetSelector: "[data-onboarding='nav-calendar']",
    action: "clickTarget",
    placement: "right",
    ensureView: "calendar"
  },
  {
    id: "calendar-day",
    title: "Switch to day view",
    body: "Use Day mode when you want detailed hour-by-hour focus.",
    targetSelector: "[data-onboarding='calendar-day-button']",
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
    body: "Kanban gives you a board view of tasks by stage, so you can move work from planned to done with clear focus.",
    targetSelector: "[data-onboarding='nav-kanban']",
    action: "clickTarget",
    placement: "right",
    ensureView: "kanban"
  },
  {
    id: "guide",
    title: "Open the guide",
    body: "Use Guide to find keyboard shortcuts and replay onboarding anytime.",
    targetSelector: "[data-onboarding='guide-button']",
    action: "none",
    placement: "bottom",
    ensureView: "dashboard",
    ensureUtilityOpen: false
  },
  {
    id: "settings-feature",
    title: "Open settings",
    body: "Next, open Settings to send product feedback and feature requests.",
    targetSelector: "[data-onboarding='settings-button']",
    action: "none",
    placement: "bottom",
    ensureView: "dashboard",
    ensureUtilityOpen: false,
    ensureSettingsOpen: false
  },
  {
    id: "feature-request",
    title: "Send feature requests",
    body: "Open Settings and use this box to send missing features with screenshots.",
    targetSelector: "[data-onboarding='feature-request-panel']",
    action: "none",
    placement: "left",
    ensureView: "dashboard",
    ensureUtilityOpen: false,
    ensureSettingsOpen: true
  },
  {
    id: "done",
    title: "You're ready",
    body: "That is the core workflow. You can replay this tour anytime from Guide.",
    action: "none",
    placement: "auto",
    ensureView: "dashboard",
    ensureSettingsOpen: false
  }
];
