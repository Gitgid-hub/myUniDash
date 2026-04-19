import { NextResponse } from "next/server";
import { sanitizeAnkiCardField } from "@/lib/anki-field-html";
import { classNoteBodyToPlainText } from "@/lib/class-note-plain-text";

export const dynamic = "force-dynamic";

const MAX_INPUT_CHARS = 100_000;

function formatOpenAiUpstreamError(status: number, errText: string): string {
  const raw = errText.trim();
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; code?: string; type?: string } };
    const code = parsed.error?.code ?? parsed.error?.type;
    const msg = typeof parsed.error?.message === "string" ? parsed.error.message : "";
    if (code === "insufficient_quota" || parsed.error?.type === "insufficient_quota") {
      return "אין מספיק יתרה/מכסה בחשבון OpenAI.";
    }
    if (status === 401 || code === "invalid_api_key") {
      return "מפתח ה־API של OpenAI לא תקין.";
    }
    if (msg && msg.length <= 400) return msg;
  } catch {
    /* not JSON */
  }
  return raw.slice(0, 300) || `OpenAI error (${status})`;
}

type Body = {
  bodyMarkdown?: string;
  noteTitle?: string;
  courseName?: string;
  /** Class session date YYYY-MM-DD for stable tags. */
  occurredOn?: string;
};

function slugTagPart(s: string, max = 36): string {
  const t = s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, max);
  return t || "x";
}

type CardRow = { front: string; back: string; tags: string };

function parseModelCards(raw: string): CardRow[] {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  const data = JSON.parse(t) as unknown;
  if (!Array.isArray(data)) {
    throw new Error("Model did not return a JSON array.");
  }
  const rows: CardRow[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const front = sanitizeAnkiCardField(String(o.front ?? ""));
    const back = sanitizeAnkiCardField(String(o.back ?? ""));
    const tags = String(o.tags ?? "").trim();
    if (!front || !back) continue;
    rows.push({ front, back, tags: tags || "class_note" });
  }
  if (!rows.length) {
    throw new Error("No valid cards in the model response.");
  }
  return rows.slice(0, 28);
}

/** RFC 4180 CSV field; always quote when HTML may contain commas or quotes. */
function csvFieldQuoted(s: string): string {
  const t = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return `"${t.replace(/"/g, '""')}"`;
}

function rowsToCsv(rows: CardRow[]): string {
  const header = ["Front", "Back", "Tags"].map(csvFieldQuoted).join(",");
  const lines = [header];
  for (const r of rows) {
    lines.push([csvFieldQuoted(r.front), csvFieldQuoted(r.back), csvFieldQuoted(r.tags)].join(","));
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI is not configured. Add OPENAI_API_KEY to your environment." },
      { status: 503 }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const body = json as Body;
  const md = typeof body.bodyMarkdown === "string" ? body.bodyMarkdown : "";
  const noteTitle = typeof body.noteTitle === "string" ? body.noteTitle : "";
  const courseName = typeof body.courseName === "string" ? body.courseName : "";
  const occurredOn = typeof body.occurredOn === "string" ? body.occurredOn.trim() : "";

  const plain = classNoteBodyToPlainText(md).replace(/\u0000/g, "").trim();
  if (!plain) {
    return NextResponse.json({ error: "Note body is empty." }, { status: 400 });
  }

  const truncated =
    plain.length > MAX_INPUT_CHARS ? `${plain.slice(0, MAX_INPUT_CHARS)}\n\n[…truncated…]` : plain;

  const courseTag = `course::${slugTagPart(courseName || "course")}`;
  const lectureTag = `lecture::${slugTagPart(noteTitle || "lecture")}`;
  const dateTag = occurredOn ? `date::${slugTagPart(occurredOn, 12)}` : "date::unknown";

  const system = `You convert class notes into Anki flashcards for import into Anki with **Allow HTML in fields** enabled.

Output shape (machine-readable):
- Return ONLY a JSON array. No markdown code fences, no commentary before or after.
- Each element: {"front":"...","back":"...","tags":"..."} — three string keys only.

Hebrew + English / Latin / symbols in one sentence (CRITICAL for Anki RTL):
- Every "front" and every "back" MUST be HTML strings (not plain text).
- Wrap the **entire** question or answer in ONE outer wrapper: <div dir="rtl"> ... </div>
- Inside Hebrew text, wrap **each** contiguous Latin/English fragment (letters, digits, gene names like Nanog, abbreviations like PGCs, BMP, chemical symbols, English words) in: <span dir="ltr">...</span>
  Example: <div dir="rtl">מה ההבדל בין <span dir="ltr">germline</span> ל<span dir="ltr">soma</span>?</div>
- You may use <strong>, <em>, <b>, <i> inside the div when helpful. Use <br> sparingly (avoid long stacks).
- Do NOT use style= attributes, scripts, links, or any tag other than div, span, br, strong, em, b, i.

Card quality:
- Same language as the notes (usually Hebrew); keep Latin biology terms as in the source.
- One atomic fact per card; front = short question, back = short answer; answerable in well under 10 seconds.
- 12–18 cards when the source allows; fewer if short; never more than 22.
- No duplicate or near-duplicate fronts. Prefer contrasts, definitions, mechanisms, ordered steps.
- Do not invent facts outside the source.

Tags:
- "tags" is one string: space-separated Anki tags (ASCII-safe token parts).
- EVERY card must include these three tags exactly once somewhere in the string: ${courseTag} ${lectureTag} ${dateTag}
- Add more tags like topic::germ_cells or Hebrew_lecture if useful (ASCII underscores).`;

  const user = `Note title: ${noteTitle || "(untitled)"}
Course: ${courseName || "(unspecified)"}
Session date: ${occurredOn || "(unknown)"}

Required tag tokens (include all three on every row): ${courseTag} ${lectureTag} ${dateTag}

Source text:
---
${truncated}
---

Return the JSON array now.`;

  try {
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.25,
        max_tokens: 4096,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return NextResponse.json(
        { error: formatOpenAiUpstreamError(upstream.status, errText) },
        { status: 502 }
      );
    }

    const data = (await upstream.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) {
      return NextResponse.json({ error: "Empty response from model." }, { status: 502 });
    }

    let rows: CardRow[];
    try {
      rows = parseModelCards(content);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid card JSON.";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const csv = rowsToCsv(rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
