"use client";

import { SearchModal } from "@/components/search-modal";
import type { SearchResult } from "@/lib/types";

export function SchoolOsSearchOverlay({
  open,
  query,
  onQueryChange,
  results,
  onClose,
  onJump
}: {
  open: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  results: SearchResult[];
  onClose: () => void;
  onJump: (result: SearchResult) => void;
}) {
  if (!open) return null;
  return <SearchModal query={query} setQuery={onQueryChange} results={results} onClose={onClose} onJump={onJump} />;
}
