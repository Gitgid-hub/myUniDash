"use client";

import clsx from "clsx";
import { useEffect } from "react";
import { Button, Panel } from "@/components/ui";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmClass = clsx(
    variant === "danger" &&
      "!bg-rose-600 !text-white hover:!bg-rose-500 dark:!bg-rose-600 dark:hover:!bg-rose-500"
  );

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onCancel}
    >
      <Panel
        className="relative w-full max-w-md overflow-hidden p-0 shadow-[0_24px_80px_rgba(15,23,42,0.2)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
      >
        <div className="border-b border-slate-200/80 px-6 py-5 dark:border-white/10">
          <h2 id="confirm-dialog-title" className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          <p id="confirm-dialog-desc" className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            {description}
          </p>
        </div>
        <div className="flex justify-end gap-2 bg-slate-50/80 px-6 py-4 dark:bg-white/[0.02]">
          <Button variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="primary" className={confirmClass} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
