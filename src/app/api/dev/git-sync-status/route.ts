import { exec } from "node:child_process";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase-server";

const execAsync = promisify(exec);
const ADMIN_EMAILS = new Set(["gidon.greeblatt@gmail.com", "gidon.greenblatt@gmail.com"]);

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
    if (!ADMIN_EMAILS.has(authUser.email.toLowerCase())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { stdout: porcelain } = await execAsync("git status --porcelain");
    let ahead = 0;
    try {
      const { stdout: aheadBehind } = await execAsync("git rev-list --left-right --count @{upstream}...HEAD");
      const parts = aheadBehind.trim().split(/\s+/);
      ahead = Number.parseInt(parts[1] ?? "0", 10);
      if (!Number.isFinite(ahead) || ahead < 0) ahead = 0;
    } catch {
      ahead = 0;
    }
    return NextResponse.json({
      available: true,
      clean: porcelain.trim().length === 0,
      ahead
    });
  } catch {
    return NextResponse.json({
      available: false,
      clean: false,
      ahead: 0
    });
  }
}
