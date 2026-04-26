"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { createId } from "@/lib/id";
import type { SchoolOsToastDetail } from "@/lib/global-app-toasts";
import { SCHOOL_OS_TOAST_EVENT } from "@/lib/global-app-toasts";

type Toast = { id: string; kind: "success" | "error"; message: string };

export function GlobalToastHub() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const onEvt = (e: Event) => {
      const ce = e as CustomEvent<SchoolOsToastDetail>;
      const kind = ce.detail?.kind === "error" ? "error" : "success";
      const message = typeof ce.detail?.message === "string" ? ce.detail.message.trim() : "";
      if (!message) return;
      const id = createId("toast");
      setToasts((prev) => [...prev, { id, kind, message }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 6500);
    };
    window.addEventListener(SCHOOL_OS_TOAST_EVENT, onEvt as EventListener);
    return () => window.removeEventListener(SCHOOL_OS_TOAST_EVENT, onEvt as EventListener);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 end-4 z-[500] flex max-w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 p-0"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur-md",
            t.kind === "success"
              ? "border-emerald-300/50 bg-emerald-950/90 text-emerald-50 dark:border-emerald-500/35 dark:bg-emerald-950/95"
              : "border-rose-300/50 bg-rose-950/90 text-rose-50 dark:border-rose-500/35 dark:bg-rose-950/95"
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
