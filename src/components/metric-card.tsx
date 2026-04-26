"use client";

import type { ComponentType } from "react";
import { Panel } from "@/components/ui";

export function MetricCard({
  title,
  value,
  icon: Icon,
  tone = "default",
  note
}: {
  title: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "default" | "warn" | "ok";
  note?: string;
}) {
  return (
    <Panel className={`bg-white/90 dark:bg-[#101317]/90 ${tone === "warn" ? "border-rose-200/80 dark:border-rose-500/20" : ""} ${tone === "ok" ? "border-emerald-200/80 dark:border-emerald-500/20" : ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
        <Icon className={`h-4 w-4 ${tone === "warn" ? "text-rose-500" : tone === "ok" ? "text-emerald-500" : "text-slate-400"}`} />
      </div>
      <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">{value}</p>
      {note && <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{note}</p>}
    </Panel>
  );
}
