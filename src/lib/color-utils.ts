export const coursePalette = [
  "#22c55e",
  "#38bdf8",
  "#818cf8",
  "#a78bfa",
  "#f472b6",
  "#fb7185",
  "#f97316",
  "#f59e0b",
  "#14b8a6",
  "#06b6d4",
  "#84cc16",
  "#e879f9",
  "#ef4444",
  "#10b981",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#0ea5e9",
  "#64748b"
];

export function hexToRgb(hexColor: string): { r: number; g: number; b: number } | null {
  const hex = hexColor.replace("#", "").trim();
  const normalized = hex.length === 3 ? hex.split("").map((c) => `${c}${c}`).join("") : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

export function colorDistance(a: string, b: string): number {
  const rgbA = hexToRgb(a);
  const rgbB = hexToRgb(b);
  if (!rgbA || !rgbB) return 0;
  const dr = rgbA.r - rgbB.r;
  const dg = rgbA.g - rgbB.g;
  const db = rgbA.b - rgbB.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export function pickDistinctCourseColor(existingColors: string[]): string {
  const normalizedExisting = existingColors
    .map((color) => color.toLowerCase())
    .filter((color) => color.trim().length > 0);

  const paletteUnique = [...new Set(coursePalette.map((color) => color.toLowerCase()))];
  if (normalizedExisting.length === 0) return paletteUnique[0] ?? coursePalette[0];

  let bestColor = paletteUnique[0] ?? coursePalette[0];
  let bestScore = -1;
  for (const candidate of paletteUnique) {
    const nearestDistance = normalizedExisting.reduce((nearest, existing) => {
      const distance = colorDistance(candidate, existing);
      return Math.min(nearest, distance);
    }, Number.POSITIVE_INFINITY);
    if (nearestDistance > bestScore) {
      bestScore = nearestDistance;
      bestColor = candidate;
    }
  }
  return bestColor;
}
