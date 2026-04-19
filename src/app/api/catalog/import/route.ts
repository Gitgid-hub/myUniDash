import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase-server";

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
    const { data: existing } = await supabase
      .from("user_imported_courses")
      .select("external_id")
      .eq("user_id", userId)
      .eq("source", source)
      .eq("external_id", externalId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "Course already imported" }, { status: 409 });
    }

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

    await supabase.from("user_imported_courses").insert({
      user_id: userId,
      source,
      external_id: externalId
    });

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
      meetings: meetings ?? []
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown import error" },
      { status: 500 }
    );
  }
}
