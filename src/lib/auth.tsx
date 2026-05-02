"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, Subscription, User } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

interface AuthContextValue {
  enabled: boolean;
  loading: boolean;
  user: User | null;
  session: Session | null;
}

const AuthContext = createContext<AuthContextValue>({
  enabled: false,
  loading: false,
  user: null,
  session: null
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const enabled = isSupabaseConfigured();
  const [loading, setLoading] = useState(enabled);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let mounted = true;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setSession(null);
      setLoading(false);
      return;
    }

    let authSubscription: Subscription | null = null;
    try {
      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (!mounted) return;
        setSession(nextSession);
        setLoading(false);
      });
      authSubscription = data.subscription;
    } catch (subErr) {
      console.error("Supabase onAuthStateChange failed:", subErr);
      setLoading(false);
      return;
    }

    const sessionPromise = supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          console.error("Supabase getSession failed:", error.message);
          setSession(null);
        } else {
          setSession(data.session ?? null);
        }
      })
      .catch((err: unknown) => {
        console.error("Supabase getSession error:", err);
        if (!mounted) return;
        setSession(null);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    void (async () => {
      try {
        await Promise.race([sessionPromise, delay(3_500)]);
      } catch {
        // sessionPromise rejected — loading still cleared in .finally above
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
      mounted = false;
      authSubscription?.unsubscribe();
    };
  }, [enabled]);

  const value = useMemo<AuthContextValue>(
    () => ({
      enabled,
      loading,
      user: session?.user ?? null,
      session
    }),
    [enabled, loading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
