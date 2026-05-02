import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin-emails";
import type { EarlyAccessRequestRow } from "@/lib/early-access-types";
import { getServiceSupabaseClient } from "@/lib/supabase-server";

async function getAuthUserFromRequest(request: NextRequest): Promise<{ id: string; email: string } | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id || !data.user.email) return null;
  return { id: data.user.id, email: data.user.email };
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdminEmail(authUser.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceSupabaseClient();
    const { data: pending, error: pErr } = await supabase
      .from("early_access_requests")
      .select("id,email,message,status,created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }

    const { data: recentGranted, error: gErr } = await supabase
      .from("early_access_requests")
      .select("id,email,message,status,created_at")
      .eq("status", "granted")
      .order("created_at", { ascending: false })
      .limit(40);

    if (gErr) {
      return NextResponse.json({ error: gErr.message }, { status: 500 });
    }

    const requests: EarlyAccessRequestRow[] = [...(pending ?? []), ...(recentGranted ?? [])].map((row) => ({
      id: Number(row.id),
      email: String(row.email),
      message: row.message == null ? null : String(row.message),
      status: String(row.status),
      created_at: String(row.created_at)
    }));

    return NextResponse.json({ requests });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
