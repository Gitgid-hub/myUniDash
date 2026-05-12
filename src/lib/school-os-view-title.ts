import type { MainView } from "@/lib/types";

export function schoolOsViewTitle(view: MainView): string {
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
