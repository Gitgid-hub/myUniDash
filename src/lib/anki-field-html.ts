import DOMPurify from "isomorphic-dompurify";

/** Strip unsafe markup from model-produced Anki fields (RTL/LTR wrappers only + basic emphasis). */
export function sanitizeAnkiCardField(html: string): string {
  return DOMPurify.sanitize(html.trim(), {
    ALLOWED_TAGS: ["div", "span", "br", "strong", "em", "b", "i"],
    ALLOWED_ATTR: ["dir"]
  });
}
