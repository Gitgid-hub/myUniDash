import { NextRequest, NextResponse } from "next/server";
import { buildSchoolSessionsIcs } from "@/lib/ical-export";
import { getServiceSupabaseClient } from "@/lib/supabase-server";
import type { Course, PersonalEvent, SchoolState } from "@/lib/types";

function isUuidLike(token: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token);
}

function coursesFromStatePayload(raw: unknown): Course[] {
  if (!raw || typeof raw !== "object") return [];
  const state = raw as Partial<SchoolState>;
  return Array.isArray(state.courses) ? state.courses : [];
}

function personalEventsFromStatePayload(raw: unknown): PersonalEvent[] {
  if (!raw || typeof raw !== "object") return [];
  const state = raw as Partial<SchoolState>;
  return Array.isArray(state.personalEvents) ? state.personalEvents : [];
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  if (!token || !isUuidLike(token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getServiceSupabaseClient();
  } catch {
    return NextResponse.json({ error: "Calendar feed is not configured on this server." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("user_states")
    .select("state")
    .contains("state", { ui: { calendarFeedToken: token } } as Record<string, unknown>)
    .maybeSingle();

  if (error) {
    console.error("calendar/sessions lookup:", error.message);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }

  if (!data?.state) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const courses = coursesFromStatePayload(data.state);
  const personalEvents = personalEventsFromStatePayload(data.state);
  const { text, eventCount } = buildSchoolSessionsIcs(courses, new Date(), personalEvents);

  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      "X-School-OS-Event-Count": String(eventCount)
    }
  });
}
