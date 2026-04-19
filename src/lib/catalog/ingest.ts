import { fetchHujiLifeSciencesCatalog } from "@/lib/catalog/huji-provider";
import type { CatalogCourse } from "@/lib/catalog/types";
import { getServiceSupabaseClient } from "@/lib/supabase-server";

const SOURCE = "huji_shnaton";
const SCOPE = "life_sciences_biology";

function toDbCourse(course: CatalogCourse) {
  return {
    source: course.source,
    external_id: course.externalId,
    course_number: course.courseNumber,
    name_he: course.nameHe ?? null,
    name_en: course.nameEn ?? null,
    faculty: course.faculty ?? null,
    department: course.department ?? null,
    credits: course.credits ?? null,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function toDbMeetings(course: CatalogCourse) {
  return course.meetings.map((meeting) => ({
    source: course.source,
    course_external_id: course.externalId,
    weekday: meeting.weekday,
    start_time: meeting.startTime,
    end_time: meeting.endTime,
    meeting_type: meeting.meetingType ?? null,
    location: meeting.location ?? null,
    semester: meeting.semester ?? null,
    updated_at: new Date().toISOString()
  }));
}

export async function runHujiCatalogIngestion(): Promise<{ fetchedCount: number; completedAt: string }> {
  const supabase = getServiceSupabaseClient();
  const startedAt = new Date().toISOString();

  const { data: runRow } = await supabase
    .from("catalog_sync_runs")
    .insert({ source: SOURCE, scope: SCOPE, status: "running", started_at: startedAt })
    .select("id")
    .single();

  const runId = runRow?.id as number | undefined;

  try {
    const courses = await fetchHujiLifeSciencesCatalog();
    const courseRows = courses.map(toDbCourse);

    if (courseRows.length > 0) {
      await supabase.from("catalog_courses").upsert(courseRows, { onConflict: "source,external_id" });
    }

    const meetingRows = courses.flatMap(toDbMeetings);
    if (meetingRows.length > 0) {
      await supabase.from("catalog_meetings").upsert(meetingRows, {
        onConflict: "source,course_external_id,weekday,start_time,end_time,meeting_type,location,semester"
      });
    }

    const completedAt = new Date().toISOString();
    if (runId) {
      await supabase
        .from("catalog_sync_runs")
        .update({
          status: "completed",
          fetched_count: courses.length,
          completed_at: completedAt
        })
        .eq("id", runId);
    }
    return { fetchedCount: courses.length, completedAt };
  } catch (error) {
    if (runId) {
      await supabase
        .from("catalog_sync_runs")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : "Unknown error",
          completed_at: new Date().toISOString()
        })
        .eq("id", runId);
    }
    throw error;
  }
}
