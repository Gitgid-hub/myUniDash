import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase-server";

type Weekday = "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";
type NormalizedMeeting = {
  weekday: Weekday;
  start_time: string;
  end_time: string;
  meeting_type: string | null;
  location: string | null;
  semester: string | null;
};
type MeetingChoiceOption = {
  optionId: string;
  label: string;
  meetings: NormalizedMeeting[];
};
type MeetingChoiceSet = {
  setId: string;
  label: string;
  options: MeetingChoiceOption[];
};
type HujiMeetingResolution = {
  fixedMeetings: NormalizedMeeting[];
  choiceSets: MeetingChoiceSet[];
};

function msToHm(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function mapHujiDay(day: number | null | undefined): Weekday | null {
  switch (day) {
    case 1:
      return "Mon";
    case 2:
      return "Tue";
    case 3:
      return "Wed";
    case 4:
      return "Thu";
    case 5:
      return "Fri";
    case 6:
      return "Sat";
    case 7:
      return "Sun";
    default:
      return null;
  }
}

async function fetchHujiApi(path: string): Promise<unknown> {
  const res = await fetch(`https://shnaton.huji.ac.il/api${path}`, {
    headers: {
      "user-agent": "myUniDashImporter/1.0",
      accept: "application/json,text/plain,*/*"
    },
    cache: "no-store"
  });
  if (!res.ok) {
    throw new Error(`HUJI API ${path} failed (${res.status})`);
  }
  return await res.json();
}

async function resolveActiveYear(): Promise<number> {
  const raw = await fetchHujiApi("/reference-data/active-years");
  if (!Array.isArray(raw) || raw.length === 0) return new Date().getFullYear();
  const current = raw.find((item) => item && typeof item === "object" && (item as { current?: unknown }).current === true);
  const year = (current as { year?: unknown } | undefined)?.year;
  if (typeof year === "number" && Number.isFinite(year)) return year;
  const firstYear = (raw[0] as { year?: unknown }).year;
  return typeof firstYear === "number" && Number.isFinite(firstYear) ? firstYear : new Date().getFullYear();
}

function extractLocation(session: Record<string, unknown>): string | null {
  const pushUnique = (arr: string[], value: string | null | undefined) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!arr.includes(trimmed)) arr.push(trimmed);
  };

  const asRoomLabel = (roomLike: unknown): string | null => {
    if (!roomLike || typeof roomLike !== "object") return null;
    const room = roomLike as {
      name?: { he?: unknown; en?: unknown };
      userCode?: unknown;
      building?: {
        name?: { he?: unknown; en?: unknown };
      };
    };
    const roomName =
      (typeof room.name?.he === "string" ? room.name.he.trim() : "") ||
      (typeof room.name?.en === "string" ? room.name.en.trim() : "");
    const userCode = typeof room.userCode === "string" ? room.userCode.trim() : "";
    const buildingName =
      (typeof room.building?.name?.he === "string" ? room.building.name.he.trim() : "") ||
      (typeof room.building?.name?.en === "string" ? room.building.name.en.trim() : "");
    const parts: string[] = [];
    pushUnique(parts, roomName);
    if (userCode && (!roomName || !roomName.includes(userCode))) {
      pushUnique(parts, userCode);
    }
    pushUnique(parts, buildingName);
    return parts.length > 0 ? parts.join(", ") : null;
  };

  const displayRoom = session.displayRoom;
  if (typeof displayRoom === "string" && displayRoom.trim().length > 0) {
    return displayRoom.trim();
  }
  const fromDisplayRoomObj = asRoomLabel(displayRoom);
  if (fromDisplayRoomObj) return fromDisplayRoomObj;

  const room = session.room;
  const fromRoomObj = asRoomLabel(room);
  if (fromRoomObj) return fromRoomObj;

  return null;
}

async function fetchHujiMeetingsByCourseCode(courseCode: string, year: number): Promise<HujiMeetingResolution> {
  const rawCourse = await fetchHujiApi(`/courses/code/${encodeURIComponent(courseCode)}?year=${year}&include=1`);
  if (!Array.isArray(rawCourse) || rawCourse.length === 0 || typeof rawCourse[0] !== "object" || !rawCourse[0]) {
    return { fixedMeetings: [], choiceSets: [] };
  }
  const internalCourseId = (rawCourse[0] as { id?: unknown }).id;
  if (typeof internalCourseId !== "number") return { fixedMeetings: [], choiceSets: [] };

  const rawGroups = await fetchHujiApi(`/courses/groups-with-sessions?year=${year}&courseIds=${internalCourseId}`);
  if (!rawGroups || typeof rawGroups !== "object") return { fixedMeetings: [], choiceSets: [] };
  const groups = (rawGroups as Record<string, unknown>)[String(internalCourseId)];
  if (!Array.isArray(groups)) return { fixedMeetings: [], choiceSets: [] };

  const normalizedGroups: Array<{
    optionId: string;
    optionLabel: string;
    setKey: string;
    setLabel: string;
    meetings: NormalizedMeeting[];
  }> = [];
  for (const group of groups) {
    if (!group || typeof group !== "object") continue;
    const sessions = (group as { studySessions?: unknown }).studySessions;
    if (!Array.isArray(sessions)) continue;
    const periodNameHe = ((group as { periodName?: { he?: unknown } }).periodName?.he ?? null);
    const meetingTypeHe = ((group as { studySessionTypeName?: { he?: unknown } }).studySessionTypeName?.he ?? null);
    const meetingType = typeof meetingTypeHe === "string" ? meetingTypeHe : null;
    const semester = typeof periodNameHe === "string" ? periodNameHe : null;
    const groupCode = typeof (group as { code?: unknown }).code === "string" ? (group as { code: string }).code : "";
    const setLabel = [meetingType ?? "Session", semester ?? ""].filter(Boolean).join(" - ");
    const setKey = `${meetingType ?? "session"}|${semester ?? ""}`;
    const optionId = typeof (group as { id?: unknown }).id === "number" ? String((group as { id: number }).id) : groupCode || setKey;
    const optionLabel = groupCode ? `Group ${groupCode}` : `Option ${normalizedGroups.length + 1}`;
    const optionMeetings: NormalizedMeeting[] = [];
    const optionSeen = new Set<string>();

    for (const session of sessions) {
      if (!session || typeof session !== "object") continue;
      const rawDayOfWeek = (session as { dayOfWeek?: unknown }).dayOfWeek;
      const rawStartTime = (session as { startTime?: unknown }).startTime;
      const rawEndTime = (session as { endTime?: unknown }).endTime;
      const weekday = mapHujiDay(typeof rawDayOfWeek === "number" ? rawDayOfWeek : undefined);
      const start = typeof rawStartTime === "number" ? msToHm(rawStartTime) : null;
      const end = typeof rawEndTime === "number" ? msToHm(rawEndTime) : null;
      if (!weekday || !start || !end) continue;

      const location = extractLocation(session as Record<string, unknown>);
      const key = `${weekday}-${start}-${end}-${meetingType ?? ""}-${location ?? ""}-${semester ?? ""}`;
      if (optionSeen.has(key)) continue;
      optionSeen.add(key);
      optionMeetings.push({
        weekday,
        start_time: start,
        end_time: end,
        meeting_type: meetingType,
        location,
        semester
      });
    }
    if (optionMeetings.length > 0) {
      normalizedGroups.push({
        optionId,
        optionLabel,
        setKey,
        setLabel: setLabel || "Session options",
        meetings: optionMeetings
      });
    }
  }

  const groupsBySet = new Map<string, typeof normalizedGroups>();
  for (const group of normalizedGroups) {
    const list = groupsBySet.get(group.setKey) ?? [];
    list.push(group);
    groupsBySet.set(group.setKey, list);
  }

  const fixedMeetings: NormalizedMeeting[] = [];
  const fixedSeen = new Set<string>();
  const choiceSets: MeetingChoiceSet[] = [];
  for (const [setKey, setGroups] of groupsBySet) {
    if (setGroups.length <= 1) {
      for (const meeting of setGroups[0]?.meetings ?? []) {
        const key = `${meeting.weekday}-${meeting.start_time}-${meeting.end_time}-${meeting.meeting_type ?? ""}-${meeting.location ?? ""}-${meeting.semester ?? ""}`;
        if (fixedSeen.has(key)) continue;
        fixedSeen.add(key);
        fixedMeetings.push(meeting);
      }
      continue;
    }
    choiceSets.push({
      setId: setKey,
      label: setGroups[0]?.setLabel ?? "Session options",
      options: setGroups.map((group) => ({
        optionId: group.optionId,
        label: group.optionLabel,
        meetings: group.meetings
      }))
    });
  }
  return { fixedMeetings, choiceSets };
}

async function getUserIdFromRequest(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { source?: string; externalId?: string };
    const source = body.source ?? "huji_shnaton";
    const externalId = body.externalId?.trim();
    if (!externalId) {
      return NextResponse.json({ error: "externalId is required" }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();
    const { data: course, error: courseError } = await supabase
      .from("catalog_courses")
      .select("source, external_id, course_number, name_he, name_en, faculty, department, credits, updated_at")
      .eq("source", source)
      .eq("external_id", externalId)
      .maybeSingle();
    if (courseError || !course) {
      return NextResponse.json({ error: "Catalog course not found" }, { status: 404 });
    }

    const { data: meetings, error: meetingsError } = await supabase
      .from("catalog_meetings")
      .select("weekday,start_time,end_time,meeting_type,location,semester")
      .eq("source", source)
      .eq("course_external_id", externalId);
    if (meetingsError) {
      return NextResponse.json({ error: meetingsError.message }, { status: 500 });
    }

    let resolvedMeetings = meetings ?? [];
    let meetingChoices: MeetingChoiceSet[] = [];
    if (source === "huji_shnaton") {
      try {
        const activeYear = await resolveActiveYear();
        const liveResolution = await fetchHujiMeetingsByCourseCode(course.course_number, activeYear);
        const liveMeetings = liveResolution.fixedMeetings;
        meetingChoices = liveResolution.choiceSets;
        if (liveMeetings.length > 0) {
          await supabase.from("catalog_meetings").upsert(
            liveMeetings.map((meeting) => ({
              source,
              course_external_id: externalId,
              weekday: meeting.weekday,
              start_time: meeting.start_time,
              end_time: meeting.end_time,
              meeting_type: meeting.meeting_type,
              location: meeting.location,
              semester: meeting.semester,
              updated_at: new Date().toISOString()
            })),
            { onConflict: "source,course_external_id,weekday,start_time,end_time,meeting_type,location,semester" }
          );
          resolvedMeetings = liveMeetings;
        }
      } catch {
        // If live fetch fails, keep cached meetings without blocking user.
      }
    }

    await supabase.from("user_imported_courses").upsert({
      user_id: userId,
      source,
      external_id: externalId
    }, { onConflict: "user_id,source,external_id" });

    return NextResponse.json({
      course: {
        source: course.source,
        externalId: course.external_id,
        courseNumber: course.course_number,
        nameHe: course.name_he,
        nameEn: course.name_en,
        faculty: course.faculty,
        department: course.department,
        credits: course.credits,
        updatedAt: course.updated_at
      },
      meetings: resolvedMeetings,
      meetingChoices
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown import error" },
      { status: 500 }
    );
  }
}
