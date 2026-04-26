import { NextRequest, NextResponse } from "next/server";
import { runHujiCatalogIngestion } from "@/lib/catalog/ingest";
import { getServiceSupabaseClient } from "@/lib/supabase-server";

async function getUserEmailFromRequest(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) return null;
  return data.user.email.trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const userEmail = await getUserEmailFromRequest(request);
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminEmailsRaw = process.env.ADMIN_EMAILS?.trim();
    if (adminEmailsRaw) {
      const allowlist = new Set(
        adminEmailsRaw
          .split(",")
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean)
      );
      if (!allowlist.has(userEmail)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "This endpoint is restricted." }, { status: 403 });
    }

    const result = await runHujiCatalogIngestion();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown ingestion error" },
      { status: 500 }
    );
  }
}
