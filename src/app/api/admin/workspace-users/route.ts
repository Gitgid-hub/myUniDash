import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin-emails";
import { getServiceSupabaseClient } from "@/lib/supabase-server";
import type { WorkspaceUserRow } from "@/lib/workspace-user-admin";

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

function maxIso(a: string | null, b: string | null): string | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
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
    const { data: stateRows, error: stateErr } = await supabase.from("user_states").select("user_id, updated_at");
    if (stateErr) {
      return NextResponse.json({ error: stateErr.message }, { status: 500 });
    }
    const workspaceSavedByUser = new Map<string, string>();
    for (const row of stateRows ?? []) {
      const uid = row.user_id as string | undefined;
      const at = row.updated_at as string | undefined;
      if (uid && at) workspaceSavedByUser.set(uid, at);
    }

    const users: WorkspaceUserRow[] = [];
    let page = 1;
    const perPage = 1000;
    for (;;) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const batch = data.users ?? [];
      for (const u of batch) {
        const email = u.email ?? "";
        const workspace_saved_at = workspaceSavedByUser.get(u.id) ?? null;
        const last_sign_in_at = u.last_sign_in_at ?? null;
        const last_activity_at = maxIso(workspace_saved_at, last_sign_in_at);
        users.push({
          id: u.id,
          email,
          created_at: u.created_at ?? null,
          last_sign_in_at,
          workspace_saved_at,
          last_activity_at
        });
      }
      if (batch.length < perPage) break;
      page += 1;
    }

    users.sort((a, b) => (b.last_activity_at ?? "").localeCompare(a.last_activity_at ?? ""));
    return NextResponse.json({ users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json(
        { error: "Server missing SUPABASE_SERVICE_ROLE_KEY — add it in Vercel env for admin APIs." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
