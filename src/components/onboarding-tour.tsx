"use client";

import { useEffect, useMemo, useState } from "react";
import type { OnboardingStep } from "@/lib/onboarding";

type Rect = { left: number; top: number; width: number; height: number };

export function OnboardingTour({
  active,
  step,
  stepIndex,
  totalSteps,
  onNext,
  onSkip,
  targetElement
}: {
  active: boolean;
  step: OnboardingStep | null;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
  targetElement: HTMLElement | null;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });

  useEffect(() => {
    const refreshViewport = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    refreshViewport();
    window.addEventListener("resize", refreshViewport);
    return () => window.removeEventListener("resize", refreshViewport);
  }, []);

  useEffect(() => {
    if (!active || !step || !targetElement) {
      setRect(null);
      return;
    }

    const refresh = () => {
      const r = targetElement.getBoundingClientRect();
      setRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    };

    refresh();
    targetElement.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });

    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    return () => {
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    };
  }, [active, step, targetElement]);

  const tooltipStyle = useMemo(() => {
    const width = Math.min(360, viewport.width - 24);
    const margin = 12;
    if (!rect || !step?.targetSelector) {
      return {
        left: Math.max(margin, Math.round((window.innerWidth - width) / 2)),
        top: Math.max(72, Math.round(viewport.height * 0.2)),
        width
      };
    }

    const preferred = step.placement ?? "auto";
    const rectRight = rect.left + rect.width;
    const rectBottom = rect.top + rect.height;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let left = centerX - width / 2;
    let top = rectBottom + margin;

    if (preferred === "top") top = rect.top - 180;
    if (preferred === "left") {
      left = rect.left - width - margin;
      top = centerY - 80;
    }
    if (preferred === "right") {
      left = rectRight + margin;
      top = centerY - 80;
    }
    if (preferred === "bottom") top = rectBottom + margin;

    left = Math.max(margin, Math.min(left, viewport.width - width - margin));
    top = Math.max(margin, Math.min(top, viewport.height - 220));

    return { left: Math.round(left), top: Math.round(top), width };
  }, [rect, step, viewport.height, viewport.width]);

  if (!active || !step) return null;

  const needsClick = (step.action ?? "none") === "clickTarget";
  const missingTarget = needsClick && !targetElement;

  return (
    <div className="pointer-events-none fixed inset-0 z-[700]">
      <div className="absolute inset-0 bg-black/55" />
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-2xl ring-2 ring-sky-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] transition-all duration-200"
          style={{
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12
          }}
        />
      ) : null}

      <div
        className="pointer-events-auto absolute rounded-2xl border border-slate-200/80 bg-white/95 p-4 text-slate-900 shadow-2xl backdrop-blur-sm dark:border-white/10 dark:bg-[#10141b]/95 dark:text-slate-100"
        style={tooltipStyle}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Step {Math.min(stepIndex + 1, totalSteps)} of {totalSteps}
        </p>
        <h3 className="mt-1 text-base font-semibold">{step.title}</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{step.body}</p>

        {needsClick ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {missingTarget ? "Target is not visible yet. You can continue or skip this step." : "Click the highlighted element to continue."}
          </p>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/10"
          >
            Skip onboarding
          </button>

          {!needsClick || missingTarget ? (
            <button
              type="button"
              onClick={onNext}
              className="rounded-full bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              {stepIndex >= totalSteps - 1 ? "Finish" : "Next"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
