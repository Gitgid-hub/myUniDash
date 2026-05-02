import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase-server";
import { normalizeEarlyAccessEmail } from "@/lib/early-access";

async function getAuthEmailFromBearer(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

export async function GET(request: NextRequest) {
  try {
    const email = await getAuthEmailFromBearer(request);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceSupabaseClient();
    const key = normalizeEarlyAccessEmail(email);
    const { data: grant, error } = await supabase.from("early_access_grants").select("email").eq("email", key).maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ granted: Boolean(grant) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown server error";
    if (msg.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json({ error: "Server is not configured." }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
