export type AnalyticsEvent =
  | "view_landing"
  | "click_cta_primary"
  | "submit_waitlist"
  | "click_cta_secondary";

export type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

export function trackEvent(event: AnalyticsEvent, payload: AnalyticsPayload = {}): void {
  if (typeof window === "undefined") {
    return;
  }

  const entry = { event, payload, ts: Date.now() };

  if (process.env.NODE_ENV !== "production") {
    console.info("[analytics]", entry);
  }

  // Placeholder hook for real analytics tools.
  // Example: window.dataLayer?.push(entry)
  const scopedWindow = window as Window & { dataLayer?: Array<Record<string, unknown>> };
  scopedWindow.dataLayer?.push(entry);
}
