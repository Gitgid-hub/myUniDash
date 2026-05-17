"use client";

import { useEffect } from "react";
import type { ID, MainView } from "@/lib/types";

interface ShortcutHandlers {
  openSearch: () => void;
  openQuickFeedback: () => void;
  undoCalendarChange: () => void;
  undoTaskToggle: () => void;
  markFocusedDone: () => void;
  switchView: (view: MainView) => void;
  setFocusedTask: (id?: ID) => void;
  getActiveView: () => MainView;
  /** N / מ on the Kanban board: open new task (skipped when typing in a field). */
  openNewTask?: () => void;
  /** When true, skip app shortcuts so modals and text fields keep native Cmd/Ctrl behavior. */
  shouldIgnoreShortcuts?: () => boolean;
}

const VIEW_KEYS: Record<string, MainView> = {
  "1": "dashboard",
  "2": "calendar",
  "3": "class-notes",
  "4": "kanban",
  "5": "courses",
  "6": "upcoming",
  "7": "by-course",
  "8": "by-priority"
};

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (handlers.shouldIgnoreShortcuts?.()) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "u") {
        event.preventDefault();
        handlers.openQuickFeedback();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        if (typing) return;
        event.preventDefault();
        if (handlers.getActiveView() === "calendar") {
          handlers.undoCalendarChange();
        } else {
          handlers.undoTaskToggle();
        }
        return;
      }

      if (typing && !(event.metaKey || event.ctrlKey)) {
        return;
      }

      if (
        handlers.openNewTask &&
        !event.repeat &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        (event.key.toLowerCase() === "n" || event.key === "מ") &&
        handlers.getActiveView() === "kanban"
      ) {
        event.preventDefault();
        handlers.openNewTask();
        return;
      }

      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || event.key === "/") {
        event.preventDefault();
        handlers.openSearch();
        return;
      }

      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key.toLowerCase() === "x"
      ) {
        event.preventDefault();
        handlers.markFocusedDone();
        return;
      }

      if (event.key.toLowerCase() === "escape") {
        handlers.setFocusedTask(undefined);
        return;
      }

      const maybeView = VIEW_KEYS[event.key];
      if (maybeView && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        handlers.switchView(maybeView);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
