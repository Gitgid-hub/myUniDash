import { softCourseStyle } from "@/lib/calendar-utils";
import type { WorkBlock } from "@/lib/types";

export interface WorkBlockDragInfo {
  id: string;
  durationMinutes: number;
  startMinutes: number;
  endMinutes: number;
  dateKey: string;
}

export interface WorkBlockCardProps {
  block: WorkBlock;
  top: number;
  height: number;
  startMinutes: number;
  endMinutes: number;
  color: string;
  linkedTaskTitle: string | undefined;
  minAllowedMinutes: number;
  timelineMaxMinutes: number;
  dateKey: string;
  variant: "week" | "day";
  onDragStart: (info: WorkBlockDragInfo) => void;
  onDoubleClick: (id: string) => void;
  onResizeEdge: (edge: "start" | "end", startMinutes: number, endMinutes: number) => void;
}

export function WorkBlockCard({
  block,
  top,
  height,
  startMinutes,
  endMinutes,
  color,
  linkedTaskTitle,
  minAllowedMinutes,
  timelineMaxMinutes,
  dateKey,
  variant,
  onDragStart,
  onDoubleClick,
  onResizeEdge
}: WorkBlockCardProps) {
  const isCompactBlock = height < 68;
  const isWeek = variant === "week";

  const positionStyle = isWeek
    ? { left: "8px", right: "8px", width: undefined as string | undefined }
    : { left: "10px", width: "calc(100% - 20px)", right: undefined as string | undefined };

  const roundedClass = isWeek ? "rounded-2xl" : "rounded-[22px]";
  const shadowClass = isWeek
    ? "shadow-[0_10px_24px_rgba(15,23,42,0.08)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.25)]"
    : "shadow-[0_10px_28px_rgba(15,23,42,0.08)]";
  const zClass = isWeek ? "z-[11]" : "";

  return (
    <button
      key={isWeek ? `wb-${block.id}` : block.id}
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (minAllowedMinutes >= timelineMaxMinutes) return;
        onDragStart({ id: block.id, durationMinutes: endMinutes - startMinutes, startMinutes, endMinutes, dateKey });
      }}
      onDoubleClick={() => onDoubleClick(block.id)}
      className={`absolute flex min-h-0 min-w-0 flex-col gap-0.5 overflow-hidden ${roundedClass} border text-start text-xs ${shadowClass} ${zClass} ${
        isCompactBlock ? "px-3 py-1.5" : isWeek ? "px-3 py-2" : "px-4 py-3"
      }`}
      style={{
        ...softCourseStyle(color),
        top,
        height,
        borderColor: `${color}55`,
        ...positionStyle
      }}
    >
      <p className={`min-w-0 max-w-full break-words font-semibold leading-tight text-slate-900 line-clamp-2 dark:text-white ${
        isCompactBlock ? (isWeek ? "text-[11px]" : "text-xs") : isWeek ? "text-xs" : "text-sm"
      }`}>
        {linkedTaskTitle ?? block.titleSnapshot ?? "Work block"}
      </p>
      <p dir="ltr" className={`min-w-0 max-w-full leading-tight text-slate-600 dark:text-white/90 ${
        isCompactBlock ? (isWeek ? "text-[10px]" : "text-[11px]") : isWeek ? "text-[11px]" : "text-xs"
      } ${isCompactBlock ? "" : "mt-0.5"}`}>
        {new Date(block.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        {" - "}
        {new Date(block.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </p>

      {/* Top resize handle */}
      <span
        className={`absolute left-3 right-3 top-0.5 cursor-ns-resize rounded-full bg-white/20 opacity-0 transition-opacity hover:opacity-100 ${isCompactBlock ? "h-1" : "h-1.5"}`}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (minAllowedMinutes >= timelineMaxMinutes) return;
          onResizeEdge("start", startMinutes, endMinutes);
        }}
      />

      {/* Bottom resize handle */}
      <span
        className={`absolute left-3 right-3 bottom-0.5 cursor-ns-resize rounded-full bg-white/20 opacity-0 transition-opacity hover:opacity-100 ${isCompactBlock ? "h-1" : "h-1.5"}`}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (minAllowedMinutes >= timelineMaxMinutes) return;
          onResizeEdge("end", startMinutes, endMinutes);
        }}
      />
    </button>
  );
}
