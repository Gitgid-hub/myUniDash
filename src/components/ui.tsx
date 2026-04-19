"use client";

import clsx from "clsx";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-[28px] border p-5 transition-colors",
        "border-slate-200/80 bg-white/92 shadow-[0_18px_48px_rgba(15,23,42,0.06)] backdrop-blur-xl",
        "dark:border-white/10 dark:bg-[#0f1115]/88 dark:shadow-[0_24px_64px_rgba(0,0,0,0.28)]",
        className
      )}
      {...props}
    />
  );
}

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-tight",
        "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300",
        className
      )}
      {...props}
    />
  );
}

export function Button({
  className,
  children,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "outline"; children: ReactNode }) {
  const variantClass =
    variant === "primary"
      ? "bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      : variant === "outline"
        ? "border border-slate-200 bg-white/70 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200 dark:hover:bg-white/[0.06]"
        : "bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]";

  return (
    <button
      type={props.type ?? "button"}
      className={clsx(
        "inline-flex items-center justify-center rounded-full px-3.5 py-2 text-sm font-medium transition active:scale-[0.98]",
        variantClass,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
