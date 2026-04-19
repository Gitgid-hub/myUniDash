import { NextResponse } from "next/server";
import type { HebcalHolidayApiItem } from "@/lib/calendar-holidays";
import { hebcalItemsToChips } from "@/lib/calendar-holidays";

export const dynamic = "force-dynamic";

type HebcalJson = {
  items?: HebcalHolidayApiItem[];
};

/**
 * Jewish holidays + Israeli civil memorial days (Hebcal), Israel schedule (`i=on`).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");
  if (!yearParam || !/^\d{4}$/.test(yearParam)) {
    return NextResponse.json({ error: "Missing or invalid `year` (YYYY)." }, { status: 400 });
  }
  const year = Number.parseInt(yearParam, 10);

  const upstream = new URL("https://www.hebcal.com/hebcal");
  upstream.searchParams.set("v", "1");
  upstream.searchParams.set("cfg", "json");
  upstream.searchParams.set("maj", "on");
  upstream.searchParams.set("min", "on");
  upstream.searchParams.set("mod", "on");
  upstream.searchParams.set("year", String(year));
  upstream.searchParams.set("month", "x");
  upstream.searchParams.set("i", "on");
  upstream.searchParams.set("c", "on");

  try {
    const res = await fetch(upstream.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Hebcal returned ${res.status}` },
        { status: 502 }
      );
    }
    const body = (await res.json()) as HebcalJson;
    const items = hebcalItemsToChips(body.items ?? []);
    return NextResponse.json({ year, items });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
