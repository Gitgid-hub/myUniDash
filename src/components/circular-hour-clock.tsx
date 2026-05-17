"use client";

import { useCallback, useRef, useState } from "react";

type ClockMetrics = {
  size: number;
  center: number;
  outerR: number;
  innerR: number;
  minDist: number;
  hourBtnClass: string;
  minuteBtnClass: string;
  displayClass: string;
};

const METRICS: Record<"default" | "compact", ClockMetrics> = {
  default: {
    size: 212,
    center: 106,
    outerR: 76,
    innerR: 50,
    minDist: 18,
    hourBtnClass: "h-8 w-8 text-xs",
    minuteBtnClass: "h-6 w-6 text-[10px]",
    displayClass: "text-2xl"
  },
  compact: {
    size: 156,
    center: 78,
    outerR: 56,
    innerR: 36,
    minDist: 14,
    hourBtnClass: "h-6 w-6 text-[10px]",
    minuteBtnClass: "h-5 w-5 text-[9px]",
    displayClass: "text-lg"
  }
};

function pad2(n: number): string {
  const safe = Number.isFinite(n) ? Math.min(23, Math.max(0, Math.round(n))) : 0;
  return String(safe).padStart(2, "0");
}

function hourSlotAndRing(h: number): { slot: number; ring: "outer" | "inner" } {
  if (h === 0) return { slot: 0, ring: "outer" };
  if (h <= 11) return { slot: h, ring: "outer" };
  if (h === 12) return { slot: 0, ring: "inner" };
  return { slot: h - 12, ring: "inner" };
}

function positionOnRing(slot: number, slots: number, radius: number, center: number): { x: number; y: number } {
  const angle = (slot / slots) * Math.PI * 2 - Math.PI / 2;
  return {
    x: center + radius * Math.cos(angle),
    y: center + radius * Math.sin(angle)
  };
}

function positionForHour(h: number, metrics: ClockMetrics): { x: number; y: number } {
  const { slot, ring } = hourSlotAndRing(h);
  const r = ring === "outer" ? metrics.outerR : metrics.innerR;
  return positionOnRing(slot, 12, r, metrics.center);
}

function positionForMinute(m: number, metrics: ClockMetrics): { x: number; y: number } {
  return positionOnRing(m, 60, metrics.outerR, metrics.center);
}

function hourFromPointer(clientX: number, clientY: number, rect: DOMRect, metrics: ClockMetrics): number | null {
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const dx = px - metrics.center;
  const dy = py - metrics.center;
  const dist = Math.hypot(dx, dy);
  if (dist < metrics.minDist || dist > metrics.center - 6) return null;

  let degrees = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  if (degrees < 0) degrees += 360;
  const slot = Math.round(degrees / 30) % 12;
  const midR = (metrics.outerR + metrics.innerR) / 2;
  const isInner = dist < midR;

  if (isInner) return slot === 0 ? 12 : slot + 12;
  return slot === 0 ? 0 : slot;
}

function minuteFromPointer(clientX: number, clientY: number, rect: DOMRect, metrics: ClockMetrics): number | null {
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const dx = px - metrics.center;
  const dy = py - metrics.center;
  const dist = Math.hypot(dx, dy);
  if (dist < metrics.minDist - 2 || dist > metrics.center - 4) return null;

  let degrees = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  if (degrees < 0) degrees += 360;
  return Math.round(degrees / 6) % 60;
}

function formatHourOnDial(h: number): string {
  if (h === 0) return "00";
  if (h <= 12) return String(h);
  return String(h);
}

export interface CircularHourClockProps {
  hour: string;
  minute: string;
  disabled?: boolean;
  compact?: boolean;
  onHourChange: (hour: string) => void;
  onMinuteChange: (minute: string) => void;
}

export function CircularHourClock({
  hour,
  minute,
  disabled = false,
  compact = false,
  onHourChange,
  onMinuteChange
}: CircularHourClockProps) {
  const metrics = METRICS[compact ? "compact" : "default"];
  const faceRef = useRef<HTMLDivElement>(null);
  const [dialMode, setDialMode] = useState<"hour" | "minute">("hour");
  const [pendingHour, setPendingHour] = useState<number | null>(null);
  const [hoverHour, setHoverHour] = useState<number | null>(null);
  const [hoverMinute, setHoverMinute] = useState<number | null>(null);
  const [isHoveringFace, setIsHoveringFace] = useState(false);

  const selectedHour = Number(hour);
  const selectedMinute = Number(minute);
  const activeHour = dialMode === "minute" && pendingHour !== null ? pendingHour : selectedHour;
  const previewHour = dialMode === "hour" ? (hoverHour ?? activeHour) : activeHour;
  const previewMinute = dialMode === "minute" ? (hoverMinute ?? selectedMinute) : selectedMinute;

  const handTarget =
    dialMode === "hour"
      ? positionForHour(previewHour, metrics)
      : positionForMinute(previewMinute, metrics);

  const updateHoverFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const rect = faceRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (dialMode === "hour") {
        setHoverHour(hourFromPointer(clientX, clientY, rect, metrics));
        setHoverMinute(null);
      } else {
        setHoverMinute(minuteFromPointer(clientX, clientY, rect, metrics));
        setHoverHour(null);
      }
    },
    [dialMode, metrics]
  );

  const selectHour = useCallback((h: number) => {
    setPendingHour(h);
    setDialMode("minute");
    setHoverHour(null);
    setHoverMinute(selectedMinute);
  }, [selectedMinute]);

  const selectMinute = useCallback(
    (m: number) => {
      const h = pendingHour ?? selectedHour;
      onHourChange(pad2(h));
      onMinuteChange(pad2(m));
      setPendingHour(null);
      setDialMode("hour");
      setHoverMinute(null);
    },
    [onHourChange, onMinuteChange, pendingHour, selectedHour]
  );

  const backToHour = useCallback(() => {
    setPendingHour(null);
    setDialMode("hour");
    setHoverMinute(null);
  }, []);

  return (
    <div
      className={`flex flex-col items-center gap-1.5 ${disabled ? "pointer-events-none opacity-45" : ""}`}
      role="group"
      aria-label="Time (24-hour clock)"
    >
      <div
        className="flex items-center gap-1 rounded-lg bg-slate-100/90 px-2 py-1 tabular-nums dark:bg-white/[0.06]"
        aria-live="polite"
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setDialMode("hour");
            setPendingHour(null);
            setHoverMinute(null);
          }}
          className={`min-w-[2.25ch] rounded px-0.5 text-center font-semibold tracking-tight transition-colors ${metrics.displayClass} ${
            dialMode === "hour"
              ? "bg-sky-500/15 text-sky-700 dark:text-sky-200"
              : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
          aria-label="Edit hour"
        >
          {pad2(previewHour)}
        </button>
        <span className={`font-light text-slate-400 ${metrics.displayClass}`}>:</span>
        <button
          type="button"
          disabled={disabled || dialMode !== "minute"}
          onClick={() => dialMode === "minute" && setHoverMinute(selectedMinute)}
          className={`min-w-[2.25ch] rounded px-0.5 text-center font-semibold tracking-tight transition-colors ${metrics.displayClass} ${
            dialMode === "minute"
              ? "bg-sky-500/15 text-sky-700 dark:text-sky-200"
              : "text-slate-900 dark:text-slate-100"
          }`}
          aria-label="Minute"
        >
          {pad2(previewMinute)}
        </button>
      </div>

      <p className="text-[10px] font-medium text-sky-600 dark:text-sky-300">
        {dialMode === "hour" ? "Choose hour" : `Choose minute · ${pad2(activeHour)}:--`}
      </p>

      <div
        ref={faceRef}
        className={`clock-face relative touch-none select-none ${isHoveringFace ? "clock-face--vibrate" : ""}`}
        style={{ width: metrics.size, height: metrics.size }}
        onPointerEnter={() => setIsHoveringFace(true)}
        onPointerLeave={() => {
          setIsHoveringFace(false);
          setHoverHour(null);
          setHoverMinute(null);
        }}
        onPointerMove={(event) => {
          if (disabled) return;
          updateHoverFromEvent(event.clientX, event.clientY);
        }}
        onPointerDown={(event) => {
          if (disabled) return;
          const rect = faceRef.current?.getBoundingClientRect();
          if (!rect) return;
          if (dialMode === "hour") {
            const h = hourFromPointer(event.clientX, event.clientY, rect, metrics);
            if (h !== null) selectHour(h);
          } else {
            const m = minuteFromPointer(event.clientX, event.clientY, rect, metrics);
            if (m !== null) selectMinute(m);
          }
        }}
      >
        <div className="absolute inset-0 rounded-full border border-slate-200/90 bg-slate-50/95 shadow-inner dark:border-white/10 dark:bg-[#141820]/95" />

        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${metrics.size} ${metrics.size}`} aria-hidden>
          {dialMode === "hour" ? (
            <circle
              cx={metrics.center}
              cy={metrics.center}
              r={metrics.innerR - 5}
              className="fill-none stroke-slate-200/40 dark:stroke-white/[0.05]"
              strokeWidth="1"
            />
          ) : null}
          <circle
            cx={metrics.center}
            cy={metrics.center}
            r={metrics.outerR + 8}
            className="fill-none stroke-slate-200/50 dark:stroke-white/[0.06]"
            strokeWidth="1"
          />
          <line
            x1={metrics.center}
            y1={metrics.center}
            x2={handTarget.x}
            y2={handTarget.y}
            className="stroke-sky-500/70 transition-all duration-150 dark:stroke-sky-400/80"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx={metrics.center} cy={metrics.center} r="3" className="fill-sky-500 dark:fill-sky-400" />
          <circle
            cx={handTarget.x}
            cy={handTarget.y}
            r={dialMode === "minute" ? 10 : hoverHour !== null ? 12 : 10}
            className="fill-sky-500/25 transition-all duration-150 dark:fill-sky-400/30"
          />
        </svg>

        {dialMode === "hour"
          ? Array.from({ length: 24 }, (_, h) => {
              const { x, y } = positionForHour(h, metrics);
              const isSelected = h === activeHour;
              const isHovered = h === hoverHour;
              return (
                <button
                  key={`h-${h}`}
                  type="button"
                  disabled={disabled}
                  onMouseEnter={() => setHoverHour(h)}
                  onFocus={() => setHoverHour(h)}
                  onBlur={() => setHoverHour(null)}
                  onClick={() => selectHour(h)}
                  className={`absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-medium tabular-nums transition-all duration-150 ${metrics.hourBtnClass} ${
                    isHovered
                      ? "scale-110 bg-sky-500 text-white shadow-lg shadow-sky-500/30 dark:bg-sky-400"
                      : isSelected
                        ? "bg-sky-500/20 text-sky-700 dark:bg-sky-400/25 dark:text-sky-200"
                        : "text-slate-600 hover:bg-slate-200/80 dark:text-slate-300 dark:hover:bg-white/10"
                  }`}
                  style={{ left: x, top: y }}
                  aria-label={`Hour ${pad2(h)}`}
                  aria-pressed={isSelected}
                >
                  {formatHourOnDial(h)}
                </button>
              );
            })
          : Array.from({ length: 60 }, (_, m) => {
              const { x, y } = positionForMinute(m, metrics);
              const isSelected = m === selectedMinute && pendingHour !== null;
              const isHovered = m === hoverMinute;
              const showLabel = m % 5 === 0;
              return (
                <button
                  key={`m-${m}`}
                  type="button"
                  disabled={disabled}
                  onMouseEnter={() => setHoverMinute(m)}
                  onFocus={() => setHoverMinute(m)}
                  onBlur={() => setHoverMinute(null)}
                  onClick={() => selectMinute(m)}
                  className={`absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full font-medium tabular-nums transition-all duration-150 ${metrics.minuteBtnClass} ${
                    isHovered
                      ? "scale-110 bg-sky-500 text-white shadow-lg shadow-sky-500/30 dark:bg-sky-400"
                      : isSelected
                        ? "bg-sky-500/20 text-sky-700 dark:bg-sky-400/25 dark:text-sky-200"
                        : showLabel
                          ? "text-slate-600 hover:bg-slate-200/80 dark:text-slate-300 dark:hover:bg-white/10"
                          : "text-transparent hover:bg-sky-500/20"
                  }`}
                  style={{ left: x, top: y }}
                  aria-label={`Minute ${pad2(m)}`}
                  aria-pressed={isSelected || isHovered}
                >
                  {showLabel || isHovered ? pad2(m) : ""}
                </button>
              );
            })}
      </div>

      {dialMode === "minute" ? (
        <button
          type="button"
          disabled={disabled}
          onClick={backToHour}
          className="text-[10px] text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
        >
          ← Back to hour
        </button>
      ) : (
        <p className="text-[10px] text-slate-400 dark:text-slate-500">Click hour, then minute on the dial</p>
      )}
    </div>
  );
}
