import { NextRequest, NextResponse } from "next/server";
import {
  MAX_SCREENSHOT_BYTES,
  SCREENSHOT_MIME_TYPES,
  buildTaskParseSystemPrompt,
  callOpenAiTaskParse,
  getUserIdFromRequest
} from "@/lib/ai-task-parse-server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "OpenAI is not configured. Add OPENAI_API_KEY to your environment." }, { status: 503 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form with an image file." }, { status: 400 });
  }

  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Image file is required (field name: image)." }, { status: 400 });
  }
  if (!SCREENSHOT_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Use a PNG, JPEG, WebP, or GIF screenshot." }, { status: 400 });
  }
  if (file.size > MAX_SCREENSHOT_BYTES) {
    return NextResponse.json({ error: "Screenshot must be 4 MB or smaller." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type};base64,${buffer.toString("base64")}`;

  try {
    const tasks = await callOpenAiTaskParse(
      apiKey,
      [
      { role: "system", content: buildTaskParseSystemPrompt("screenshot") },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "This is a Moodle assignment page. Extract the assignment title, Due: date and time (dueDate + dueTime), and attachment filename if clearly visible. Copy Hebrew text exactly. Do not guess description text."
          },
          {
            type: "image_url",
            image_url: { url: dataUrl, detail: "high" }
          }
        ]
      }
      ],
      "screenshot"
    );
    return NextResponse.json({ tasks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
