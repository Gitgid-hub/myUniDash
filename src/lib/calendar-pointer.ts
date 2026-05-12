/** `data-week-column` value (YYYY-MM-DD) under the pointer, for week-view work blocks. */
export function resolveWeekColumnKeyFromPoint(clientX: number, clientY: number): string | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const node of stack) {
    if (!(node instanceof HTMLElement)) continue;
    const host = node.closest("[data-week-column]");
    if (host instanceof HTMLElement && host.dataset.weekColumn) {
      return host.dataset.weekColumn;
    }
  }
  return null;
}

export function getCurrentTimePosition(now: Date, hourStart: number, hourEnd: number, hourHeight = 80): number | null {
  const value = now.getHours() + now.getMinutes() / 60;
  if (value < hourStart || value > hourEnd) return null;
  return (value - hourStart) * hourHeight;
}
