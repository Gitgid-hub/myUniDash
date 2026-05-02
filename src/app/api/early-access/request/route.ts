import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase-server";
import {
  isStealthEarlyAccessEnabled,
  normalizeEarlyAccessEmail,
  sanitizeEarlyAccessMessage,
  validateEarlyAccessRequestEmail
} from "@/lib/early-access";

export async function POST(request: NextRequest) {
  if (!isStealthEarlyAccessEnabled()) {
    return NextResponse.json({ error: "Early access requests are not enabled." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const emailRaw = typeof body === "object" && body && "email" in body ? (body as { email?: unknown }).email : undefined;
  const messageRaw =
    typeof body === "object" && body && "message" in body ? (body as { message?: unknown }).message : undefined;

  const emailErr = validateEarlyAccessRequestEmail(typeof emailRaw === "string" ? emailRaw : "");
  if (emailErr) {
    return NextResponse.json({ error: emailErr }, { status: 400 });
  }

  const email = normalizeEarlyAccessEmail(emailRaw as string);
  const message =
    typeof messageRaw === "string" ? sanitizeEarlyAccessMessage(messageRaw) : typeof messageRaw === "undefined" ? null : null;

  try {
    const supabase = getServiceSupabaseClient();

    const { data: pending, error: findErr } = await supabase
      .from("early_access_requests")
      .select("id")
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();

    if (findErr) {
      return NextResponse.json({ error: findErr.message }, { status: 500 });
    }

    if (pending?.id != null) {
      const { error: upErr } = await supabase
        .from("early_access_requests")
        .update({ message, created_at: new Date().toISOString() })
        .eq("id", pending.id);
      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
    } else {
      const { error: insErr } = await supabase.from("early_access_requests").insert({
        email,
        message,
        status: "pending"
      });
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, message: "Thanks — we will review your request." });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown server error";
    if (msg.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json({ error: "Server is not configured for early access." }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
