/** True when live app should show coming-soon gate and enforce grants (set on Vercel: NEXT_PUBLIC_STEALTH_EARLY_ACCESS=true). */
export function isStealthEarlyAccessEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_STEALTH_EARLY_ACCESS?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function normalizeEarlyAccessEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_MAX = 320;
const MESSAGE_MAX = 2000;

export function validateEarlyAccessRequestEmail(email: string): string | null {
  const n = normalizeEarlyAccessEmail(email);
  if (!n || n.length > EMAIL_MAX) return "Enter a valid email.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(n)) return "Enter a valid email.";
  return null;
}

export function sanitizeEarlyAccessMessage(raw: string | undefined): string | null {
  if (raw == null || raw === "") return null;
  const t = raw.trim();
  if (!t) return null;
  return t.length > MESSAGE_MAX ? t.slice(0, MESSAGE_MAX) : t;
}
