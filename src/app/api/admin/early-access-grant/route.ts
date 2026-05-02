import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin-emails";
import { normalizeEarlyAccessEmail, validateEarlyAccessRequestEmail } from "@/lib/early-access";
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

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isAdminEmail(authUser.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const emailRaw = typeof body === "object" && body && "email" in body ? (body as { email?: unknown }).email : undefined;
    const emailErr = validateEarlyAccessRequestEmail(typeof emailRaw === "string" ? emailRaw : "");
    if (emailErr) {
      return NextResponse.json({ error: emailErr }, { status: 400 });
    }

    const email = normalizeEarlyAccessEmail(emailRaw as string);
    const supabase = getServiceSupabaseClient();

    const { error: grantErr } = await supabase.from("early_access_grants").upsert(
      {
        email,
        granted_by: authUser.email,
        granted_at: new Date().toISOString()
      },
      { onConflict: "email" }
    );

    if (grantErr) {
      return NextResponse.json({ error: grantErr.message }, { status: 500 });
    }

    const { error: upErr } = await supabase.from("early_access_requests").update({ status: "granted" }).eq("email", email).eq("status", "pending");

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json({ error: "Server missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
