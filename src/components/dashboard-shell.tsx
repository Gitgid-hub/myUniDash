"use client";

import { useEffect, useMemo, useState } from "react";
import { SchoolOS } from "@/components/school-os";
import { AuthScreen } from "@/components/auth-screen";
import { Button, Panel } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { SupabaseStateStore } from "@/lib/cloud-store";
import { LocalStorageStore } from "@/lib/storage";
import { SchoolStoreProvider } from "@/lib/store";
import { getSupabaseClient } from "@/lib/supabase";
import type { Store } from "@/lib/types";

const AUTH_SPLASH_MIN_MS = 3000;

export function DashboardShell() {
  const { enabled, loading, user } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [authSplashMinElapsed, setAuthSplashMinElapsed] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setAuthSplashMinElapsed(true);
      return;
    }
    setAuthSplashMinElapsed(false);
    const id = window.setTimeout(() => setAuthSplashMinElapsed(true), AUTH_SPLASH_MIN_MS);
    return () => window.clearTimeout(id);
  }, [enabled]);

  const store = useMemo<Store>(() => {
    if (enabled && user) {
      return new SupabaseStateStore(user.id);
    }
    return new LocalStorageStore();
  }, [enabled, user]);

  if (enabled && (loading || !authSplashMinElapsed)) {
    return (
      <div className="flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 text-center text-slate-100">
        <div className="relative">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-500/10 blur-3xl" />
          <div className="relative rounded-3xl border border-white/10 bg-white/[0.03] px-8 py-7 shadow-[0_20px_80px_rgba(2,132,199,0.2)] backdrop-blur-md">
            <div className="mx-auto flex w-fit items-end gap-2">
              <div className="relative h-16 w-14 animate-pulse rounded-[42%_58%_53%_47%/45%_45%_55%_55%] bg-violet-500">
                <span className="absolute left-4 top-5 h-1.5 w-1.5 rounded-full bg-slate-950/80" />
                <span className="absolute right-4 top-5 h-1.5 w-1.5 rounded-full bg-slate-950/80" />
              </div>
              <div className="relative h-11 w-10 animate-bounce rounded-[50%_50%_45%_55%/45%_55%_45%_55%] bg-amber-400">
                <span className="absolute left-3 top-4 h-1.5 w-1.5 rounded-full bg-slate-950/70" />
                <span className="absolute right-3 top-4 h-1.5 w-1.5 rounded-full bg-slate-950/70" />
              </div>
              <div className="relative h-14 w-12 animate-pulse rounded-[48%_52%_62%_38%/49%_40%_60%_51%] bg-sky-400">
                <span className="absolute left-3.5 top-7 h-1.5 w-1.5 rounded-full bg-slate-950/80" />
                <span className="absolute right-3.5 top-7 h-1.5 w-1.5 rounded-full bg-slate-950/80" />
              </div>
            </div>
            <p className="mt-5 text-lg font-medium tracking-wide text-slate-100">Ready!</p>
            <div className="mt-2 flex items-center justify-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-300 [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-300 [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-300 [animation-delay:240ms]" />
            </div>
            <div className="mx-auto mt-4 h-1.5 w-44 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-full animate-pulse rounded-full bg-gradient-to-r from-sky-400 via-violet-400 to-emerald-300 opacity-90" />
            </div>
            <p className="mt-3 max-w-md text-sm text-slate-400">Notes aligned. Tasks armed. Let&apos;s have a day.</p>
          </div>
        </div>
      </div>
    );
  }

  if (isSigningOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-sm text-slate-300">
        Signing out...
      </div>
    );
  }

  if (enabled && !user) {
    return <AuthScreen />;
  }

  const accountLabel = user?.email ?? "Signed in";

  async function handleSignOut() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setIsSigningOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div>
      {enabled && user && (
        <div className="mx-auto max-w-[1560px] px-5 pt-4">
          <Panel className="bg-white/90 py-2 dark:bg-[#101317]/90" data-onboarding="account-panel">
            <div className="flex items-center gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-400">Account</p>
                <p className="max-w-[260px] truncate text-sm text-slate-700 dark:text-slate-200">{accountLabel}</p>
              </div>
              <Button variant="outline" className="h-8 px-3 text-xs" onClick={handleSignOut} disabled={isSigningOut}>
                {isSigningOut ? "Signing out..." : "Sign out"}
              </Button>
            </div>
          </Panel>
        </div>
      )}
      <SchoolStoreProvider store={store} key={enabled && user ? user.id : "local"}>
        <SchoolOS />
      </SchoolStoreProvider>
    </div>
  );
}
