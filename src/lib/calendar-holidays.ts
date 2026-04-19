/** In-memory cache so returning to Calendar does not refetch every time. */
const holidayYearCache = new Map<number, CalendarHolidayChip[]>();

export function readCachedHolidayYear(year: number): CalendarHolidayChip[] | undefined {
  return holidayYearCache.get(year);
}

export function writeCachedHolidayYear(year: number, items: CalendarHolidayChip[]): void {
  holidayYearCache.set(year, items);
}

/** Single all-day chip for Jewish holidays / Israeli special days (Hebcal). */
export type CalendarHolidayChip = {
  id: string;
  date: string;
  label: string;
  subcat?: string;
};

export type HebcalHolidayApiItem = {
  title: string;
  date: string;
  category?: string;
  subcat?: string;
  hebrew?: string;
};

function slugId(date: string, title: string): string {
  return `${date}-${title.replace(/\s+/g, "-").slice(0, 48)}`;
}

/** Group flat Hebcal items by local calendar date key YYYY-MM-DD. */
export function indexHolidayChipsByDate(items: CalendarHolidayChip[]): Record<string, CalendarHolidayChip[]> {
  const map: Record<string, CalendarHolidayChip[]> = {};
  for (const item of items) {
    const key = item.date.slice(0, 10);
    if (!map[key]) map[key] = [];
    map[key].push(item);
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => a.label.localeCompare(b.label));
  }
  return map;
}

export function hebcalItemsToChips(raw: HebcalHolidayApiItem[]): CalendarHolidayChip[] {
  const out: CalendarHolidayChip[] = [];
  for (const item of raw) {
    if (item.category !== "holiday") continue;
    const date = item.date.slice(0, 10);
    const label = (item.hebrew && item.hebrew.trim()) || item.title;
    out.push({
      id: slugId(date, item.title),
      date,
      label,
      subcat: item.subcat
    });
  }
  return out;
}
