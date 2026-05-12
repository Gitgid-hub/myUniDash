"use client";

import { Trash2 } from "lucide-react";
import type { FeatureRequestItem } from "@/lib/feature-request-item";
import { Button, Panel } from "@/components/ui";

export function UserRequestsAdminView({
  gitSyncStatus,
  adminRequestsError,
  adminRequestsLoading,
  visibleAdminFeatureRequests,
  doneFeatureRequestMap,
  onToggleDoneForRequest,
  onDeleteRequest,
  deletingRequestId,
  onRefresh,
  onOpenScreenshot
}: {
  gitSyncStatus: { available: boolean; clean: boolean; ahead: number; checking: boolean };
  adminRequestsError: string | null;
  adminRequestsLoading: boolean;
  visibleAdminFeatureRequests: FeatureRequestItem[];
  doneFeatureRequestMap: Record<string, string>;
  onToggleDoneForRequest: (requestId: number) => void;
  onDeleteRequest: (requestId: number) => void;
  deletingRequestId: number | null;
  onRefresh: () => void;
  onOpenScreenshot: (shot: { dataUrl: string; alt: string }) => void;
}) {
  return (
    <Panel className="bg-white/90 dark:bg-[#101317]/90">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight">User feature requests</h3>
        <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => void onRefresh()} disabled={adminRequestsLoading}>
          {adminRequestsLoading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>
      <div className="mb-3 rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
        {gitSyncStatus.available
          ? (gitSyncStatus.clean && gitSyncStatus.ahead === 0
              ? "Git sync status: committed and pushed. Done requests are auto-hidden."
              : `Git sync status: waiting for commit/push (clean: ${gitSyncStatus.clean ? "yes" : "no"}, ahead: ${gitSyncStatus.ahead}).`)
          : (gitSyncStatus.checking ? "Checking git sync status..." : "Git sync status unavailable in this environment.")}
      </div>
      {adminRequestsError && (
        <div className="mb-3 rounded-xl border border-rose-200/70 bg-rose-50/80 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {adminRequestsError}
        </div>
      )}
      <div className="max-h-[74vh] space-y-3 overflow-auto pr-1">
        {(() => {
          if (adminRequestsLoading && visibleAdminFeatureRequests.length === 0) {
            return <p className="text-sm text-slate-500 dark:text-slate-400">Loading requests...</p>;
          }
          if (visibleAdminFeatureRequests.length === 0) {
            return <p className="text-sm text-slate-500 dark:text-slate-400">No user requests pending.</p>;
          }
          return visibleAdminFeatureRequests.map((request) => {
            const requestKey = String(request.id);
            const isDone = Boolean(doneFeatureRequestMap[requestKey]);
            return (
              <article key={request.id} className="rounded-2xl border border-slate-200/80 p-3.5 dark:border-white/10">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {request.user_email} · {new Date(request.created_at).toLocaleString()}
                  </p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onToggleDoneForRequest(request.id)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                        isDone
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-white/20 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
                      }`}
                    >
                      {isDone ? "Done" : "Mark done"}
                    </button>
                    <button
                      type="button"
                      aria-label="Delete request"
                      onClick={() => void onDeleteRequest(request.id)}
                      disabled={deletingRequestId === request.id}
                      className="rounded-md p-1.5 text-rose-500 transition hover:bg-rose-100/70 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    >
                      <Trash2 className={`h-3.5 w-3.5 ${deletingRequestId === request.id ? "animate-pulse" : ""}`} />
                    </button>
                  </div>
                </div>
                {isDone ? (
                  <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                    Waiting for git commit + push before auto-hiding.
                  </p>
                ) : null}
                <p dir="auto" className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-slate-800 dark:text-slate-100">
                  {request.message}
                </p>
                {request.screenshots?.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {request.screenshots.map((shot, idx) => (
                      <button
                        key={`${request.id}-${idx}`}
                        type="button"
                        onClick={() => onOpenScreenshot({ dataUrl: shot.dataUrl, alt: shot.name || `screenshot ${idx + 1}` })}
                        className="overflow-hidden rounded-xl border border-slate-200/80 text-left transition hover:ring-2 hover:ring-slate-300 dark:border-white/10 dark:hover:ring-white/30"
                      >
                        <img src={shot.dataUrl} alt={shot.name || "feature request screenshot"} className="h-28 w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          });
        })()}
      </div>
    </Panel>
  );
}
