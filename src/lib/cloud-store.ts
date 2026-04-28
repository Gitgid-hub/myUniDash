"use client";

import { createSeedState } from "@/lib/seed";
import { pushSchoolOsToast } from "@/lib/global-app-toasts";
import { getSupabaseClient } from "@/lib/supabase";
import type { SchoolState, Store } from "@/lib/types";

const CLOUD_ERROR_TOAST_COOLDOWN_MS = 20_000;
let lastCloudErrorToastAt = 0;
const LEGACY_DEMO_COURSE_CODES = new Set(["72320", "6177", "76632", "6170", "6172", "72368", "76957", "72542"]);

function maybeShowCloudError(message: string): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastCloudErrorToastAt < CLOUD_ERROR_TOAST_COOLDOWN_MS) {
    return;
  }
  lastCloudErrorToastAt = now;
  pushSchoolOsToast({ kind: "error", message });
}

function shouldResetLegacySeedWorkspace(state: SchoolState): boolean {
  if (state.ui?.onboardingCompletedAt) return false;
  if ((state.tasks?.length ?? 0) > 0 || (state.workBlocks?.length ?? 0) > 0 || (state.classNotes?.length ?? 0) > 0) {
    return false;
  }
  const courses = state.courses ?? [];
  if (courses.length !== LEGACY_DEMO_COURSE_CODES.size) return false;
  return courses.every((course) => {
    const code = (course.code ?? "").trim();
    if (!LEGACY_DEMO_COURSE_CODES.has(code)) return false;
    if (course.source) return false;
    if ((course.instructor ?? "").trim().length > 0) return false;
    if ((course.notes ?? "").trim().length > 0) return false;
    return true;
  });
}

export class SupabaseStateStore implements Store {
  constructor(private readonly userId: string) {}

  async getState(): Promise<SchoolState> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return createSeedState();
    }

    const { data, error } = await supabase
      .from("user_states")
      .select("state")
      .eq("user_id", this.userId)
      .maybeSingle();

    if (error) {
      console.error("Failed loading cloud state:", error.message);
      maybeShowCloudError("Cloud sync failed. Showing local data for now.");
      return createSeedState();
    }

    if (data?.state) {
      const loaded = data.state as SchoolState;
      if (shouldResetLegacySeedWorkspace(loaded)) {
        const initial = createSeedState();
        // Non-blocking migration: users who never edited old demo data should see onboarding as first-time users.
        void this.setState(initial).catch(() => {});
        return initial;
      }
      return loaded;
    }

    // First-time cloud user: start clean, do not inherit browser-local data from another account.
    const initial = createSeedState();
    // Do not await upsert — a hung or blocked network would strand the app on "Booting…" forever.
    void this.setState(initial).catch((err) => {
      console.error("Failed seeding empty cloud state (non-fatal):", err instanceof Error ? err.message : err);
    });
    return initial;
  }

  async setState(state: SchoolState): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }

    // During auth transitions (sign-out/sign-in), stale autosaves can race after
    // the session is gone or switched users, which triggers RLS errors.
    const {
      data: { session }
    } = await supabase.auth.getSession();
    if (!session?.user || session.user.id !== this.userId) {
      return;
    }

    const { error } = await supabase
      .from("user_states")
      .upsert(
        {
          user_id: this.userId,
          state,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("Failed saving cloud state:", error.message);
      maybeShowCloudError("Couldn't save to cloud. We'll keep trying in background.");
    }
  }
}
