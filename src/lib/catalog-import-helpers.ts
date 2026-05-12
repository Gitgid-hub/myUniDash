import type { CatalogSearchMeeting } from "@/lib/catalog-types";
import type { CourseMeeting } from "@/lib/types";

export function dedupeLabelSegments(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return cleaned;
  const segments = cleaned
    .split(/\s*[,\-–—|]\s*/g)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const segment of segments) {
    const key = segment.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(segment);
  }
  return out.length > 0 ? out.join(" - ") : cleaned;
}

export interface ImportedMeetingChoiceOption {
  optionId: string;
  label: string;
  meetings: CatalogSearchMeeting[];
}

export interface ImportedMeetingChoiceSet {
  setId: string;
  label: string;
  options: ImportedMeetingChoiceOption[];
}

export function getImportedChoiceSetPriority(label: string): number {
  const text = label.toLowerCase();
  if (text.includes("הרצ") || text.includes("lecture") || text.includes("שיעור")) return 0;
  if (text.includes("תרג") || text.includes("tutorial") || text.includes("tirgul")) return 1;
  if (text.includes("מעב") || text.includes("lab")) return 2;
  return 3;
}

export function inferMeetingKindFromCatalogType(meetingType?: string | null): CourseMeeting["type"] {
  const text = (meetingType ?? "").toLowerCase();
  if (text.includes("תרגיל") || text.includes("tutorial")) return "tutorial";
  if (text.includes("מעבדה") || text.includes("lab")) return "lab";
  if (text.includes("office")) return "office-hours";
  return "lecture";
}
