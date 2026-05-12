"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_CATALOG_DEGREES, type CatalogDegreeOption } from "@/lib/catalog-types";
import { pushSchoolOsToast } from "@/lib/global-app-toasts";

const CATALOG_DEGREE_STORAGE_KEY = "school-os:catalog-degree:v1";

export function useCatalogDegreePicker({
  isSettingsOpen,
  isCatalogPickerOpen
}: {
  isSettingsOpen: boolean;
  isCatalogPickerOpen: boolean;
}) {
  const [catalogDegreeSearchQuery, setCatalogDegreeSearchQuery] = useState("");
  const [isCatalogDegreeOptionsOpen, setIsCatalogDegreeOptionsOpen] = useState(false);
  const [catalogDegreeSearchLoading, setCatalogDegreeSearchLoading] = useState(false);
  const [catalogDegreeOptions, setCatalogDegreeOptions] = useState<CatalogDegreeOption[]>(DEFAULT_CATALOG_DEGREES);
  const [catalogDegree, setCatalogDegree] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const saved = window.localStorage.getItem(CATALOG_DEGREE_STORAGE_KEY);
    return saved && saved.length > 0 ? saved : "";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (catalogDegree) {
      window.localStorage.setItem(CATALOG_DEGREE_STORAGE_KEY, catalogDegree);
    } else {
      window.localStorage.removeItem(CATALOG_DEGREE_STORAGE_KEY);
    }
  }, [catalogDegree]);

  const selectedCatalogDegreeOption = useMemo(
    () => catalogDegreeOptions.find((degree) => degree.id === catalogDegree) ?? null,
    [catalogDegree, catalogDegreeOptions]
  );

  const searchCatalogDegrees = useCallback(
    async (query: string) => {
      setCatalogDegreeSearchLoading(true);
      try {
        const params = new URLSearchParams();
        if (query.trim().length > 0) params.set("q", query.trim());
        params.set("limit", "200");
        const res = await fetch(`/api/catalog/degrees/search?${params.toString()}`);
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload.error ?? "Degree search failed");
        }
        const remote: unknown[] = Array.isArray(payload.degrees) ? payload.degrees : [];
        const normalized: CatalogDegreeOption[] = remote
          .map((row) => {
            if (!row || typeof row !== "object") return null;
            const rowObj = row as { roadmapCode?: unknown; label?: unknown };
            const roadmapCode = typeof rowObj.roadmapCode === "string" ? rowObj.roadmapCode.trim() : "";
            if (!roadmapCode) return null;
            const labelRaw = typeof rowObj.label === "string" ? rowObj.label.trim() : "";
            return {
              id: roadmapCode,
              roadmapCode,
              label: labelRaw || roadmapCode
            } satisfies CatalogDegreeOption;
          })
          .filter((row): row is CatalogDegreeOption => Boolean(row));
        const trimmedQuery = query.trim();
        if (trimmedQuery.length > 0) {
          setCatalogDegreeOptions(normalized);
        } else {
          setCatalogDegreeOptions(normalized);
          if (catalogDegree && !normalized.some((degree) => degree.id === catalogDegree)) {
            setCatalogDegree("");
          }
        }
      } catch (error) {
        pushSchoolOsToast({
          kind: "error",
          message: error instanceof Error ? error.message : "Degree search failed"
        });
      } finally {
        setCatalogDegreeSearchLoading(false);
      }
    },
    [catalogDegree]
  );

  useEffect(() => {
    if (!isSettingsOpen && !isCatalogPickerOpen) return;
    const trimmed = catalogDegreeSearchQuery.trim();
    if (trimmed.length === 0) {
      setCatalogDegreeOptions(DEFAULT_CATALOG_DEGREES);
      return;
    }
    void searchCatalogDegrees(catalogDegreeSearchQuery);
  }, [catalogDegreeSearchQuery, isCatalogPickerOpen, isSettingsOpen, searchCatalogDegrees]);

  return {
    catalogDegreeSearchQuery,
    setCatalogDegreeSearchQuery,
    isCatalogDegreeOptionsOpen,
    setIsCatalogDegreeOptionsOpen,
    catalogDegreeSearchLoading,
    catalogDegreeOptions,
    setCatalogDegreeOptions,
    catalogDegree,
    setCatalogDegree,
    selectedCatalogDegreeOption,
    searchCatalogDegrees
  };
}
