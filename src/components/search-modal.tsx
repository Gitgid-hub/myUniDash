"use client";

import { Search } from "lucide-react";
import { Badge, Panel } from "@/components/ui";
import type { SearchResult } from "@/lib/types";

export function SearchModal({
  query,
  setQuery,
  results,
  onClose,
  onJump
}: {
  query: string;
  setQuery: (value: string) => void;
  results: Array<SearchResult>;
  onClose: () => void;
  onJump: (result: SearchResult) => void;
}) {
  const kindLabel: Record<SearchResult["kind"], string> = {
    task: "task",
    course: "course",
    note: "note",
    feature: "feature"
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-start bg-slate-950/55 px-3 pt-20 backdrop-blur-sm" onClick={onClose}>
      <Panel className="w-full max-w-2xl bg-white/95 dark:bg-slate-950/95" onClick={(event) => event.stopPropagation()}>
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks, courses, notes, and features..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-white/10 dark:bg-white/5"
          />
        </div>
        <div className="max-h-[360px] space-y-1 overflow-auto">
          {results.map((result) => (
            <button key={`${result.kind}-${result.id}`} onClick={() => onJump(result)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/10">
              <div className="flex items-center justify-between">
                <span>{result.title}</span>
                <Badge>{kindLabel[result.kind]}</Badge>
              </div>
              <p className="text-xs text-slate-500">{result.subtitle}</p>
            </button>
          ))}
          {query && results.length === 0 && <p className="px-2 py-4 text-sm text-slate-500">No results.</p>}
        </div>
      </Panel>
    </div>
  );
}
