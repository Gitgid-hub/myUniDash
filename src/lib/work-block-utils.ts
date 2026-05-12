import type { WorkBlock } from "@/lib/types";

export function buildBookedBlockByTaskId(workBlocks: WorkBlock[], nowTs = Date.now()): Map<string, WorkBlock> {
  const nextFutureByTask = new Map<string, WorkBlock>();
  const latestAnyByTask = new Map<string, WorkBlock>();
  for (const block of workBlocks) {
    if (block.status !== "scheduled") continue;
    const startTs = new Date(block.startAt).getTime();
    if (Number.isNaN(startTs)) continue;

    const currentLatest = latestAnyByTask.get(block.taskId);
    if (!currentLatest || startTs > new Date(currentLatest.startAt).getTime()) {
      latestAnyByTask.set(block.taskId, block);
    }

    const endTs = new Date(block.endAt).getTime();
    if (Number.isNaN(endTs) || endTs < nowTs) continue;
    const currentFuture = nextFutureByTask.get(block.taskId);
    if (!currentFuture || startTs < new Date(currentFuture.startAt).getTime()) {
      nextFutureByTask.set(block.taskId, block);
    }
  }

  const resolved = new Map<string, WorkBlock>();
  for (const [taskId, block] of latestAnyByTask) {
    resolved.set(taskId, nextFutureByTask.get(taskId) ?? block);
  }
  return resolved;
}

export function getNextScheduledBlock(taskId: string, workBlocks: WorkBlock[]): WorkBlock | undefined {
  return buildBookedBlockByTaskId(workBlocks).get(taskId);
}

export function isTaskBlockUnderway(taskId: string, workBlocks: WorkBlock[], nowTs = Date.now()): boolean {
  return workBlocks.some((block) => {
    if (block.taskId !== taskId) return false;
    if (block.status !== "scheduled") return false;
    const start = new Date(block.startAt).getTime();
    const end = new Date(block.endAt).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) return false;
    return start <= nowTs && nowTs <= end;
  });
}
