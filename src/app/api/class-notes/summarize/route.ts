import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_INPUT_CHARS = 120_000;

/** Turn OpenAI error JSON/text into a short user-facing string (Hebrew where we map known codes). */
function formatOpenAiUpstreamError(status: number, errText: string): string {
  const raw = errText.trim();
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; code?: string; type?: string };
    };
    const code = parsed.error?.code ?? parsed.error?.type;
    const msg = typeof parsed.error?.message === "string" ? parsed.error.message : "";

    if (code === "insufficient_quota" || parsed.error?.type === "insufficient_quota") {
      return "אין מספיק יתרה/מכסה בחשבון OpenAI. הוסיפו אמצעי תשלום או טעינת קרדיט בהגדרות החיוב (platform.openai.com → Billing).";
    }
    if (status === 401 || code === "invalid_api_key") {
      return "מפתח ה־API של OpenAI לא תקין או פג תוקף.";
    }
    if (status === 429 && (code === "rate_limit_exceeded" || msg.toLowerCase().includes("rate limit"))) {
      return "הגעתם למגבלת קצב בקשות. נסו שוב בעוד דקה.";
    }
    if (msg && msg.length <= 500) {
      return msg;
    }
  } catch {
    /* not JSON */
  }
  return raw.slice(0, 400) || `שגיאת OpenAI (${status})`;
}

type SummarizeBody = {
  sourceText?: string;
  noteTitle?: string;
  courseName?: string;
};

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

  const body = json as SummarizeBody;
  const raw = typeof body.sourceText === "string" ? body.sourceText : "";
  const noteTitle = typeof body.noteTitle === "string" ? body.noteTitle : "";
  const courseName = typeof body.courseName === "string" ? body.courseName : "";

  const sourceText = raw.replace(/\u0000/g, "").trim();
  if (!sourceText) {
    return NextResponse.json({ error: "No source text to summarize." }, { status: 400 });
  }

  const truncated =
    sourceText.length > MAX_INPUT_CHARS ? `${sourceText.slice(0, MAX_INPUT_CHARS)}\n\n[…נחתך…]` : sourceText;

  const system = `אתה עוזר אקדמי לסטודנטים בישראל. קיבלת טקסט שחולץ ממצגת או מסמך הוראה.
חוקים חשובים:
- כתוב את כל הפלט בעברית בלבד.
- החזר רק HTML תקני, בלי הסבר לפני או אחרי, בלי fences של markdown.
- מותרות התגיות בלבד: p, ul, ol, li, strong, em, br, hr — בלי style, בלי class, בלי script, בלי קישורים חיצוניים.
- אל תחזיר כותרת "סיכום" או שורות שחוזרות על שם הקורס/כותרת ההערה — התחל ישר בתוכן האקדמי.
- ארגן את רוב התוכן כרשימת תבליטים: <ul dir="rtl"><li><p dir="rtl">…</p></li></ul>. כל נקודה עיקרית היא li משלה עם p בתוךה. אפשר ul מקונן לתתי־נקודות כשיש פירוט.
- כוון ל־12–22 נקודות עיקריות כשהחומר מאפשר; אם המקור ארוך — כיסוי רחב יותר עדיפה על פני משפט אחד כללי.
- הוסף dir="rtl" ל־p, ל־ul ול־ol.
- כלול הגדרות, מונחי מפתח, שלבי תהליך, והבחנות חשובות לבחינה — לא רק כותרות פרק.`;

  const user = `הקשר (לשימושך בלבד — אל תעתיק לפלט): כותרת הערה: ${noteTitle || "(ללא)"}; שם קורס: ${courseName || "(לא צוין)"}.

להלן הטקסט שחולץ מהקובץ. נתח, ארגן, וסכם לעריכה כהערת שיעור:

---
${truncated}
---`;

  try {
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.35,
        max_tokens: 4096,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      const error = formatOpenAiUpstreamError(upstream.status, errText);
      return NextResponse.json({ error }, { status: 502 });
    }

    const data = (await upstream.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    let html = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!html) {
      return NextResponse.json({ error: "Empty response from model." }, { status: 502 });
    }
    if (html.startsWith("```")) {
      html = html.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "").trim();
    }

    return NextResponse.json({ html });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
