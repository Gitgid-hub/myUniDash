import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const MAX_INPUT_CHARS = 40_000;
const MAX_OUTPUT_TASKS = 60;

type ParsePlanBody = {
  sourceText?: string;
};

type ParsedTask = {
  title: string;
  description?: string;
  dueAt?: string | null;
  priority?: "low" | "medium" | "high" | "urgent";
  phase?: string;
};

async function getUserIdFromRequest(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  const supabase = getServiceSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

function normalizePriority(value: unknown): ParsedTask["priority"] {
  if (typeof value !== "string") return undefined;
  const token = value.toLowerCase();
  if (token === "low" || token === "medium" || token === "high" || token === "urgent") return token;
  return undefined;
}

function normalizeDueAt(value: unknown, now: Date): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  // Always keep imported task dates in an updated/upcoming year.
  const adjusted = new Date(parsed.getTime());
  let safety = 0;
  while (adjusted.getTime() < now.getTime() && safety < 10) {
    adjusted.setFullYear(adjusted.getFullYear() + 1);
    safety += 1;
  }
  return adjusted.toISOString();
}

function normalizeTasks(raw: unknown, now: Date): ParsedTask[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedTask[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    if (!title) continue;
    const description = typeof obj.description === "string" ? obj.description.trim() : "";
    const phase = typeof obj.phase === "string" ? obj.phase.trim() : "";
    const dueAt = normalizeDueAt(obj.dueAt, now);
    out.push({
      title,
      description: description || undefined,
      dueAt: dueAt === undefined ? null : dueAt,
      priority: normalizePriority(obj.priority),
      phase: phase || undefined
    });
    if (out.length >= MAX_OUTPUT_TASKS) break;
  }
  return out;
}

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "OpenAI is not configured. Add OPENAI_API_KEY to your environment." }, { status: 503 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const body = json as ParsePlanBody;
  const sourceText = typeof body.sourceText === "string" ? body.sourceText.trim() : "";
  if (!sourceText) {
    return NextResponse.json({ error: "Plan text is required." }, { status: 400 });
  }
  const clipped = sourceText.length > MAX_INPUT_CHARS ? sourceText.slice(0, MAX_INPUT_CHARS) : sourceText;
  const now = new Date();

  const system = `You convert study/project plans into clean task JSON.
Return ONLY valid JSON. No markdown or prose.
Output schema:
{
  "tasks": [
    {
      "title": "string",
      "description": "string optional",
      "dueAt": "ISO-8601 datetime with timezone OR null",
      "priority": "low|medium|high|urgent",
      "phase": "string optional"
    }
  ]
}
Rules:
- Extract concrete actionable tasks only.
- Keep titles concise.
- If due date is missing/ambiguous, use null.
- If year is missing or seems stale, use the upcoming/current year rather than past years.
- Map urgency markers (🔴/🟡/🟢 etc.) to priority when possible.
- Never return more than ${MAX_OUTPUT_TASKS} tasks.`;

  try {
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: clipped }
        ]
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return NextResponse.json({ error: errText.slice(0, 500) || "Upstream AI parse failed." }, { status: 502 });
    }

    const data = (await upstream.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) {
      return NextResponse.json({ error: "Empty response from model." }, { status: 502 });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: "Could not parse AI response JSON." }, { status: 502 });
    }
    const tasks = normalizeTasks((parsed as Record<string, unknown>).tasks, now);
    return NextResponse.json({ tasks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
