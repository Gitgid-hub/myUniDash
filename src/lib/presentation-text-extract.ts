/**
 * Client-side text extraction from PDF / PPTX blobs for AI summarization.
 * (Binary files stay in IndexedDB; only extracted text is sent to the API.)
 */

function extOf(name: string): string {
  const base = name.trim().split(/[/\\]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i + 1).toLowerCase() : "";
}

async function extractPdfText(blob: Blob): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }
  const data = new Uint8Array(await blob.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item && typeof item.str === "string" ? item.str : ""))
      .join(" ");
    parts.push(line.replace(/\s+/g, " ").trim());
  }
  return parts.filter(Boolean).join("\n\n");
}

async function extractPptxText(blob: Blob): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(blob);
  const paths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => {
      const na = Number.parseInt(/slide(\d+)/i.exec(a)?.[1] ?? "0", 10);
      const nb = Number.parseInt(/slide(\d+)/i.exec(b)?.[1] ?? "0", 10);
      return na - nb;
    });
  const chunks: string[] = [];
  for (const path of paths) {
    const xml = await zip.file(path)?.async("string");
    if (!xml) continue;
    const plain = xml
      .replace(/<a:t>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    if (plain) chunks.push(plain);
  }
  return chunks.join("\n\n");
}

export async function extractTextFromPresentationFile(blob: Blob, fileName: string, mimeType: string): Promise<string> {
  const ext = extOf(fileName);
  const mime = (mimeType || "").toLowerCase();

  if (mime.includes("pdf") || ext === "pdf") {
    return extractPdfText(blob);
  }

  if (ext === "pptx" || mime.includes("presentationml.presentation")) {
    return extractPptxText(blob);
  }

  if (ext === "ppt" || mime.includes("ms-powerpoint")) {
    throw new Error("קבצי .ppt ישנים לא נתמכים לחילוץ טקסט. ייצאו PDF או PPTX ונסו שוב.");
  }

  throw new Error("סיכום AI זמין כרגע לקבצי PDF או PPTX בלבד.");
}
