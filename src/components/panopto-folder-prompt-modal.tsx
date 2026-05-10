"use client";

import { useEffect, useState } from "react";
import { Button, Panel } from "@/components/ui";
import { X } from "lucide-react";

export type PanoptoFolderPromptModalProps = {
  open: boolean;
  courseName: string;
  onSave: (url: string) => void;
  onAddLater: () => void;
};

export function PanoptoFolderPromptModal({ open, courseName, onSave, onAddLater }: PanoptoFolderPromptModalProps) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (open) setUrl("");
  }, [open, courseName]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onAddLater();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onAddLater]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[65] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onClick={onAddLater}
      role="presentation"
    >
      <Panel className="w-full max-w-lg bg-white/96 p-5 dark:bg-[#101317]/96" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Link Panopto recordings</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              For <span className="font-medium text-slate-700 dark:text-slate-200">{courseName}</span> — one step so
              weekly catch-up can add the class folder to “watch recording” tasks.
            </p>
          </div>
          <Button variant="ghost" className="h-9 w-9 shrink-0 p-0" type="button" aria-label="Close" onClick={onAddLater}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <ol className="mb-4 list-decimal space-y-1.5 ps-4 text-sm text-slate-600 dark:text-slate-300">
          <li>Open Panopto in your browser and go to this course’s folder (list of recordings).</li>
          <li>Copy the full URL from the address bar.</li>
          <li>Paste it below and save — you can add or change it later under Courses → edit course.</li>
        </ol>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…panopto…/Sessions/List.aspx…"
          className="mb-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]"
          autoFocus
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" type="button" onClick={onAddLater}>
            Add later
          </Button>
          <Button
            type="button"
            onClick={() => {
              const t = url.trim();
              if (!t) return;
              onSave(t);
            }}
            disabled={!url.trim()}
          >
            Save link
          </Button>
        </div>
      </Panel>
    </div>
  );
}
