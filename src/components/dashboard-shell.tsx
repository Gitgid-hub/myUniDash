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

  const store = useMemo<Store>(() => {
    if (enabled && user) {
      return new SupabaseStateStore(user.id);
    }
    return new LocalStorageStore();
  }, [enabled, user]);

  if ((enabled && loading) || isSigningOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-sm text-slate-300">
        Loading...
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
