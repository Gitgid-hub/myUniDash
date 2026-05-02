"use client";

import { useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { isStealthEarlyAccessEnabled, validateEarlyAccessRequestEmail } from "@/lib/early-access";
import { Button, Panel } from "@/components/ui";

type Mode = "sign-in" | "sign-up";
type StealthPhase = "gate" | "auth";

export function AuthScreen() {
  const stealth = isStealthEarlyAccessEnabled();
  const [stealthPhase, setStealthPhase] = useState<StealthPhase>("gate");
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [earlyMessage, setEarlyMessage] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  async function submitEarlyAccessRequest(event: React.FormEvent) {
    event.preventDefault();
    const err = validateEarlyAccessRequestEmail(email);
    if (err) {
      setMessage(err);
      return;
    }
    setLoading(true);
    setMessage(null);
    setRequestSent(false);
    try {
      const res = await fetch("/api/early-access/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, message: earlyMessage.trim() || undefined })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : "Could not send request.");
      }
      setRequestSent(true);
      setMessage(typeof payload.message === "string" ? payload.message : "Thanks — we will review your request.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not send request.");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setLoading(true);
    setMessage(null);

    if (stealth && mode === "sign-up") {
      try {
        const res = await fetch("/api/early-access/sign-up", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(typeof payload.error === "string" ? payload.error : "Could not create account.");
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        setMessage(error ? error.message : "Signed in.");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Could not create account.");
      } finally {
        setLoading(false);
      }
      return;
    }

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
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo }
    });
    if (error) {
      setMessage(error.message);
      setLoading(false);
    }
  }

  const creatures = (
    <div className="relative mb-4 flex items-end justify-center gap-2">
      <div
        className={`h-11 w-10 rounded-[42%_58%_53%_47%/45%_45%_55%_55%] bg-violet-500/85 transition-all duration-500 ${loading ? "animate-bounce" : "animate-pulse"}`}
      />
      <div
        className={`h-8 w-8 rounded-[50%_50%_45%_55%/45%_55%_45%_55%] bg-amber-400/90 transition-all duration-500 ${loading ? "animate-bounce [animation-delay:120ms]" : "animate-pulse [animation-delay:120ms]"}`}
      />
      <div
        className={`h-10 w-9 rounded-[48%_52%_62%_38%/49%_40%_60%_51%] bg-sky-400/90 transition-all duration-500 ${loading ? "animate-bounce [animation-delay:240ms]" : "animate-pulse [animation-delay:240ms]"}`}
      />
    </div>
  );

  if (stealth && stealthPhase === "gate") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f7f8fa_0%,#f4f5f7_100%)] px-4 dark:bg-[linear-gradient(180deg,#090b0d_0%,#0d1014_100%)]">
        <Panel className="relative w-full max-w-md overflow-hidden bg-white/92 dark:bg-[#101317]/92">
          <div className="pointer-events-none absolute -top-20 left-1/2 h-44 w-44 -translate-x-1/2 rounded-full bg-violet-400/15 blur-3xl dark:bg-violet-400/20" />
          <div className="pointer-events-none absolute -bottom-24 right-0 h-44 w-44 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-400/15" />
          {creatures}
          <h1 className="text-2xl font-semibold tracking-tight">Coming soon</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            School OS is in private beta. Request access with your email — once approved, you can create an account or sign in.
          </p>

          <form onSubmit={submitEarlyAccessRequest} className="mt-6 space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04]"
            />
            <textarea
              value={earlyMessage}
              onChange={(e) => setEarlyMessage(e.target.value)}
              placeholder="Optional: course load, what you are looking for…"
              rows={3}
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-white/10 dark:bg-white/[0.04]"
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Please wait..." : "Request early access"}
            </Button>
          </form>

          {message ? (
            <p className={`mt-3 text-xs ${requestSent ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}>
              {message}
            </p>
          ) : null}

          <div className="mt-6 space-y-2 border-t border-slate-200/80 pt-4 dark:border-white/10">
            <button
              type="button"
              onClick={() => {
                setStealthPhase("auth");
                setMode("sign-in");
                setMessage(null);
                setRequestSent(false);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:hover:bg-white/[0.08]"
            >
              Already approved? Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setStealthPhase("auth");
                setMode("sign-up");
                setMessage(null);
                setRequestSent(false);
              }}
              className="w-full text-sm text-slate-500 underline-offset-2 hover:underline dark:text-slate-400"
            >
              Approved — create password account
            </button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f7f8fa_0%,#f4f5f7_100%)] px-4 dark:bg-[linear-gradient(180deg,#090b0d_0%,#0d1014_100%)]">
      <Panel className="relative w-full max-w-md overflow-hidden bg-white/92 dark:bg-[#101317]/92">
        <div className="pointer-events-none absolute -top-20 left-1/2 h-44 w-44 -translate-x-1/2 rounded-full bg-violet-400/15 blur-3xl dark:bg-violet-400/20" />
        <div className="pointer-events-none absolute -bottom-24 right-0 h-44 w-44 rounded-full bg-sky-300/20 blur-3xl dark:bg-sky-400/15" />
        {creatures}
        {stealth ? (
          <button
            type="button"
            onClick={() => {
              setStealthPhase("gate");
              setMessage(null);
            }}
            className="mb-2 text-left text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            ← Back to coming soon
          </button>
        ) : null}
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
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-white/10">
            <div
              className={`h-full rounded-full bg-gradient-to-r from-sky-400 via-violet-400 to-emerald-300 transition-all duration-500 ${loading ? "w-full opacity-100" : "w-1/3 opacity-70"}`}
            />
          </div>
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
