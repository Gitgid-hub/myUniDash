"use client";

import type { ReactNode } from "react";

export function SchoolOsLayout({ sidebar, main }: { sidebar: ReactNode; main: ReactNode }) {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f8fa_0%,#f4f5f7_100%)] text-slate-900 dark:bg-[linear-gradient(180deg,#090b0d_0%,#0d1014_100%)] dark:text-slate-100">
      <div className="mx-auto grid min-h-[100dvh] max-w-[1560px] grid-cols-1 gap-5 p-5 lg:h-[100dvh] lg:overflow-hidden lg:grid-cols-[240px_minmax(0,1fr)] lg:grid-rows-1">
        <aside className="animate-fadeSlide space-y-4 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-0.5">{sidebar}</aside>
        {main}
      </div>
    </div>
  );
}
