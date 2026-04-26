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
    title: "Your account area",
    body: "This panel shows your signed-in account. You can also sign out here.",
    targetSelector: "[data-onboarding='account-panel']",
    action: "clickTarget",
    placement: "bottom",
    ensureView: "dashboard"
  },
  {
    id: "courses",
    title: "Add your courses",
    body: "Use this Add button to create your course list manually.",
    targetSelector: "[data-onboarding='courses-add-button']",
    action: "clickTarget",
    placement: "right"
  },
  {
    id: "calendar",
    title: "Open the calendar",
    body: "Go to Calendar to see sessions and plan your week.",
    targetSelector: "[data-onboarding='nav-calendar']",
    action: "clickTarget",
    placement: "right"
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
    id: "task",
    title: "Create a task",
    body: "Use Task to quickly add an assignment and keep your plan current.",
    targetSelector: "[data-onboarding='top-task-button']",
    action: "clickTarget",
    placement: "bottom",
    ensureView: "dashboard"
  },
  {
    id: "class-notes",
    title: "Class notes",
    body: "Class Notes is where you write summaries and generate study cards.",
    targetSelector: "[data-onboarding='nav-class-notes']",
    action: "clickTarget",
    placement: "right"
  },
  {
    id: "done",
    title: "You're ready",
    body: "That is the core workflow. You can replay this tour anytime from Agenda → Keyboard.",
    action: "none",
    placement: "auto",
    ensureView: "dashboard"
  }
];
