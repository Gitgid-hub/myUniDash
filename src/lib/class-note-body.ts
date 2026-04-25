import DOMPurify from "dompurify";
import { marked } from "marked";
import { looksLikeStoredHtml } from "@/lib/class-note-plain-text";

let noteHtmlSanitizeHooksInstalled = false;

function sanitizeNoteStyleAttr(raw: string): string | null {
  const parts = raw.split(";").map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (/^font-size:\s*[\d.]+\s*(px|rem|em|%|pt)\s*$/i.test(p)) {
      out.push(p);
      continue;
    }
    if (/^text-align:\s*(left|right|center|justify)\s*$/i.test(p)) {
      out.push(p);
    }
  }
  return out.length ? out.join("; ") : null;
}

function ensureNoteHtmlSanitizeHooks(): void {
  if (noteHtmlSanitizeHooksInstalled) return;
  noteHtmlSanitizeHooksInstalled = true;
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName !== "style") return;
    const cleaned = sanitizeNoteStyleAttr(data.attrValue);
    if (!cleaned) {
      data.keepAttr = false;
    } else {
      data.attrValue = cleaned;
    }
  });
}

/** Safe HTML for class-note preview / read-only render (lists, links, inline size & alignment). */
export function sanitizeClassNoteBodyHtml(html: string): string {
  ensureNoteHtmlSanitizeHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "strike",
      "code",
      "pre",
      "blockquote",
      "ul",
      "ol",
      "li",
      "a",
      "hr",
      "span",
      "img"
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "dir", "style", "class", "data-classnote-img", "alt", "loading", "decoding"]
  });
}

export { classNoteBodyToPlainText, looksLikeStoredHtml } from "@/lib/class-note-plain-text";

export function stripHtmlToPreview(html: string): string {
  const text = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

/** TipTap expects a document; empty string becomes an empty paragraph. */
export function initialEditorHtml(body: string): string {
  const raw = body.trim();
  if (!raw) return "<p></p>";
  if (looksLikeStoredHtml(body)) return body;
  try {
    const html = marked.parse(raw, { async: false, breaks: true, gfm: true }) as string;
    return html.trim() ? html : "<p></p>";
  } catch {
    const esc = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<p>${esc}</p>`;
  }
}
