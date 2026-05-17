import { NextRequest, NextResponse } from "next/server";
import {
  MAX_INPUT_CHARS,
  buildTaskParseSystemPrompt,
  callOpenAiTaskParse,
  getUserIdFromRequest
} from "@/lib/ai-task-parse-server";

export const dynamic = "force-dynamic";

type ParsePlanBody = {
  sourceText?: string;
};

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

  try {
    const tasks = await callOpenAiTaskParse(apiKey, [
      { role: "system", content: buildTaskParseSystemPrompt("plan") },
      { role: "user", content: clipped }
    ]);
    return NextResponse.json({ tasks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
