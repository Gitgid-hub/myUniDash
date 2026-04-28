import { NextRequest, NextResponse } from "next/server";

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForCompare(value: string): string {
  return normalizeSpaces(value).toLowerCase();
}

function dedupeLabeledParts(value: string): string {
  const chunks = value
    .split(/\s*[-,|]\s*/g)
    .map((chunk) => normalizeSpaces(chunk))
    .filter((chunk) => chunk.length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const chunk of chunks) {
    const key = normalizeForCompare(chunk);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(chunk);
  }
  return out.length > 0 ? out.join(" - ") : normalizeSpaces(value);
}

function buildSearchTerms(rawQuery: string): string[] {
  const q = normalizeSpaces(rawQuery);
  if (!q) return [" "];
  const terms = new Set<string>([q]);

  const digitsOnly = q.replace(/[^\d]/g, "");
  if (digitsOnly.length >= 7) {
    terms.add(`${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 7)}`);
  }
  if (/^\d{3}[-\s]?\d{4}$/.test(q)) {
    const compact = q.replace(/[^\d]/g, "");
    terms.add(compact);
    terms.add(`${compact.slice(0, 3)}-${compact.slice(3, 7)}`);
    terms.add(`${compact.slice(0, 3)} ${compact.slice(3, 7)}`);
    terms.add(compact.slice(0, 3));
  }
  if (/^\d{3}$/.test(q)) {
    terms.add(`${q}-`);
  }

  // Common Hebrew variant typo: פיסיקה vs פיזיקה
  if (q.includes("סיק")) {
    terms.add(q.replaceAll("סיק", "זיק"));
  }

  return [...terms].slice(0, 6);
}

function scoreDegreeForQuery(
  degree: { roadmapCode: string; label: string; department: string; scope: string },
  query: string
): number {
  const q = query.toLowerCase();
  if (!q) return 0;
  const code = degree.roadmapCode.toLowerCase();
  const label = degree.label.toLowerCase();
  const department = degree.department.toLowerCase();
  const scope = degree.scope.toLowerCase();
  if (code === q || code.replace("-", "") === q.replace(/[-\s]/g, "")) return 1000;
  if (code.startsWith(q)) return 800;
  if (label.includes(q)) return 500;
  if (department.includes(q) || scope.includes(q)) return 300;
  return 0;
}

async function fetchHujiApi(path: string): Promise<unknown> {
  const res = await fetch(`https://shnaton.huji.ac.il/api${path}`, {
    headers: {
      "user-agent": "myUniDashDegreeSearch/1.0",
      accept: "application/json,text/plain,*/*"
    },
    cache: "no-store"
  });
  if (!res.ok) {
    throw new Error(`HUJI API ${path} failed (${res.status})`);
  }
  return await res.json();
}

async function resolveActiveYear(): Promise<number> {
  const raw = await fetchHujiApi("/reference-data/active-years");
  if (!Array.isArray(raw) || raw.length === 0) return new Date().getFullYear();
  const current = raw.find((item) => item && typeof item === "object" && (item as { current?: unknown }).current === true);
  const year = (current as { year?: unknown } | undefined)?.year;
  if (typeof year === "number" && Number.isFinite(year)) return year;
  const firstYear = (raw[0] as { year?: unknown }).year;
  return typeof firstYear === "number" && Number.isFinite(firstYear) ? firstYear : new Date().getFullYear();
}

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(500, Math.max(5, Number(request.nextUrl.searchParams.get("limit") ?? "50")));
    const activeYear = await resolveActiveYear();
    const terms = buildSearchTerms(q);

    const dedup = new Map<string, { id: string; roadmapCode: string; label: string; department: string; scope: string }>();
    for (const term of terms) {
      const params = new URLSearchParams({ name: term, year: String(activeYear) });
      const raw = await fetchHujiApi(`/yearly-roadmaps/search?${params.toString()}`);
      if (!Array.isArray(raw)) continue;
      for (const row of raw) {
        if (!row || typeof row !== "object") continue;
        const roadmapCode = asText((row as { roadmapCode?: unknown }).roadmapCode);
        if (!roadmapCode) continue;
        const roadmapName = (row as { roadmap?: { name?: { he?: unknown; en?: unknown } } }).roadmap?.name;
        const displayNameRaw = asText(roadmapName?.he) || asText(roadmapName?.en) || roadmapCode;
        const displayName = dedupeLabeledParts(displayNameRaw);
        const departmentObj = (row as { departmentName?: { he?: unknown; en?: unknown } }).departmentName;
        const scopeObj = (row as { scopeName?: { he?: unknown; en?: unknown } }).scopeName;
        const department = asText(departmentObj?.he) || asText(departmentObj?.en);
        const scope = asText(scopeObj?.he) || asText(scopeObj?.en);
        const displayNameKey = normalizeForCompare(displayName);
        const descriptorParts = [scope, department]
          .filter((part) => part.length > 0)
          .filter((part) => {
            const key = normalizeForCompare(part);
            return key.length > 0 && !displayNameKey.includes(key);
          });
        const descriptor = descriptorParts.length > 0 ? ` - ${descriptorParts.join(" · ")}` : "";
        const label = `${displayName}${descriptor} (${roadmapCode})`;
        if (!dedup.has(roadmapCode)) {
          dedup.set(roadmapCode, {
            id: roadmapCode,
            roadmapCode,
            label,
            department,
            scope
          });
        }
      }
    }

    const items = [...dedup.values()]
      .sort((a, b) => {
        const scoreDelta = scoreDegreeForQuery(b, q) - scoreDegreeForQuery(a, q);
        if (scoreDelta !== 0) return scoreDelta;
        return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
      })
      .slice(0, limit);

    return NextResponse.json({ degrees: items, activeYear });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown degree search error" },
      { status: 500 }
    );
  }
}

