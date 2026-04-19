"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { Button, Panel } from "@/components/ui";

type Mode = "sign-in" | "sign-up";

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setLoading(true);
    setMessage(null);

    if (mode === "sign-up") {
      const { error } = await supabase.auth.signUp({ email, password });
      setMessage(error ? error.message : "Account created. Check email if confirmation is enabled.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMessage(error ? error.message : "Signed in.");
    setLoading(false);
  }

  async function onGoogleSignIn() {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setLoading(true);
    setMessage(null);
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo }
    });
    if (error) {
      setMessage(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f7f8fa_0%,#f4f5f7_100%)] px-4 dark:bg-[linear-gradient(180deg,#090b0d_0%,#0d1014_100%)]">
      <Panel className="w-full max-w-md bg-white/92 dark:bg-[#101317]/92">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to School OS</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sign in to sync your dashboard across devices.</p>

        <Button type="button" variant="outline" className="mt-6 w-full" onClick={onGoogleSignIn} disabled={loading}>
          Continue with Google
        </Button>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200/90 dark:bg-white/10" />
          <span className="text-[11px] uppercase tracking-wide text-slate-400">or</span>
          <div className="h-px flex-1 bg-slate-200/90 dark:bg-white/10" />
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04]"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04]"
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Please wait..." : mode === "sign-in" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setMode((m) => (m === "sign-in" ? "sign-up" : "sign-in"))}
          className="mt-3 text-sm text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
        >
          {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>

        {message && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{message}</p>}
      </Panel>
    </div>
  );
}
