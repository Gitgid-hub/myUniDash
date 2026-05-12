"use client";

/**
 * Signed-in workspace persistence: `user_states.state` in Supabase is the source of truth.
 * This module intentionally blocks a narrow class of client bugs (empty snapshot right after a
 * non-empty load) from upserting over real data. Product code should never call `Store` with a
 * fabricated empty state to “reset” a user — use explicit account flows and server rules instead.
 * Enable Supabase backups / PITR for disaster recovery; client guards are not a substitute.
 */

import { createSeedState } from "@/lib/seed";
import { pushSchoolOsToast } from "@/lib/global-app-toasts";
import { getSupabaseClient } from "@/lib/supabase";
import type { SchoolState, Store } from "@/lib/types";
import { isWorkspaceDataEmpty, workspaceDataFootprint } from "@/lib/workspace-data-footprint";

const CLOUD_ERROR_TOAST_COOLDOWN_MS = 20_000;
/** After loading non-empty cloud data, refuse a completely empty upsert for this long (ms). */
const HYDRATION_EMPTY_WRITE_GUARD_MS = 15_000;

let lastCloudErrorToastAt = 0;
let lastEmptyWriteBlockedToastAt = 0;
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

  /** Footprint of the last successful cloud read (or 0 if new / reset). */
  private loadFootprint = 0;
  /** Monotonic deadline: while `Date.now() < emptyWriteGuardUntil`, block all-empty upserts if loadFootprint > 0. */
  private emptyWriteGuardUntil = 0;

  async getState(): Promise<SchoolState> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      // Same as load errors: must reject so SchoolStoreProvider does not enable autosave and push an
      // empty seed over a real cloud row when the client is briefly unavailable.
      throw new Error("Supabase client unavailable");
    }

    const { data, error } = await supabase
      .from("user_states")
      .select("state")
      .eq("user_id", this.userId)
      .maybeSingle();

    if (error) {
      console.error("Failed loading cloud state:", error.message);
      maybeShowCloudError("Cloud sync failed. Showing local data for now.");
      // Must reject: SchoolStoreProvider treats a resolved getState() as a successful load and enables
      // autosave — returning an empty seed here would overwrite the user's real row in user_states.
      throw new Error(`Failed loading cloud state: ${error.message}`);
    }

    if (data?.state) {
      const loaded = data.state as SchoolState;
      if (shouldResetLegacySeedWorkspace(loaded)) {
        const fresh = createSeedState();
        // Replace the legacy demo row in the database immediately so we never rely on a later
        // client autosave (which could be blocked or lost) to persist the reset.
        try {
          await this.writeUserStateRow(fresh, { bypassEmptyWriteGuard: true });
        } catch (err) {
          console.error("Legacy workspace reset upsert failed:", err instanceof Error ? err.message : err);
        }
        this.loadFootprint = 0;
        this.emptyWriteGuardUntil = 0;
        return fresh;
      }
      this.loadFootprint = workspaceDataFootprint(loaded);
      this.emptyWriteGuardUntil = Date.now() + HYDRATION_EMPTY_WRITE_GUARD_MS;
      return loaded;
    }

    // First-time cloud user: start clean, do not inherit browser-local data from another account.
    const initial = createSeedState();
    this.loadFootprint = 0;
    this.emptyWriteGuardUntil = 0;
    // Do not await upsert — a hung or blocked network would strand the app on "Booting…" forever.
    void this.writeUserStateRow(initial, { bypassEmptyWriteGuard: true }).catch((err) => {
      console.error("Failed seeding empty cloud state (non-fatal):", err instanceof Error ? err.message : err);
    });
    return initial;
  }

  async setState(state: SchoolState): Promise<void> {
    await this.writeUserStateRow(state, { bypassEmptyWriteGuard: false });
  }

  private async writeUserStateRow(
    state: SchoolState,
    opts: { bypassEmptyWriteGuard: boolean }
  ): Promise<void> {
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

    if (
      !opts.bypassEmptyWriteGuard &&
      this.loadFootprint > 0 &&
      Date.now() < this.emptyWriteGuardUntil &&
      isWorkspaceDataEmpty(state)
    ) {
      console.warn(
        "[School OS] Blocked Supabase upsert: workspace snapshot is completely empty shortly after loading non-empty cloud data (likely a client race or bug)."
      );
      const now = Date.now();
      if (now - lastEmptyWriteBlockedToastAt > CLOUD_ERROR_TOAST_COOLDOWN_MS) {
        lastEmptyWriteBlockedToastAt = now;
        pushSchoolOsToast({
          kind: "error",
          message:
            "Stopped a save that would have cleared your cloud workspace. Reload the page; if this repeats, contact support before deleting data."
        });
      }
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
      return;
    }

    this.loadFootprint = workspaceDataFootprint(state);
    if (!isWorkspaceDataEmpty(state)) {
      this.emptyWriteGuardUntil = 0;
    }
  }
}
