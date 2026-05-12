export function formatDueDateOnly(dueAt?: string): string {
  if (!dueAt) return "No date";
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function toLocalDateInput(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toLocalDateTimeInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function parseNaturalDeadlineToLocalInput(raw: string): string | null {
  const text = raw
    .trim()
    .replace(/ | /g, " ")
    .replace(/[，]/g, ",")
    .replace(/\s+/g, " ");
  if (!text) return null;
  const withoutWeekdayPrefix = text.replace(/^[^\d]*?(?=\d)/, "").trim();

  const monthNamePattern = withoutWeekdayPrefix.match(
    /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})(?:,\s*|\s+)(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?$/
  );
  if (monthNamePattern) {
    const day = Number(monthNamePattern[1]);
    const monthToken = monthNamePattern[2].toLowerCase();
    const year = Number(monthNamePattern[3]);
    let hours = Number(monthNamePattern[4]);
    const minutes = Number(monthNamePattern[5]);
    const ampm = monthNamePattern[6]?.toUpperCase();
    const monthMap: Record<string, number> = {
      january: 1,
      jan: 1,
      february: 2,
      feb: 2,
      march: 3,
      mar: 3,
      april: 4,
      apr: 4,
      may: 5,
      june: 6,
      jun: 6,
      july: 7,
      jul: 7,
      august: 8,
      aug: 8,
      september: 9,
      sep: 9,
      sept: 9,
      october: 10,
      oct: 10,
      november: 11,
      nov: 11,
      december: 12,
      dec: 12
    };
    const month = monthMap[monthToken];
    if (!month) return null;
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    if (year < 1900 || day < 1 || day > 31 || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
    if (Number.isNaN(parsed.getTime())) return null;
    return toLocalDateTimeInput(parsed);
  }

  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) {
    return toLocalDateTimeInput(direct);
  }

  const slashPattern = text.match(
    /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?)?$/
  );
  if (!slashPattern) return null;

  let day = Number(slashPattern[1]);
  let month = Number(slashPattern[2]);
  const year = Number(slashPattern[3].length === 2 ? `20${slashPattern[3]}` : slashPattern[3]);
  let hours = slashPattern[4] ? Number(slashPattern[4]) : 12;
  const minutes = slashPattern[5] ? Number(slashPattern[5]) : 0;
  const ampm = slashPattern[6]?.toUpperCase();

  if (month > 12 && day <= 12) {
    const swap = day;
    day = month;
    month = swap;
  }
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31 || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (Number.isNaN(parsed.getTime())) return null;
  return toLocalDateTimeInput(parsed);
}
