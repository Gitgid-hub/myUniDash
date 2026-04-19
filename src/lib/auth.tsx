"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const enabled = isSupabaseConfigured();
  const [loading, setLoading] = useState(enabled);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    // Never block the shell forever — createClient / getSession / onAuthStateChange can throw or hang.
    const hardCap = window.setTimeout(() => {
      console.warn("Supabase auth: forcing loading off (init took > 3.5s).");
      setLoading(false);
    }, 3_500);

    let mounted = true;
    const safetyTimer = window.setTimeout(() => {
      if (!mounted) return;
      console.warn("Supabase auth: getSession took too long; continuing without session.");
      setLoading(false);
    }, 10_000);

    const clearSafety = () => window.clearTimeout(safetyTimer);
    const clearHard = () => window.clearTimeout(hardCap);

    const stopBlockingUi = () => {
      clearSafety();
      clearHard();
      setLoading(false);
    };

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        if (mounted) setSession(null);
        stopBlockingUi();
        return;
      }

      supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (!mounted) return;
          if (error) {
            console.error("Supabase getSession failed:", error.message);
            setSession(null);
          } else {
            setSession(data.session ?? null);
          }
          stopBlockingUi();
        })
        .catch((err: unknown) => {
          console.error("Supabase getSession error:", err);
          if (!mounted) return;
          setSession(null);
          stopBlockingUi();
        });

      let subscription: { subscription: { unsubscribe: () => void } };
      try {
        subscription = supabase.auth.onAuthStateChange((_event, nextSession) => {
          if (!mounted) return;
          setSession(nextSession);
          stopBlockingUi();
        });
      } catch (subErr) {
        console.error("Supabase onAuthStateChange failed:", subErr);
        stopBlockingUi();
        return () => {
          mounted = false;
          clearSafety();
          clearHard();
        };
      }

      return () => {
        mounted = false;
        clearSafety();
        clearHard();
        subscription.subscription.unsubscribe();
      };
    } catch (err) {
      console.error("Supabase auth setup failed:", err);
      clearSafety();
      clearHard();
      if (mounted) setSession(null);
      setLoading(false);
      return undefined;
    }
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
