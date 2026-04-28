import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase-server";

const ADMIN_EMAILS = new Set(["gidon.greeblatt@gmail.com", "gidon.greenblatt@gmail.com"]);
const MAX_SCREENSHOTS = 3;
const MAX_SCREENSHOT_DATA_URL_LENGTH = 1_500_000;

type FeatureScreenshot = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

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

function sanitizeScreenshots(raw: unknown): FeatureScreenshot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_SCREENSHOTS)
    .filter((item): item is FeatureScreenshot => {
      if (!item || typeof item !== "object") return false;
      const name = (item as { name?: unknown }).name;
      const mimeType = (item as { mimeType?: unknown }).mimeType;
      const dataUrl = (item as { dataUrl?: unknown }).dataUrl;
      return typeof name === "string" && typeof mimeType === "string" && typeof dataUrl === "string";
    })
    .map((item) => ({
      name: item.name.slice(0, 120),
      mimeType: item.mimeType.slice(0, 100),
      dataUrl: item.dataUrl.slice(0, MAX_SCREENSHOT_DATA_URL_LENGTH)
    }));
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

    const supabase = getServiceSupabaseClient();
    const { data, error } = await supabase
      .from("feature_requests")
      .select("id,user_email,message,screenshots,status,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ requests: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      message?: unknown;
      screenshots?: unknown;
    };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const screenshots = sanitizeScreenshots(body.screenshots);
    const supabase = getServiceSupabaseClient();
    const { error } = await supabase.from("feature_requests").insert({
      user_id: authUser.id,
      user_email: authUser.email,
      message,
      screenshots
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(request);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!ADMIN_EMAILS.has(authUser.email.toLowerCase())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as { id?: unknown };
    const requestId = typeof body.id === "number" ? body.id : Number.parseInt(String(body.id ?? ""), 10);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      return NextResponse.json({ error: "valid id is required" }, { status: 400 });
    }

    const supabase = getServiceSupabaseClient();
    const { error } = await supabase.from("feature_requests").delete().eq("id", requestId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error" },
      { status: 500 }
    );
  }
}
