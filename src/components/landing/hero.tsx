"use client";

import { ArrowRight } from "lucide-react";
import { landingCopy } from "@/lib/landing-copy";
import { trackEvent } from "@/lib/analytics";

export function Hero() {
  return (
    <section id="top" className="mx-auto w-full max-w-6xl px-4 pb-20 pt-14 sm:px-6 lg:px-8 lg:pt-20">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-400">{landingCopy.hero.eyebrow}</p>
          <h1 className="text-balance text-5xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-6xl">
            {landingCopy.hero.title}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 dark:text-slate-300">{landingCopy.hero.subtitle}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#waitlist"
              onClick={() => {
                trackEvent("click_cta_primary", { source: "hero" });
              }}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:-translate-y-0.5 hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              {landingCopy.hero.primaryCta}
            </a>
            <a
              href="#features"
              onClick={() => trackEvent("click_cta_secondary", { source: "hero" })}
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-400 dark:border-white/15 dark:bg-white/5 dark:text-slate-200"
            >
              {landingCopy.hero.secondaryCta}
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{landingCopy.hero.microcopy}</p>
        </div>

        <DashboardMock />
      </div>
    </section>
  );
}

function DashboardMock() {
  return (
    <div className="relative rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_20px_80px_rgba(2,6,23,0.12)] dark:border-white/10 dark:bg-slate-950 dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
      <div className="mb-3 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
        <div className="space-y-1.5">
          <div className="h-2.5 w-20 rounded-full bg-slate-300 dark:bg-white/20" />
          <div className="h-2 w-32 rounded-full bg-slate-200 dark:bg-white/10" />
        </div>
        <div className="h-8 w-20 rounded-full bg-sky-500/80" />
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_0.95fr]">
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
            <div className="mb-2 h-2.5 w-24 rounded-full bg-slate-300 dark:bg-white/20" />
            <div className="space-y-2">
              <MockTask tone="sky" />
              <MockTask tone="amber" />
              <MockTask tone="rose" />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
            <div className="mb-2 h-2.5 w-20 rounded-full bg-slate-300 dark:bg-white/20" />
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 28 }).map((_, index) => (
                <span key={index} className={`h-5 rounded-md ${index % 7 === 2 ? "bg-sky-400/80" : "bg-slate-200 dark:bg-white/10"}`} />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
            <div className="mb-2 h-2.5 w-28 rounded-full bg-slate-300 dark:bg-white/20" />
            <div className="space-y-2">
              <MockMetric label="Workload" value="19 pts" color="bg-sky-500/80" />
              <MockMetric label="Overdue" value="2" color="bg-rose-500/80" />
              <MockMetric label="Upcoming" value="11" color="bg-emerald-500/80" />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
            <div className="mb-2 h-2.5 w-20 rounded-full bg-slate-300 dark:bg-white/20" />
            <div className="space-y-2">
              <div className="h-9 rounded-xl bg-slate-100 dark:bg-white/5" />
              <div className="h-9 rounded-xl bg-slate-100 dark:bg-white/5" />
              <div className="h-9 rounded-xl bg-slate-100 dark:bg-white/5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MockTask({ tone }: { tone: "sky" | "amber" | "rose" }) {
  const colorMap = {
    sky: "bg-sky-500/80",
    amber: "bg-amber-500/80",
    rose: "bg-rose-500/80"
  };

  return (
    <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-2 dark:bg-white/5">
      <span className={`h-2.5 w-2.5 rounded-full ${colorMap[tone]}`} />
      <span className="h-2 w-24 rounded-full bg-slate-300 dark:bg-white/20" />
      <span className="ml-auto h-2 w-10 rounded-full bg-slate-200 dark:bg-white/10" />
    </div>
  );
}

function MockMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 dark:bg-white/5">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
        <span className={`h-2 w-2 rounded-full ${color}`} />
        {value}
      </span>
    </div>
  );
}
