/** Emails allowed for admin-only UI and `/api/*` admin routes (must match Vercel env expectations). */
export const ADMIN_EMAILS = new Set([
  "gidon.greeblatt@gmail.com",
  "gidon.greenblatt@gmail.com",
  "gidon.greembaltt@gmail.com"
]);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.trim().toLowerCase());
}
