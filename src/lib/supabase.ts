"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Set to `1` or `true` in `.env.local` to run fully local (no Supabase auth, no cloud sync).
 * Use this if auth hangs while you fix API keys in the Supabase dashboard.
 */
export function isSupabaseConfigured(): boolean {
  const offline = process.env.NEXT_PUBLIC_SCHOOL_OS_OFFLINE?.trim().toLowerCase();
  if (offline === "1" || offline === "true" || offline === "yes") {
    return false;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return Boolean(url && key);
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();
    if (typeof window !== "undefined" && key.startsWith("sb_publishable_")) {
      console.warn(
        "[School OS] Using a publishable key (sb_publishable_…). If auth hangs, switch NEXT_PUBLIC_SUPABASE_ANON_KEY to the legacy anon JWT (starts with eyJ…) from Supabase → Settings → API → Legacy API keys, then restart `npm run dev`."
      );
    }
    try {
      client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
    } catch (err) {
      console.error("Supabase createClient failed (check NEXT_PUBLIC_SUPABASE_URL / ANON_KEY):", err);
      return null;
    }
  }
  return client;
}
