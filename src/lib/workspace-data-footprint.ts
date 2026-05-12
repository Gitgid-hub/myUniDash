import type { SchoolState } from "@/lib/types";

/** Count of user-owned rows used only for safety checks (not business logic). */
export function workspaceDataFootprint(state: SchoolState): number {
  return (
    (state.courses?.length ?? 0) +
    (state.tasks?.length ?? 0) +
    (state.workBlocks?.length ?? 0) +
    (state.classNotes?.length ?? 0) +
    (state.personalEvents?.length ?? 0)
  );
}

export function isWorkspaceDataEmpty(state: SchoolState): boolean {
  return workspaceDataFootprint(state) === 0;
}
