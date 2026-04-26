import { nowIso } from "@/lib/date";
import { createId } from "@/lib/id";
import type { Course, SchoolState, Task } from "@/lib/types";

const coursePalette = [
  "#1D3FAF",
  "#A23AC8",
  "#4D61E5",
  "#C2189B",
  "#C73707",
  "#D93645",
  "#7B2CBF",
  "#F725B8",
  "#10B981",
  "#0EA5E9",
  "#F59E0B",
  "#84CC16"
];

function meeting(day: Course["meetings"][number]["day"], start: string, end: string, location?: string, title?: string) {
  return {
    id: createId("meeting"),
    day,
    start,
    end,
    location,
    title,
    recurrence: {
      cadence: "weekly" as const,
      interval: 1,
      daysOfWeek: [day]
    },
    seriesId: createId("series")
  };
}

function createCourses(): Course[] {
  const now = nowIso();
  return [
    {
      id: createId("course"),
      code: "72320",
      name: "ביולוגיה התפתחותית: מתא בודד לעובר ולאורגניזם",
      color: coursePalette[0],
      archived: false,
      instructor: "",
      notes: "",
      meetings: [
        meeting("Sun", "10:00", "11:45"),
        meeting("Thu", "10:00", "11:45")
      ],
      grading: [],
      progressMode: "manual",
      manualProgress: 0,
      createdAt: now,
      updatedAt: now
    },
    {
      id: createId("course"),
      code: "6177",
      name: "שיטות מחקר",
      color: coursePalette[3],
      archived: false,
      instructor: "",
      notes: "",
      meetings: [
        meeting("Sun", "12:30", "14:00")
      ],
      grading: [],
      progressMode: "manual",
      manualProgress: 0,
      createdAt: now,
      updatedAt: now
    },
    {
      id: createId("course"),
      code: "76632",
      name: "תכנות מתקדם בפייתון",
      color: coursePalette[7],
      archived: false,
      instructor: "",
      notes: "",
      meetings: [
        meeting("Sun", "16:00", "17:45")
      ],
      grading: [],
      progressMode: "manual",
      manualProgress: 0,
      createdAt: now,
      updatedAt: now
    },
    {
      id: createId("course"),
      code: "6170",
      name: "קוגניציה וחישוביות של בעלי חיים",
      color: coursePalette[6],
      archived: false,
      instructor: "",
      notes: "",
      meetings: [
        meeting("Mon", "14:00", "15:45")
      ],
      grading: [],
      progressMode: "manual",
      manualProgress: 0,
      createdAt: now,
      updatedAt: now
    },
    {
      id: createId("course"),
      code: "6172",
      name: "מודעות ותפיסה",
      color: coursePalette[2],
      archived: false,
      instructor: "",
      notes: "",
      meetings: [
        meeting("Tue", "09:30", "12:00")
      ],
      grading: [],
      progressMode: "manual",
      manualProgress: 0,
      createdAt: now,
      updatedAt: now
    },
    {
      id: createId("course"),
      code: "72368",
      name: "מבוא לאבולוציה",
      color: coursePalette[1],
      archived: false,
      instructor: "",
      notes: "",
      meetings: [
        meeting("Wed", "09:00", "11:45")
      ],
      grading: [],
      progressMode: "manual",
      manualProgress: 0,
      createdAt: now,
      updatedAt: now
    },
    {
      id: createId("course"),
      code: "76957",
      name: "תחלואות המוח ובריאותו",
      color: coursePalette[4],
      archived: false,
      instructor: "",
      notes: "",
      meetings: [
        meeting("Wed", "13:00", "14:45")
      ],
      grading: [],
      progressMode: "manual",
      manualProgress: 0,
      createdAt: now,
      updatedAt: now
    },
    {
      id: createId("course"),
      code: "72542",
      name: "סמינריון מחקרי במדעי החיים סמסטר ב",
      color: coursePalette[5],
      archived: false,
      instructor: "",
      notes: "",
      meetings: [
        meeting("Wed", "15:00", "16:45")
      ],
      grading: [],
      progressMode: "manual",
      manualProgress: 0,
      createdAt: now,
      updatedAt: now
    }
  ];
}

function createTasks(courses: Course[]): Task[] {
  void courses;
  return [];
}

export function createSeedState(): SchoolState {
  const courses = createCourses();
  const tasks = createTasks(courses);

  return {
    courses,
    tasks,
    workBlocks: [],
    classNotes: [],
    reminderSettings: {
      offsetsHours: [168, 72, 24, 2]
    },
    ui: {
      activeView: "dashboard",
      selectedCourseId: "all",
      theme: "system",
      showTaskComposer: false,
      showSearch: false
    }
  };
}
