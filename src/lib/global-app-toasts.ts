"use client";

export type SchoolOsToastKind = "success" | "error";

export type SchoolOsToastDetail = {
  kind: SchoolOsToastKind;
  message: string;
};

const EVENT = "school-os-toast";

export function pushSchoolOsToast(detail: SchoolOsToastDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SchoolOsToastDetail>(EVENT, { detail }));
}

export const SCHOOL_OS_TOAST_EVENT = EVENT;
