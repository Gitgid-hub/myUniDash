"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Button, Panel } from "@/components/ui";
import { pushSchoolOsToast } from "@/lib/global-app-toasts";

export function CalendarSyncModal({
  open,
  onClose,
  appOrigin,
  calendarFeedToken,
  cloudSignedIn,
  onRotateFeedToken,
  onDownloadIcs
}: {
  open: boolean;
  onClose: () => void;
  appOrigin: string;
  calendarFeedToken?: string;
  cloudSignedIn: boolean;
  onRotateFeedToken: () => void;
  onDownloadIcs: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const httpsUrl =
    appOrigin && calendarFeedToken
      ? `${appOrigin}/api/calendar/sessions?token=${encodeURIComponent(calendarFeedToken)}`
      : "";
  const webcalUrl = httpsUrl ? httpsUrl.replace(/^https:/i, "webcal:") : "";

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      pushSchoolOsToast({ kind: "success", message: `${label} copied to clipboard.` });
    } catch {
      pushSchoolOsToast({ kind: "error", message: "Could not copy — select the link and copy manually." });
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <Panel
        className="relative w-full max-w-lg overflow-hidden p-0 shadow-[0_24px_80px_rgba(15,23,42,0.2)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-sync-title"
      >
        <div className="border-b border-slate-200/80 px-6 py-5 dark:border-white/10">
          <h2 id="calendar-sync-title" className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Apple Calendar and other apps
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Apple does not offer a third-party API to push events into Calendar directly. The usual approach is a{" "}
            <strong className="font-medium text-slate-800 dark:text-slate-200">subscription</strong> URL: you add it once in
            Calendar, and the app refreshes your class sessions in the background (timing depends on Apple).
          </p>
        </div>
        <div className="space-y-4 px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
          {cloudSignedIn && httpsUrl ? (
            <>
              <p className="text-xs leading-relaxed text-amber-800/90 dark:text-amber-200/90">
                Treat the link like a password: anyone who has it can see your class titles and times. Use &quot;New
                link&quot; if it leaks.
              </p>
              <div>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-500">
                  Subscribe (recommended)
                </p>
                <p className="mb-2 text-xs leading-relaxed">
                  macOS: Calendar → File → New Calendar Subscription… → paste the HTTPS or webcal link. iPhone: Settings →
                  Calendar → Accounts → Add Subscribed Calendar.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" type="button" className="text-xs" onClick={() => void copy("Subscription URL", httpsUrl)}>
                    Copy HTTPS link
                  </Button>
                  <Button variant="outline" type="button" className="text-xs" onClick={() => void copy("Webcal URL", webcalUrl)}>
                    Copy webcal link
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    className="text-xs"
                    onClick={() => {
                      window.location.href = webcalUrl;
                    }}
                  >
                    Open webcal
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm">
              {cloudSignedIn
                ? "Preparing your subscription link… open this dialog again in a moment after the app saves."
                : "Sign in with cloud sync enabled to get a live subscription link. Until then, use a one-time file export below."}
            </p>
          )}
          <div className="border-t border-slate-200/80 pt-4 dark:border-white/10">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-500">
              One-time import
            </p>
            <p className="mb-2 text-xs leading-relaxed">
              Downloads an .ics file you can open with File → Import in Apple Calendar. Good for offline-only use; it does not
              auto-update when you edit courses.
            </p>
            <Button variant="outline" type="button" className="text-xs" onClick={onDownloadIcs}>
              Download .ics now
            </Button>
          </div>
          {cloudSignedIn ? (
            <div className="border-t border-slate-200/80 pt-4 dark:border-white/10">
              <Button
                variant="outline"
                type="button"
                className="text-xs text-slate-600 dark:text-slate-400"
                onClick={() => {
                  onRotateFeedToken();
                  pushSchoolOsToast({
                    kind: "success",
                    message: "New subscription link created. Remove the old calendar subscription in Apple Calendar if you had one."
                  });
                }}
              >
                New link (invalidate old subscription)
              </Button>
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 bg-slate-50/80 px-6 py-4 dark:bg-white/[0.02]">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </Panel>
    </div>,
    document.body
  );
}
