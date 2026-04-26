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

export function DashboardShell() {
  const { enabled, loading, user } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  /**
   * Wall-clock bypass: must NOT depend on `loading` (when loading flips false, an effect cleanup
   * would cancel this timer and never reschedule — you can stay on "Connecting…" forever).
   */
  const [authWallExpired, setAuthWallExpired] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setAuthWallExpired(true), 4_000);
    return () => window.clearTimeout(id);
  }, []);

  const store = useMemo<Store>(() => {
    if (enabled && user) {
      return new SupabaseStateStore(user.id);
    }
    return new LocalStorageStore();
  }, [enabled, user]);

  const blockOnAuth = loading && !authWallExpired;

  if (blockOnAuth) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-center text-slate-100"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#020617",
          color: "#f1f5f9"
        }}
      >
        <div>
          <p className="animate-pulse text-lg">Connecting…</p>
          <p className="mt-3 max-w-md text-sm text-slate-400" style={{ color: "#94a3b8", marginTop: "12px", fontSize: "14px" }}>
            After ~4s this screen clears automatically. If sign-in still fails: use the legacy{" "}
            <strong className="text-slate-200">anon</strong> JWT for{" "}
            <code className="rounded bg-white/10 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> (starts with{" "}
            <code className="rounded bg-white/10 px-1">eyJ</code>), or set{" "}
            <code className="rounded bg-white/10 px-1">NEXT_PUBLIC_SCHOOL_OS_OFFLINE=true</code> to run local-only, then restart{" "}
            <code className="rounded bg-white/10 px-1">npm run dev</code>.
          </p>
        </div>
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
    await supabase.auth.signOut();
    setIsSigningOut(false);
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
