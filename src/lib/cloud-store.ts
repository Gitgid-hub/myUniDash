"use client";

import { createSeedState } from "@/lib/seed";
import { LocalStorageStore } from "@/lib/storage";
import { getSupabaseClient } from "@/lib/supabase";
import type { SchoolState, Store } from "@/lib/types";

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
      return createSeedState();
    }

    if (data?.state) {
      return data.state as SchoolState;
    }

    // First-time cloud user: bootstrap from local storage if present.
    const localStore = new LocalStorageStore();
    const initial = await localStore.getState();
    // Do not await upsert — a hung or blocked network would strand the app on "Booting…" forever.
    void this.setState(initial).catch((err) => {
      console.error("Failed seeding cloud state from local (non-fatal):", err instanceof Error ? err.message : err);
    });
    return initial;
  }

  async setState(state: SchoolState): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) {
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
    }
  }
}
