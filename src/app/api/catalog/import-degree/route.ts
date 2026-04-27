import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase-server";

type DegreeId = "biology" | "linguistics";

type RoadmapCourseCandidate = {
  courseNumber: string;
  title: string;
  roadmapYearLabel?: string;
  roadmapSectionLabel?: string;
};

const DEGREE_ROADMAP_CODES: Record<DegreeId, string> = {
  biology: process.env.HUJI_ROADMAP_BIOLOGY_CODE ?? "570-4010",
  linguistics: process.env.HUJI_ROADMAP_181_CODE ?? "181-1751"
};

function extractNumber(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 4 || digits.length > 8) return null;
  return digits;
}

function asText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
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

async function fetchHujiApi(path: string): Promise<unknown> {
  const res = await fetch(`https://shnaton.huji.ac.il/api${path}`, {
    headers: {
      "user-agent": "myUniDashDegreeImporter/1.0",
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

async function fetchRoadmapCourses(roadmapCode: string, year: number): Promise<RoadmapCourseCandidate[]> {
  const searchParams = new URLSearchParams({ name: roadmapCode, year: String(year) });
  const rawSearch = await fetchHujiApi(`/yearly-roadmaps/search?${searchParams.toString()}`);
  if (!Array.isArray(rawSearch)) return [];
  const roadmapRow = rawSearch.find((row) => {
    if (!row || typeof row !== "object") return false;
    return asText((row as { roadmapCode?: unknown }).roadmapCode) === roadmapCode;
  }) as { id?: unknown } | undefined;
  const yearlyRoadmapId = roadmapRow?.id;
  if (typeof yearlyRoadmapId !== "number") return [];

  const thresholdParams = new URLSearchParams({
    year: String(year),
    activeYear: String(year),
    thresholdYear: String(year)
  });
  const rawThresholds = await fetchHujiApi(`/yearly-roadmaps/${yearlyRoadmapId}/thresholds?${thresholdParams.toString()}`);
  if (!Array.isArray(rawThresholds)) return [];

  const out = new Map<string, RoadmapCourseCandidate>();
  for (const threshold of rawThresholds) {
    if (!threshold || typeof threshold !== "object") continue;
    const displayAcademicYear = asText((threshold as { displayAcademicYear?: unknown }).displayAcademicYear);
    const fromToAcademicYear = (threshold as { fromToAcademicYear?: unknown }).fromToAcademicYear;
    const firstAcademicYear =
      Array.isArray(fromToAcademicYear) && fromToAcademicYear.length > 0 && typeof fromToAcademicYear[0] === "number"
        ? fromToAcademicYear[0]
        : null;
    const roadmapYearLabel =
      displayAcademicYear ||
      (firstAcademicYear !== null ? `Year ${firstAcademicYear}` : "");
    const roadmapSectionLabel = asText((threshold as { subChapter?: unknown }).subChapter);

    const courses = (threshold as { courses?: unknown }).courses;
    if (!Array.isArray(courses)) continue;
    for (const course of courses) {
      if (!course || typeof course !== "object") continue;
      const code = extractNumber(asText((course as { code?: unknown }).code));
      if (!code) continue;
      const nameObj = (course as { name?: unknown }).name;
      const title =
        (nameObj && typeof nameObj === "object" && asText((nameObj as { he?: unknown }).he)) ||
        (nameObj && typeof nameObj === "object" && asText((nameObj as { en?: unknown }).en)) ||
        `Course ${code}`;
      if (!out.has(code)) {
        out.set(code, {
          courseNumber: code,
          title,
          roadmapYearLabel: roadmapYearLabel || undefined,
          roadmapSectionLabel: roadmapSectionLabel || undefined
        });
      }
    }
  }
  return [...out.values()];
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { degreeId?: string };
    const degreeId = (body.degreeId ?? "biology") as DegreeId;
    if (!(degreeId in DEGREE_ROADMAP_CODES)) {
      return NextResponse.json({ error: "Unsupported degreeId" }, { status: 400 });
    }

    const activeYear = await resolveActiveYear();
    const roadmapCode = DEGREE_ROADMAP_CODES[degreeId];
    const roadmapCourses = await fetchRoadmapCourses(roadmapCode, activeYear);
    if (roadmapCourses.length === 0) {
      return NextResponse.json({ error: "No courses found in roadmap API response" }, { status: 404 });
    }

    const numbers = roadmapCourses.map((course) => course.courseNumber);
    const supabase = getServiceSupabaseClient();
    const { data: catalogRows } = await supabase
      .from("catalog_courses")
      .select("source, external_id, course_number, name_he, name_en, faculty, department, credits, updated_at")
      .eq("source", "huji_shnaton")
      .in("course_number", numbers);

    const byNumber = new Map<string, (typeof catalogRows extends Array<infer T> ? T : never)>();
    for (const row of catalogRows ?? []) {
      byNumber.set(row.course_number, row);
    }

    const missingRows = roadmapCourses
      .filter((course) => !byNumber.has(course.courseNumber))
      .map((course) => ({
        source: "huji_shnaton",
        external_id: course.courseNumber,
        course_number: course.courseNumber,
        name_he: course.title,
        name_en: null,
        faculty: null,
        department: null,
        credits: null,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

    if (missingRows.length > 0) {
      await supabase.from("catalog_courses").upsert(missingRows, { onConflict: "source,external_id" });
      for (const row of missingRows) {
        byNumber.set(row.course_number, row);
      }
    }

    const selectedRows = roadmapCourses
      .map((course) => byNumber.get(course.courseNumber))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const externalIds = selectedRows.map((row) => row.external_id);
    const { data: meetings } = await supabase
      .from("catalog_meetings")
      .select("course_external_id,weekday,start_time,end_time,meeting_type,location,semester")
      .eq("source", "huji_shnaton")
      .in("course_external_id", externalIds);

    const meetingsMap = new Map<string, Array<Record<string, unknown>>>();
    for (const meeting of meetings ?? []) {
      const list = meetingsMap.get(meeting.course_external_id) ?? [];
      list.push(meeting);
      meetingsMap.set(meeting.course_external_id, list);
    }

    const roadmapMetaByNumber = new Map(
      roadmapCourses.map((course) => [course.courseNumber, course])
    );

    return NextResponse.json({
      degreeId,
      roadmapCode,
      activeYear,
      courses: selectedRows.map((row) => ({
        ...(roadmapMetaByNumber.get(row.course_number) ?? {}),
        source: row.source,
        externalId: row.external_id,
        courseNumber: row.course_number,
        nameHe: row.name_he,
        nameEn: row.name_en,
        faculty: row.faculty,
        department: row.department,
        credits: row.credits,
        updatedAt: row.updated_at,
        meetings: meetingsMap.get(row.external_id) ?? []
      }))
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown degree import error" },
      { status: 500 }
    );
  }
}
