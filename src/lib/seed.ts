import type { SchoolState } from "@/lib/types";

export function createSeedState(): SchoolState {
  return {
    courses: [],
    tasks: [],
    workBlocks: [],
    classNotes: [],
    personalEvents: [],
    reminderSettings: {
      offsetsHours: [336, 168, 72, 24, 2]
    },
    ui: {
      activeView: "dashboard",
      selectedCourseId: "all",
      theme: "system",
      showTaskComposer: false,
      showSearch: false,
      weeklyCatchUpAutoPrompt: true,
      appleCalendarAutoSync: false
    }
  };
}
