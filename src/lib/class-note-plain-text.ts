/**
 * Plain-text extraction for class notes — safe to import from API routes (no DOM / DOMPurify).
 */

/** Stored rich-text bodies start with HTML; legacy notes stay Markdown until edited. */
export function looksLikeStoredHtml(body: string): boolean {
  const t = body.trimStart();
  if (!t.startsWith("<")) return false;
  return /^<[a-z][\s\S]*>/i.test(t);
}

function htmlToPlainTextForExport(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Plain text for export / LLM pipelines: HTML notes → stripped text; Markdown notes → unchanged body.
 */
export function classNoteBodyToPlainText(body: string): string {
  const raw = body.trim();
  if (!raw) return "";
  if (looksLikeStoredHtml(body)) {
    return htmlToPlainTextForExport(raw);
  }
  return raw;
}
