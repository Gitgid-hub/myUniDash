import type { CatalogCourse, CatalogMeeting } from "@/lib/catalog/types";

const HUJI_SOURCE = "huji_shnaton" as const;
const DEFAULT_LIST_URLS = [
  "https://shnaton.huji.ac.il/",
  "https://shnaton.huji.ac.il/index.php/NewSyl"
];

const DAY_MAP: Record<string, CatalogMeeting["weekday"]> = {
  א: "Sun",
  ב: "Mon",
  ג: "Tue",
  ד: "Wed",
  ה: "Thu",
  ו: "Fri",
  שבת: "Sat",
  ראשון: "Sun",
  שני: "Mon",
  שלישי: "Tue",
  רביעי: "Wed",
  חמישי: "Thu",
  שישי: "Fri",
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat"
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<string> {
  let attempt = 0;
  let lastError: unknown;
  while (attempt < maxRetries) {
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": "myUniDashCatalogBot/1.0",
          accept: "text/html,application/xhtml+xml"
        },
        cache: "no-store"
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} while fetching ${url}`);
      }
      return await res.text();
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt >= maxRetries) break;
      await delay(400 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Unknown fetch error");
}

function normalizeCourseNumber(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 4) return null;
  return digits;
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function parseCourseLinks(html: string): Array<{ href: string; courseNumber: string; title: string }> {
  const matches = Array.from(html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi));
  const out: Array<{ href: string; courseNumber: string; title: string }> = [];
  for (const match of matches) {
    const href = match[1];
    const text = decodeBasicHtmlEntities(match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    const numberMatch = text.match(/\b\d{4,8}\b/);
    if (!numberMatch) continue;
    const courseNumber = normalizeCourseNumber(numberMatch[0]);
    if (!courseNumber) continue;
    if (!href.includes("shnaton.huji.ac.il") && !href.startsWith("/") && !href.includes("NewSyl")) continue;
    out.push({ href, courseNumber, title: text });
  }
  return out;
}

function normalizeTime(raw: string): string | null {
  const m = raw.match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const hour = Math.max(0, Math.min(23, Number(m[1])));
  const minute = Math.max(0, Math.min(59, Number(m[2])));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function normalizeTimeRange(startRaw: string, endRaw: string): { start: string; end: string } | null {
  const start = normalizeTime(startRaw);
  const end = normalizeTime(endRaw);
  if (!start || !end) return null;
  // Some HUJI schedule cells in RTL can appear reversed visually/textually.
  if (timeToMinutes(end) < timeToMinutes(start)) {
    return { start: end, end: start };
  }
  return { start, end };
}

function parseMeetings(html: string): CatalogMeeting[] {
  const normalized = html.replace(/\s+/g, " ");
  const rows = Array.from(normalized.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map((m) => m[1]);
  const meetings: CatalogMeeting[] = [];
  const seen = new Set<string>();
  const pushMeeting = (meeting: CatalogMeeting) => {
    const key = `${meeting.weekday}-${meeting.startTime}-${meeting.endTime}-${meeting.meetingType ?? ""}-${meeting.location ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    meetings.push(meeting);
  };

  for (const row of rows) {
    const text = decodeBasicHtmlEntities(row.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    const dayToken = Object.keys(DAY_MAP).find((day) => new RegExp(`(?:^|\\s)${day}(?:\\s|$)`, "i").test(text));
    const timeMatches = Array.from(text.matchAll(/(\d{1,2}[:.]\d{2})/g)).map((m) => m[1]);
    if (!dayToken || timeMatches.length < 2) continue;
    const range = normalizeTimeRange(timeMatches[0], timeMatches[1]);
    if (!range) continue;
    pushMeeting({
      weekday: DAY_MAP[dayToken.toLowerCase()] ?? DAY_MAP[dayToken] ?? "Sun",
      startTime: range.start,
      endTime: range.end
    });
  }

  // Fallback parser for non-tabular schedule text like: "יום א 09:00-11:00"
  const plainText = decodeBasicHtmlEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  const dayAlternation = Object.keys(DAY_MAP)
    .sort((a, b) => b.length - a.length)
    .join("|");
  const rangeRegex = new RegExp(`(?:יום\\s*)?(${dayAlternation})[^\\d]{0,12}(\\d{1,2}[:.]\\d{2})\\s*[-–]\\s*(\\d{1,2}[:.]\\d{2})`, "gi");
  let match: RegExpExecArray | null;
  while ((match = rangeRegex.exec(plainText)) !== null) {
    const dayRaw = match[1];
    const range = normalizeTimeRange(match[2], match[3]);
    if (!range) continue;
    const weekday = DAY_MAP[dayRaw.toLowerCase()] ?? DAY_MAP[dayRaw];
    if (!weekday) continue;
    pushMeeting({ weekday, startTime: range.start, endTime: range.end });
  }
  return meetings;
}

function normalizeCourseFromDetail(
  listItem: { href: string; courseNumber: string; title: string },
  detailHtml: string
): CatalogCourse {
  const pageText = decodeBasicHtmlEntities(detailHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
  const titleCandidate = pageText.match(/(?:שם הקורס|Course Name)\s*[:\-]?\s*([^\n\r]{2,120})/i)?.[1];
  const creditsCandidate = pageText.match(/(?:נקודות|Credits?)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i)?.[1];
  const facultyCandidate = pageText.match(/(?:פקולטה|Faculty)\s*[:\-]?\s*([^\n\r]{2,80})/i)?.[1];
  const deptCandidate = pageText.match(/(?:חוג|Department)\s*[:\-]?\s*([^\n\r]{2,80})/i)?.[1];

  return {
    source: HUJI_SOURCE,
    externalId: listItem.courseNumber,
    courseNumber: listItem.courseNumber,
    nameHe: decodeBasicHtmlEntities(titleCandidate ?? listItem.title),
    faculty: decodeBasicHtmlEntities(facultyCandidate ?? "Life Sciences"),
    department: decodeBasicHtmlEntities(deptCandidate ?? "Biology"),
    credits: creditsCandidate ? Number(creditsCandidate) : undefined,
    meetings: parseMeetings(detailHtml)
  };
}

function buildUrl(href: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("/")) return `https://shnaton.huji.ac.il${href}`;
  return `https://shnaton.huji.ac.il/${href}`;
}

function extractCourseNumberFromUrl(url: string): string | null {
  const m = url.match(/(?:NewSyl\/|course=)(\d{4,8})/i);
  if (!m) return null;
  return normalizeCourseNumber(m[1]);
}

function parseTitleFromHtml(html: string): string {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = decodeBasicHtmlEntities((h1 ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  if (title.length > 0) return title;
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return decodeBasicHtmlEntities((titleTag ?? "").replace(/\s+/g, " ").trim()) || "HUJI Course";
}

export async function fetchHujiLifeSciencesCatalog(): Promise<CatalogCourse[]> {
  const configured = process.env.HUJI_LIFE_SCIENCES_URLS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const listUrls = configured.length > 0 ? configured : DEFAULT_LIST_URLS;
  const dedup = new Map<string, CatalogCourse>();

  for (const listUrl of listUrls) {
    let listHtml = "";
    try {
      listHtml = await fetchWithRetry(listUrl, 2);
    } catch {
      continue;
    }

    const links = parseCourseLinks(listHtml).slice(0, 300);
    if (links.length === 0) {
      const directCourseNumber = extractCourseNumberFromUrl(listUrl);
      if (directCourseNumber) {
        const course = normalizeCourseFromDetail(
          {
            href: listUrl,
            courseNumber: directCourseNumber,
            title: parseTitleFromHtml(listHtml)
          },
          listHtml
        );
        dedup.set(course.externalId, course);
      }
      continue;
    }

    for (const item of links) {
      if (dedup.has(item.courseNumber)) continue;
      await delay(120);
      try {
        const detailHtml = await fetchWithRetry(buildUrl(item.href), 2);
        const course = normalizeCourseFromDetail(item, detailHtml);
        dedup.set(course.externalId, course);
      } catch {
        // fallback minimal course if detail page unavailable
        dedup.set(item.courseNumber, {
          source: HUJI_SOURCE,
          externalId: item.courseNumber,
          courseNumber: item.courseNumber,
          nameHe: item.title,
          faculty: "Life Sciences",
          department: "Biology",
          meetings: []
        });
      }
    }
  }

  return [...dedup.values()];
}
