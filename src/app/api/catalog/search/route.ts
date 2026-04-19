import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    const supabase = getServiceSupabaseClient();
    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(30, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? "15")));

    let base = supabase
      .from("catalog_courses")
      .select("source, external_id, course_number, name_he, name_en, faculty, department, credits, last_seen_at")
      .eq("source", "huji_shnaton")
      .order("course_number", { ascending: true })
      .limit(limit);

    if (query) {
      base = base.or(`course_number.ilike.%${query}%,name_he.ilike.%${query}%,name_en.ilike.%${query}%`);
    }

    const { data: courses, error } = await base;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const externalIds = (courses ?? []).map((course) => course.external_id);
    const meetingsMap = new Map<string, Array<Record<string, unknown>>>();
    if (externalIds.length > 0) {
      const { data: meetings, error: meetingError } = await supabase
        .from("catalog_meetings")
        .select("course_external_id,weekday,start_time,end_time,meeting_type,location,semester")
        .eq("source", "huji_shnaton")
        .in("course_external_id", externalIds);
      if (meetingError) {
        return NextResponse.json({ error: meetingError.message }, { status: 500 });
      }
      for (const meeting of meetings ?? []) {
        const arr = meetingsMap.get(meeting.course_external_id) ?? [];
        arr.push(meeting);
        meetingsMap.set(meeting.course_external_id, arr);
      }
    }

    const { data: latestSync } = await supabase
      .from("catalog_sync_runs")
      .select("completed_at, fetched_count")
      .eq("source", "huji_shnaton")
      .eq("scope", "life_sciences_biology")
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      courses: (courses ?? []).map((course) => ({
        source: course.source,
        externalId: course.external_id,
        courseNumber: course.course_number,
        nameHe: course.name_he,
        nameEn: course.name_en,
        faculty: course.faculty,
        department: course.department,
        credits: course.credits,
        lastSeenAt: course.last_seen_at,
        meetings: meetingsMap.get(course.external_id) ?? []
      })),
      freshness: {
        lastCompletedAt: latestSync?.completed_at ?? null,
        fetchedCount: latestSync?.fetched_count ?? 0
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
