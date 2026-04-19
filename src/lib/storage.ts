import type { SchoolState, Store } from "@/lib/types";
import { createSeedState } from "@/lib/seed";

const STORAGE_KEY = "school-os:v3";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export class LocalStorageStore implements Store {
  async getState(): Promise<SchoolState> {
    if (!canUseStorage()) {
      return createSeedState();
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createSeedState();
      await this.setState(initial);
      return initial;
    }

    try {
      const parsed = JSON.parse(raw) as SchoolState;
      return parsed;
    } catch {
      const fallback = createSeedState();
      await this.setState(fallback);
      return fallback;
    }
  }

  async setState(state: SchoolState): Promise<void> {
    if (!canUseStorage()) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}
