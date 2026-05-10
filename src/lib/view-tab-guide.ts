import type { MainView } from "@/lib/types";

export type TabGuideSection = { title: string; items: { keys: string; detail: string }[] };

function viewLabel(view: MainView): string {
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

const GLOBAL_SHORTCUTS: TabGuideSection = {
  title: "Everywhere",
  items: [
    { keys: "⌘K or /", detail: "Search." },
    { keys: "⌘⇧U", detail: "Settings → feedback (Ctrl+Shift+U on Windows)." },
    { keys: "⌘Z", detail: "Undo last calendar edit here; elsewhere undoes last X on a task." },
    { keys: "X", detail: "Mark focused task done." },
    { keys: "Esc", detail: "Clear task focus." },
    { keys: "1–8", detail: "Switch main views (no ⌘). User Requests: sidebar or search." }
  ]
};

function tabSpecificSection(view: MainView): TabGuideSection | null {
  switch (view) {
    case "kanban":
      return {
        title: "This screen",
        items: [
          { keys: "N · מ", detail: "New task (when you are not typing)." },
          { keys: "Task generator", detail: "Paste a plan to bulk-add tasks." }
        ]
      };
    case "calendar":
      return {
        title: "This screen",
        items: [
          { keys: "Drag", detail: "Draw or drag blocks to add or move sessions." },
          {
            keys: "Session selected",
            detail: "Delete — remove · N — class note · ⌘C / ⌘V — copy / duplicate to the picked day."
          }
        ]
      };
    case "class-notes":
      return {
        title: "This screen",
        items: [
          { keys: "N · מ", detail: "Note for a class you selected on Calendar; else use + on a course." },
          { keys: "Esc", detail: "Close the full-screen editor." }
        ]
      };
    case "dashboard":
    case "upcoming":
    case "by-course":
    case "by-priority":
      return {
        title: "This screen",
        items: [{ keys: "X", detail: "Click a task row, then X to mark done." }]
      };
    case "courses":
      return {
        title: "This screen",
        items: [{ keys: "—", detail: "Shortcuts coming later; use Add and the cards." }]
      };
    case "user-requests":
      return {
        title: "This screen",
        items: [{ keys: "—", detail: "Buttons only for now." }]
      };
    default:
      return null;
  }
}

/** Content for the per-tab Guide drawer. */
export function getTabGuideSheet(view: MainView): { viewLabel: string; sections: TabGuideSection[] } {
  const specific = tabSpecificSection(view);
  const sections: TabGuideSection[] = [];
  if (specific && specific.items.length > 0) sections.push(specific);
  sections.push(GLOBAL_SHORTCUTS);
  return { viewLabel: viewLabel(view), sections };
}
