import { NextRequest, NextResponse } from "next/server";
import { runHujiCatalogIngestion } from "@/lib/catalog/ingest";
import { getServiceSupabaseClient } from "@/lib/supabase-server";

async function ensureAuthenticated(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return false;
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  return Boolean(!error && data.user);
}

export async function POST(request: NextRequest) {
  try {
    const allowed = await ensureAuthenticated(request);
    if (!allowed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
