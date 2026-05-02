import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase-server";
import { isStealthEarlyAccessEnabled, normalizeEarlyAccessEmail, validateEarlyAccessRequestEmail } from "@/lib/early-access";

export async function POST(request: NextRequest) {
  if (!isStealthEarlyAccessEnabled()) {
    return NextResponse.json({ error: "Stealth sign-up is not enabled." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const emailRaw = typeof body === "object" && body && "email" in body ? (body as { email?: unknown }).email : undefined;
  const passwordRaw =
    typeof body === "object" && body && "password" in body ? (body as { password?: unknown }).password : undefined;

  const emailErr = validateEarlyAccessRequestEmail(typeof emailRaw === "string" ? emailRaw : "");
  if (emailErr) {
    return NextResponse.json({ error: emailErr }, { status: 400 });
  }

  const password = typeof passwordRaw === "string" ? passwordRaw : "";
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const email = normalizeEarlyAccessEmail(emailRaw as string);

  try {
    const supabase = getServiceSupabaseClient();

    const { data: grant, error: grantErr } = await supabase.from("early_access_grants").select("email").eq("email", email).maybeSingle();

    if (grantErr) {
      return NextResponse.json({ error: grantErr.message }, { status: 500 });
    }
    if (!grant) {
      return NextResponse.json({ error: "This email is not approved for beta access yet." }, { status: 403 });
    }

    const { error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (createErr) {
      const msg = createErr.message.toLowerCase();
      if (msg.includes("already been registered") || msg.includes("already registered") || msg.includes("duplicate")) {
        return NextResponse.json({ error: "An account with this email already exists. Sign in instead." }, { status: 409 });
      }
      return NextResponse.json({ error: createErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown server error";
    if (msg.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json({ error: "Server is not configured for early access." }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
