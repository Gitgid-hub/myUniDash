"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";
import { isStealthEarlyAccessEnabled } from "@/lib/early-access";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function completeOAuth() {
      const supabase = getSupabaseClient();
      if (!supabase) {
        if (!mounted) return;
        setError("Auth client is not configured.");
        return;
      }

      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }
        }

        if (isStealthEarlyAccessEnabled()) {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;
          if (token) {
            const res = await fetch("/api/early-access/session", {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store"
            });
            const payload = await res.json().catch(() => ({}));
            if (res.ok && payload && payload.granted === false) {
              await supabase.auth.signOut();
              if (!mounted) return;
              setError(
                "This Google account is not approved for beta access yet. Go back to the app, use Request early access, then try Google sign-in again after you are approved."
              );
              return;
            }
          }
        }

        router.replace("/dashboard");
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Could not complete Google sign-in.");
      }
    }

    void completeOAuth();
    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
        <h1 className="text-lg font-semibold">Signing you in...</h1>
        <p className="mt-2 text-sm text-slate-400">Finalizing Google authentication and redirecting to your dashboard.</p>
        {error ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
            <button
              type="button"
              onClick={() => router.replace("/dashboard")}
              className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-white/15"
            >
              Back to sign in
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
