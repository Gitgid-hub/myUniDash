/** Split `YYYY-MM-DDTHH:mm` (datetime-local) into parts. */
export function splitLocalDateTimeValue(value: string): {
  date: string;
  hour: string;
  minute: string;
} {
  if (!value) {
    return { date: "", hour: "09", minute: "00" };
  }
  const [datePart, timePart = "09:00"] = value.split("T");
  const [hourRaw = "09", minuteRaw = "00"] = timePart.split(":");
  const hour = String(Math.min(23, Math.max(0, Number(hourRaw) || 0))).padStart(2, "0");
  const minute = String(Math.min(59, Math.max(0, Number(minuteRaw) || 0))).padStart(2, "0");
  return { date: datePart ?? "", hour, minute };
}

export function joinLocalDateTimeValue(date: string, hour: string, minute: string): string {
  if (!date) return "";
  return `${date}T${hour}:${minute}`;
}

export const LOCAL_HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
export const LOCAL_MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
