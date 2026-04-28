"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";

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
          <p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
